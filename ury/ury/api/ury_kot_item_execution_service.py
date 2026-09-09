"""Item-grain KOT execution service.

This module adds item-level execution rows for the existing KOT lifecycle
without changing the current `URY KOT` submit-time printing/realtime flow.
It is intentionally additive: the existing KOT-level compatibility record
(`URY KOT Execution`) is kept in sync as a derived aggregate view so older
consumers can keep reading a single row per KOT while the new item-grain
records track the real production lifecycle.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.exceptions import DuplicateEntryError

from ury.ury.api.ury_kot_execution_service import (
	IN_PREPARATION,
	QUEUED,
	READY,
	SERVED,
	ExecutionError,
	_kot_scope,
	_require_execution_doctype,
	_require_kot,
	append_audit,
)

ITEM_EXECUTION_DOCTYPE = "URY KOT Item Execution"
KOT_EXECUTION_DOCTYPE = "URY KOT Execution"
KOT_DOCTYPE = "URY KOT"
KOT_ITEMS_DOCTYPE = "URY KOT Items"

ITEM_EXECUTION_STATES = (QUEUED, IN_PREPARATION, READY, SERVED)
MANAGER_ROLES = {"URY Manager", "URY Admin", "System Manager"}
EXECUTION_ROLES = MANAGER_ROLES | {"Chef", "URY Chef", "Production Manager"}

NOT_PERMITTED = "NOT_PERMITTED"
KOT_NOT_FOUND = "KOT_NOT_FOUND"
ITEM_EXECUTION_DOCTYPE_NOT_FOUND = "ITEM_EXECUTION_DOCTYPE_NOT_FOUND"
KOT_ITEM_NOT_FOUND = "KOT_ITEM_NOT_FOUND"
INVALID_EXECUTION_TRANSITION = "INVALID_EXECUTION_TRANSITION"


class ItemExecutionError(frappe.ValidationError):
	def __init__(self, reason_code, message=None):
		self.reason_code = reason_code
		super().__init__(message or reason_code)


def _require_execution_actor(user, branch, company):
	"""Authorize mutations against server-derived role and scope."""
	if user == "Administrator":
		return
	if not set(frappe.get_roles(user)) & EXECUTION_ROLES:
		raise ItemExecutionError(NOT_PERMITTED, _("User is not permitted to execute KOT items"))
	from ury.ury.api.ury_kot_execution_service import _require_kot_branch_scope
	_require_kot_branch_scope(branch, user)
	if not company:
		raise ItemExecutionError(NOT_PERMITTED, _("KOT branch/company scope is invalid"))


def _require_item_execution_doctype():
	if not frappe.db.exists("DocType", ITEM_EXECUTION_DOCTYPE):
		raise ItemExecutionError(ITEM_EXECUTION_DOCTYPE_NOT_FOUND, _("{0} is not available on this site").format(ITEM_EXECUTION_DOCTYPE))


def _require_kot_item(kot_item):
	if not kot_item or not frappe.db.exists(KOT_ITEMS_DOCTYPE, kot_item):
		raise ItemExecutionError(KOT_ITEM_NOT_FOUND, _("KOT item {0} not found").format(kot_item))


def _kot_for_item(kot_item):
	return frappe.db.get_value(KOT_ITEMS_DOCTYPE, kot_item, "parent")


def _audit(doc, actor, event):
	append_audit(doc, actor, event=event)


def _kot_items(kot):
	doc = frappe.get_doc(KOT_DOCTYPE, kot)
	return list(doc.get("kot_items") or [])


def _execution_filter(kot_item):
	return {"kot_item": kot_item}


def _lock_item_execution_row(kot_item):
	rows = frappe.db.sql(
		f"""
		SELECT name, state, idempotency_key, started_by, started_at,
		       ready_by, ready_at, served_by, served_at, kot, kot_item
		FROM `tab{ITEM_EXECUTION_DOCTYPE}`
		WHERE kot_item = %(kot_item)s
		ORDER BY creation DESC
		LIMIT 1
		FOR UPDATE
		""",
		{"kot_item": kot_item},
		as_dict=True,
	)
	return rows[0] if rows else None


def _find_prior_result(kot_item, target_state, idempotency_key):
	rows = frappe.get_all(
		ITEM_EXECUTION_DOCTYPE,
		filters={"kot_item": kot_item, "state": target_state, "idempotency_key": idempotency_key},
		fields=[
			"name", "state", "idempotency_key", "started_by", "started_at",
			"ready_by", "ready_at", "served_by", "served_at", "kot", "kot_item",
		],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows else None


def _result_dict(row, idempotent=False):
	return {
		"name": row.get("name"),
		"kot": row.get("kot"),
		"kot_item": row.get("kot_item"),
		"state": row.get("state"),
		"idempotency_key": row.get("idempotency_key"),
		"started_by": row.get("started_by"),
		"started_at": row.get("started_at"),
		"ready_by": row.get("ready_by"),
		"ready_at": row.get("ready_at"),
		"served_by": row.get("served_by"),
		"served_at": row.get("served_at"),
		"idempotent_replay": idempotent,
	}


def _attach_ready_posting_intent(result, actor):
	if result.get("idempotent_replay"):
		return result
	from ury.ury.api.ury_fulfilment_posting_service import (
		create_or_get_posting_intent_for_ready,
		enqueue_posting_intent,
	)

	doc = frappe.get_doc(ITEM_EXECUTION_DOCTYPE, result["name"])
	intent = create_or_get_posting_intent_for_ready(doc, actor=actor)
	result["posting_intent"] = intent.get("name")
	result["posting_intent_status"] = intent.get("status")
	if intent.get("name"):
		enqueue_posting_intent(intent["name"])
	return result


def _aggregate_state(rows):
	states = [row.get("state") for row in rows]
	if not states:
		return QUEUED
	if all(state == SERVED for state in states):
		return SERVED
	if any(state in (READY, SERVED) for state in states):
		return READY
	if any(state == IN_PREPARATION for state in states):
		return IN_PREPARATION
	return QUEUED


def _sync_kot_execution(kot):
	rows = frappe.get_all(
		ITEM_EXECUTION_DOCTYPE,
		filters={"kot": kot},
		fields=["name", "state", "idempotency_key", "started_by", "started_at", "ready_by", "ready_at", "served_by", "served_at"],
		order_by="creation asc",
	)
	if not rows:
		return None
	state = _aggregate_state(rows)
	branch, company, production_unit = _kot_scope(kot)
	aggregate = frappe.get_all(
		KOT_EXECUTION_DOCTYPE,
		filters={"kot": kot},
		fields=["name", "state", "idempotency_key", "started_by", "started_at", "ready_by", "ready_at", "served_by", "served_at"],
		limit=1,
	)
	if aggregate:
		doc = frappe.get_doc(KOT_EXECUTION_DOCTYPE, aggregate[0]["name"])
	else:
		doc = frappe.get_doc({"doctype": KOT_EXECUTION_DOCTYPE, "kot": kot, "state": QUEUED, "branch": branch, "company": company, "production_unit": production_unit, "idempotency_key": rows[0].get("idempotency_key") or kot})
	doc.state = state
	doc.idempotency_key = rows[0].get("idempotency_key") or kot
	if state == SERVED:
		served = next(row for row in reversed(rows) if row.get("served_by"))
		doc.set("served_by", served.get("served_by"))
		doc.set("served_at", served.get("served_at"))
	elif state == READY:
		ready = next(row for row in reversed(rows) if row.get("ready_by"))
		doc.set("ready_by", ready.get("ready_by"))
		doc.set("ready_at", ready.get("ready_at"))
	elif state == IN_PREPARATION:
		started = next(row for row in reversed(rows) if row.get("started_by"))
		doc.set("started_by", started.get("started_by"))
		doc.set("started_at", started.get("started_at"))
	if aggregate:
		doc.save(ignore_permissions=True)
	else:
		doc.insert(ignore_permissions=True)
	return doc.as_dict()


def seed_kot_item_executions(kot, actor=None):
	"""Materialize one execution row per KOT item.

	This is idempotent and safe to call on KOT submit.
	"""
	_require_item_execution_doctype()
	_require_kot(kot)
	actor = actor or frappe.session.user
	branch, company, production_unit = _kot_scope(kot)
	created = []
	for row in _kot_items(kot):
		kot_item = row.get("name")
		_require_kot_item(kot_item)
		if frappe.db.exists(ITEM_EXECUTION_DOCTYPE, {"kot_item": kot_item}):
			continue
		frappe.db.savepoint("ury_seed_kot_item_execution")
		doc = frappe.get_doc({
			"doctype": ITEM_EXECUTION_DOCTYPE,
			"kot": kot,
			"kot_item": kot_item,
			"state": QUEUED,
			"branch": branch,
			"company": company,
			"production_unit": production_unit,
			"idempotency_key": kot_item,
		})
		_audit(doc, actor, "seed")
		try:
			doc.insert(ignore_permissions=True)
		except DuplicateEntryError:
			# A concurrent submit won the unique kot_item insert.
			frappe.db.rollback(save_point="ury_seed_kot_item_execution")
			continue
		created.append(doc.as_dict())
	_sync_kot_execution(kot)
	return created


def seed_kot_item_executions_on_submit(doc, method=None):
	"""Seed item execution rows while allowing an older site to migrate."""
	try:
		return seed_kot_item_executions(doc)
	except ItemExecutionError as exc:
		if exc.reason_code == ITEM_EXECUTION_DOCTYPE_NOT_FOUND:
			frappe.logger("ury").warning(
				"Skipping KOT item execution seed because %s is not installed yet",
				ITEM_EXECUTION_DOCTYPE,
			)
			return []
		raise


def _transition(kot_item, target_state, idempotency_key, actor_field, timestamp_field, event):
	_require_item_execution_doctype()
	_require_kot_item(kot_item)
	if not idempotency_key:
		raise ItemExecutionError(INVALID_EXECUTION_TRANSITION, _("idempotency_key is required"))
	# The actor is always the authenticated session user. Callers cannot
	# supply an actor value, which would otherwise allow false audit
	# attribution or an authorization bypass via a spoofed identity.
	actor = frappe.session.user
	kot = _kot_for_item(kot_item)
	if kot:
		branch, company, _production_unit = _kot_scope(kot)
		_require_execution_actor(actor, branch, company)
	prior = _find_prior_result(kot_item, target_state, idempotency_key)
	if prior:
		return _result_dict(prior, idempotent=True)
	locked = _lock_item_execution_row(kot_item)
	if not locked:
		raise ItemExecutionError(KOT_ITEM_NOT_FOUND, _("No execution row exists for KOT item {0}").format(kot_item))
	branch, company, _production_unit = _kot_scope(locked["kot"])
	_require_execution_actor(actor, branch, company)
	if locked["state"] == target_state:
		return _result_dict(locked, idempotent=True)
	if locked["state"] not in (QUEUED, IN_PREPARATION, READY) or (locked["state"] == QUEUED and target_state not in (IN_PREPARATION, READY)):
		raise ItemExecutionError(INVALID_EXECUTION_TRANSITION, _("Cannot transition KOT item {0} execution from {1} to {2}").format(kot_item, locked["state"], target_state))
	doc = frappe.get_doc(ITEM_EXECUTION_DOCTYPE, locked["name"])
	doc.state = target_state
	doc.idempotency_key = idempotency_key
	doc.set(actor_field, actor)
	doc.set(timestamp_field, frappe.utils.now())
	_audit(doc, actor, event)
	doc.save(ignore_permissions=True)
	_sync_kot_execution(doc.kot)
	return _result_dict(doc.as_dict(), idempotent=False)


@frappe.whitelist()
def start_item_execution(kot_item, idempotency_key):
	return _transition(kot_item, IN_PREPARATION, idempotency_key, "started_by", "started_at", "start")


@frappe.whitelist()
def mark_item_ready(kot_item, idempotency_key):
	actor = frappe.session.user
	# READY is not a valid durable state without a corresponding posting
	# intent. Keep both writes inside one savepoint so missing reservations,
	# migration drift, or enqueue failures cannot leave the item READY alone.
	savepoint = "ury_ready_posting_intent"
	frappe.db.savepoint(savepoint)
	try:
		result = _transition(kot_item, READY, idempotency_key, "ready_by", "ready_at", "mark_ready")
		return _attach_ready_posting_intent(result, actor)
	except Exception:
		frappe.db.rollback(save_point=savepoint)
		raise


@frappe.whitelist()
def serve_item_execution(kot_item, idempotency_key):
	return _transition(kot_item, SERVED, idempotency_key, "served_by", "served_at", "serve")


def get_kot_execution_state(kot):
	rows = frappe.get_all(ITEM_EXECUTION_DOCTYPE, filters={"kot": kot}, fields=["state"], order_by="creation asc")
	return _aggregate_state(rows)

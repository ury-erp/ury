"""Durable POS fulfilment stock posting service.

This is the minimal authoritative slice for V3 stock posting:

- READY creates one durable ``URY Fulfilment Posting Intent`` per KOT item.
- The worker claims intents with a row lock and short lease.
- ERPNext stock movement is a submitted Stock Entry: ``Material Issue`` for
  PRE_PRODUCED/DIRECT_RETAIL (consumes the already-made selling item), or
  ``Manufacture`` for MADE_TO_ORDER (consumes raw-material components and
  receives the selling item into the same production department warehouse).
- Reservation fulfilment happens only after the Stock Entry has submitted.
- Replays recover from an already-submitted Stock Entry instead of creating
  another one.
"""

from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import add_to_date, flt, now, now_datetime

from ury.ury.api.ury_reservation_service import FULFILLED, RESERVED, fulfil_reservation
from ury.ury.api.ury_kot_execution_service import READY, SERVED
from ury.ury.api.ury_bom_compiler import publish_component_stock_fanout


INTENT_DOCTYPE = "URY Fulfilment Posting Intent"
FULFILMENT_DOCTYPE = "URY Fulfilment Record"
RESERVATION_DOCTYPE = "URY Stock Reservation"
KOT_DOCTYPE = "URY KOT"
KOT_ITEM_DOCTYPE = "URY KOT Items"

PENDING = "PENDING"
POSTING = "POSTING"
POSTED = "POSTED"
FAILED = "FAILED"
CANCELLED = "CANCELLED"

TERMINAL_STATUSES = (POSTED, CANCELLED)
CLAIMABLE_STATUSES = (PENDING, FAILED, POSTING)
LEASE_MINUTES = 10
RETRY_MINUTES = 5
DEFAULT_MAX_ATTEMPTS = 5

PRE_PRODUCED = "PRE_PRODUCED"
MADE_TO_ORDER = "MADE_TO_ORDER"
MTO_LEGACY = "MTO"
DIRECT_RETAIL = "DIRECT_RETAIL"
READY_STATES = (READY, SERVED)
POSTING_ROLES = {"System Manager", "Stock Manager", "Production Manager", "Chef", "URY Captain"}


@contextmanager
def _service_mutation():
	"""Run only trusted posting mutations as the service principal."""
	previous_user = frappe.session.user
	frappe.set_user("Administrator")
	try:
		yield
	finally:
		frappe.set_user(previous_user)


def _authorize_posting(actor, execution_doc):
	if actor == "Administrator":
		return
	roles = set(frappe.get_roles(actor))
	if not roles.intersection(POSTING_ROLES):
		raise frappe.PermissionError(_("You are not permitted to post fulfilment stock"))
	if not frappe.has_permission(KOT_ITEM_DOCTYPE, "read", execution_doc, user=actor):
		raise frappe.PermissionError(_("You are not permitted to post this fulfilment item"))


class FulfilmentPostingError(frappe.ValidationError):
	def __init__(self, reason_code, message=None):
		self.reason_code = reason_code
		super().__init__(message or reason_code)


def _json_dumps(value):
	return json.dumps(value, sort_keys=True, default=str, separators=(",", ":"))


def _hash_payload(payload):
	return hashlib.sha256(_json_dumps(payload).encode("utf-8")).hexdigest()


def _has_doctype(doctype):
	return bool(frappe.db.exists("DocType", doctype))


def _normalise_policy(policy):
	policy = (policy or "").upper()
	if policy == MTO_LEGACY:
		return MADE_TO_ORDER
	if policy in (PRE_PRODUCED, MADE_TO_ORDER, DIRECT_RETAIL):
		return policy
	return PRE_PRODUCED


def _kot_item_doc(kot_item):
	doc = frappe.get_doc(KOT_ITEM_DOCTYPE, kot_item)
	item_code = doc.get("item") or doc.get("item_code")
	qty = flt(doc.get("quantity") or doc.get("qty"))
	if not item_code or qty <= 0:
		raise FulfilmentPostingError(
			"MISSING_KOT_ITEM_SCOPE",
			_("KOT item {0} has no item/quantity for stock posting").format(kot_item),
		)
	return doc, item_code, qty


def _kot_order_ref(kot):
	invoice = frappe.db.get_value(KOT_DOCTYPE, kot, "invoice")
	return invoice or kot


def _reservation_rows(order_ref, item_code, branch, company):
	rows = frappe.get_all(
		RESERVATION_DOCTYPE,
		filters={
			"order_ref": order_ref,
			"top_level_item": item_code,
			"branch": branch,
			"company": company,
			"status": RESERVED,
		},
		fields=[
			"name",
			"reservation_group",
			"policy",
			"warehouse",
			"top_level_item",
			"component_item",
			"qty",
			"audit_log",
		],
		order_by="creation asc",
	)
	if not rows:
		raise FulfilmentPostingError(
			"RESERVATION_NOT_FOUND",
			_("No Reserved stock reservation found for order {0}, item {1}").format(order_ref, item_code),
		)
	groups = {row.get("reservation_group") or row.get("name") for row in rows}
	if len(groups) > 1:
		raise FulfilmentPostingError(
			"AMBIGUOUS_RESERVATION_BINDING",
			_("KOT item {0} maps to multiple reservation groups; posting is blocked until the line is resolved").format(item_code),
		)
	return rows


def _reservation_audit_context(row):
	try:
		entries = json.loads(row.get("audit_log") or "[]")
	except (TypeError, ValueError) as exc:
		raise FulfilmentPostingError(
			"INVALID_RESERVATION_AUDIT_LOG",
			_("Reservation {0} has invalid audit log JSON").format(row.get("name")),
		) from exc
	for entry in reversed(entries):
		context = entry.get("frozen_context")
		if context:
			return entry, context
	raise FulfilmentPostingError(
		"ORDER_TIME_RESERVATION_CONTEXT_MISSING",
		_("Reservation {0} has no order-time frozen context").format(row.get("name")),
	)


def _reservation_snapshot(row, item_code):
	entry, context = _reservation_audit_context(row)
	policy = _normalise_policy(context.get("production_policy") or context.get("policy"))
	warehouse = context.get("warehouse")
	component_item = entry.get("component_item") or context.get("component_item")
	qty = flt(entry.get("qty") or context.get("qty"))
	if not policy or not warehouse or not component_item or qty <= 0:
		raise FulfilmentPostingError(
			"INVALID_ORDER_TIME_RESERVATION_CONTEXT",
			_("Reservation {0} has incomplete order-time frozen context").format(row.get("name")),
		)
	return {
		"reservation_ref": row.get("name"),
		"reservation_group": row.get("reservation_group"),
		"policy": policy,
		"warehouse": warehouse,
		"top_level_item": context.get("item_code") or item_code,
		"component_item": component_item,
		"qty": qty,
		"production_unit": context.get("production_unit"),
		"department": context.get("department"),
		"production_configuration": context.get("production_configuration"),
	}


def _existing_sequence_for_reservation(branch, kot, kot_item, accepted_revision, reservation_group):
	rows = frappe.get_all(
		INTENT_DOCTYPE,
		filters={
			"branch": branch,
			"kot": kot,
			"kot_item": kot_item,
			"accepted_revision": accepted_revision,
			"reservation_ref": reservation_group,
		},
		fields=["fulfilment_sequence"],
		order_by="fulfilment_sequence desc",
		limit=1,
	)
	return int(rows[0].get("fulfilment_sequence") or 0) if rows else None


def _next_fulfilment_sequence(branch, kot, kot_item, accepted_revision, reservation_group):
	existing = _existing_sequence_for_reservation(branch, kot, kot_item, accepted_revision, reservation_group)
	if existing:
		return existing
	rows = frappe.get_all(
		INTENT_DOCTYPE,
		filters={
			"branch": branch,
			"kot": kot,
			"kot_item": kot_item,
			"accepted_revision": accepted_revision,
		},
		fields=["fulfilment_sequence"],
		order_by="fulfilment_sequence desc",
		limit=1,
	)
	if not rows:
		return 1
	return int(rows[0].get("fulfilment_sequence") or 0) + 1


def _freeze_payload(execution_doc, actor):
	execution_state = execution_doc.get("state") or execution_doc.get("execution_state")
	if execution_state not in READY_STATES:
		raise FulfilmentPostingError(
			"EXECUTION_NOT_READY",
			_("KOT {0} execution state is {1}; posting requires READY or SERVED").format(
				execution_doc.kot, execution_state or "UNKNOWN"
			),
		)
	_kot_item, item_code, accepted_qty = _kot_item_doc(execution_doc.kot_item)
	order_ref = _kot_order_ref(execution_doc.kot)
	rows = _reservation_rows(order_ref, item_code, execution_doc.branch, execution_doc.company)
	snapshots = [_reservation_snapshot(row, item_code) for row in rows]
	policies = {snapshot["policy"] for snapshot in snapshots}
	if len(policies) != 1:
		raise FulfilmentPostingError(
			"MIXED_RESERVATION_POLICIES",
			_("Reserved rows for KOT item {0} do not share one frozen policy").format(execution_doc.kot_item),
		)
	policy = snapshots[0]["policy"]
	reservation_group = rows[0].get("reservation_group") or rows[0].get("name")
	components = [
		{
			"reservation_ref": snapshot["reservation_ref"],
			"reservation_group": snapshot["reservation_group"],
			"item_code": snapshot["component_item"],
			"qty": snapshot["qty"],
			"s_warehouse": snapshot["warehouse"],
		}
		for snapshot in snapshots
	]
	if policy in (PRE_PRODUCED, DIRECT_RETAIL) and len(components) > 1:
		raise FulfilmentPostingError(
			"UNEXPECTED_FINISHED_GOODS_RESERVATION",
			_("{0} fulfilment for KOT item {1} must resolve to one stock row").format(policy, execution_doc.kot_item),
		)
	accepted_revision = execution_doc.get("idempotency_key") or "current"
	fulfilment_sequence = _next_fulfilment_sequence(
		execution_doc.branch,
		execution_doc.kot,
		execution_doc.kot_item,
		accepted_revision,
		reservation_group,
	)
	payload = {
		"kot": execution_doc.kot,
		"kot_item": execution_doc.kot_item,
		"order_ref": order_ref,
		"item_code": item_code,
		"accepted_qty": accepted_qty,
		"accepted_revision": accepted_revision,
		"fulfilment_sequence": fulfilment_sequence,
		"branch": execution_doc.branch,
		"company": execution_doc.company,
		"production_unit": snapshots[0].get("production_unit") or execution_doc.get("production_unit"),
		"department": snapshots[0].get("department"),
		"production_configuration": snapshots[0].get("production_configuration"),
		"production_policy": policy,
		"reservation_group": reservation_group,
		"components": components,
		"ready_at": execution_doc.get("ready_at") or now(),
		"execution_state": execution_state,
		"actor": actor,
	}
	payload["idempotency_key"] = ":".join(
		str(part)
		for part in (
			payload["branch"],
			payload["kot"],
			payload["kot_item"],
			payload["accepted_revision"],
			payload["fulfilment_sequence"],
		)
	)
	return payload


def _intent_result(intent, idempotent=False):
	return {
		"name": intent.get("name"),
		"status": intent.get("status"),
		"idempotency_key": intent.get("idempotency_key"),
		"erpnext_stock_entry": intent.get("erpnext_stock_entry"),
		"idempotent_replay": idempotent,
	}


def create_or_get_posting_intent_for_ready(execution_doc, actor=None):
	"""Create/fetch the durable posting intent for one READY item execution."""
	if not _has_doctype(INTENT_DOCTYPE):
		raise FulfilmentPostingError("POSTING_INTENT_DOCTYPE_MISSING", _("{0} is not available").format(INTENT_DOCTYPE))

	actor = actor or frappe.session.user
	_authorize_posting(actor, execution_doc)
	payload = _freeze_payload(execution_doc, actor)
	existing_name = frappe.db.get_value(INTENT_DOCTYPE, {"idempotency_key": payload["idempotency_key"]}, "name")
	if existing_name:
		return _intent_result(frappe.get_doc(INTENT_DOCTYPE, existing_name), idempotent=True)

	doc = frappe.get_doc(
		{
			"doctype": INTENT_DOCTYPE,
			"idempotency_key": payload["idempotency_key"],
			"status": PENDING,
			"company": payload["company"],
			"branch": payload["branch"],
			"production_unit": payload.get("production_unit"),
			"production_policy": payload["production_policy"],
			"order_ref": payload["order_ref"],
			"kot": payload["kot"],
			"kot_item": payload["kot_item"],
			"accepted_revision": payload["accepted_revision"],
			"fulfilment_sequence": payload["fulfilment_sequence"],
			"accepted_qty": payload["accepted_qty"],
			"execution_state": payload["execution_state"],
			"reservation_ref": payload["reservation_group"],
			"frozen_payload_json": _json_dumps(payload),
			"frozen_payload_hash": _hash_payload(payload),
			"ready_at": payload["ready_at"],
			"actor": actor,
		}
	)
	with _service_mutation():
		doc.insert(ignore_permissions=False)
	return _intent_result(doc.as_dict(), idempotent=False)


def enqueue_posting_intent(intent_name):
	frappe.enqueue(
		"ury.ury.api.ury_fulfilment_posting_service.process_posting_intent",
		queue="short",
		enqueue_after_commit=True,
		job_id=f"ury-fulfilment-posting-{intent_name}",
		deduplicate=True,
		intent_name=intent_name,
	)


def _lock_intent(intent_name):
	rows = frappe.db.sql(
		f"""
		SELECT name, status, attempts, leased_until, erpnext_stock_entry
		FROM `tab{INTENT_DOCTYPE}`
		WHERE name = %(name)s
		FOR UPDATE
		""",
		{"name": intent_name},
		as_dict=True,
	)
	if not rows:
		raise FulfilmentPostingError("POSTING_INTENT_NOT_FOUND", _("Posting intent {0} not found").format(intent_name))
	return rows[0]


def _lease_is_fresh(row):
	leased_until = row.get("leased_until")
	return bool(leased_until and frappe.utils.get_datetime(leased_until) > now_datetime())


def _claim_intent(intent_name):
	row = _lock_intent(intent_name)
	if row.get("status") in TERMINAL_STATUSES:
		return None
	if row.get("status") == POSTING and _lease_is_fresh(row):
		return None
	if row.get("status") not in CLAIMABLE_STATUSES:
		raise FulfilmentPostingError("POSTING_INTENT_NOT_CLAIMABLE", _("Posting intent {0} is not claimable").format(intent_name))

	doc = frappe.get_doc(INTENT_DOCTYPE, intent_name)
	doc.status = POSTING
	doc.attempts = int(row.get("attempts") or 0) + 1
	doc.lease_owner = frappe.session.user
	doc.leased_until = add_to_date(now_datetime(), minutes=LEASE_MINUTES)
	doc.last_attempted_at = now()
	with _service_mutation():
		doc.save(ignore_permissions=False)
	return doc


def _payload(intent):
	payload = json.loads(intent.get("frozen_payload_json") or "{}")
	if _hash_payload(payload) != intent.get("frozen_payload_hash"):
		raise FulfilmentPostingError("FROZEN_PAYLOAD_HASH_MISMATCH", _("Posting payload hash mismatch for {0}").format(intent.name))
	return payload


def _find_existing_stock_entry(intent_name):
	"""Locking existence check for a Stock Entry already posted for `intent_name`.

	Called from `_submit_stock_entry`, which runs after `_claim_intent` has
	taken `FOR UPDATE` on the posting intent row. A plain `get_all` here is a
	different table, so it is not covered by that lock at all -- under
	MariaDB REPEATABLE READ it is served from this transaction's consistent
	read view, which can predate a Stock Entry another worker committed for
	the same intent moments ago. Missing it here means submitting a second
	Stock Entry for the same intent, i.e. a duplicate stock issue.
	`FOR UPDATE` forces this SELECT to read (and lock) the latest committed
	rows instead, on this request's own connection/transaction.

	This queries the indexed `custom_ury_posting_intent` field (an exact
	match) rather than `remarks LIKE '%...%'`. `remarks` is free text with no
	fixed format guarantee and a leading-wildcard LIKE can never use a B-tree
	index, so `FOR UPDATE` on it would lock (scan) every row of `tabStock
	Entry` -- a table that grows unboundedly -- for the rest of the
	transaction. `custom_ury_posting_intent` is set alongside `remarks` in
	`_submit_stock_entry` purely so this lookup can be an indexed equality
	lookup.
	"""
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabStock Entry`
		WHERE docstatus = 1 AND custom_ury_posting_intent = %(intent_name)s
		ORDER BY creation DESC
		LIMIT 1
		FOR UPDATE
		""",
		{"intent_name": intent_name},
		as_dict=True,
	)
	return rows[0].get("name") if rows else None


def _stock_entry_items(payload):
	items = []
	for row in payload.get("components") or []:
		if not row.get("item_code") or not row.get("s_warehouse") or flt(row.get("qty")) <= 0:
			raise FulfilmentPostingError("INVALID_STOCK_ROW", _("Frozen stock row is incomplete"))
		items.append(
			{
				"item_code": row["item_code"],
				"qty": flt(row["qty"]),
				"s_warehouse": row["s_warehouse"],
			}
		)
	if payload.get("production_policy") == MADE_TO_ORDER:
		target_warehouse = (payload.get("components") or [{}])[0].get("s_warehouse")
		if not target_warehouse or not payload.get("item_code") or flt(payload.get("accepted_qty")) <= 0:
			raise FulfilmentPostingError("INVALID_STOCK_ROW", _("Frozen stock row is incomplete"))
		items.append(
			{
				"item_code": payload["item_code"],
				"qty": flt(payload["accepted_qty"]),
				"t_warehouse": target_warehouse,
			}
		)
	return items


def _submit_stock_entry(intent, payload):
	existing = intent.get("erpnext_stock_entry") or _find_existing_stock_entry(intent.name)
	if existing:
		return existing
	is_manufacture = payload.get("production_policy") == MADE_TO_ORDER
	stock_entry_type = "Manufacture" if is_manufacture else "Material Issue"
	doc = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"company": payload["company"],
			"stock_entry_type": stock_entry_type,
			"purpose": stock_entry_type,
			"items": _stock_entry_items(payload),
			"remarks": "URY Fulfilment Posting Intent: {0}".format(intent.name),
			"custom_ury_posting_intent": intent.name,
		}
	)
	with _service_mutation():
		doc.insert(ignore_permissions=False)
		doc.submit()
	return doc.name


def _reservation_is_fulfilled(reservation_group):
	"""Locking check for whether every row in `reservation_group` is already
	FULFILLED, used to decide whether `fulfil_reservation` still needs to run.

	Runs after `_claim_intent` locked the posting intent row, but this reads
	a different table (`URY Stock Reservation`) that lock does not cover. A
	plain `get_all` can be served from this transaction's pinned consistent
	read view and miss a concurrent worker's already-committed fulfilment,
	risking a duplicate `fulfil_reservation` call. `FOR UPDATE` forces a read
	of (and lock on) the latest committed rows on this same connection.
	"""
	rows = frappe.db.sql(
		f"""
		SELECT status
		FROM `tab{RESERVATION_DOCTYPE}`
		WHERE reservation_group = %(reservation_group)s
		FOR UPDATE
		""",
		{"reservation_group": reservation_group},
		as_dict=True,
	)
	return bool(rows) and all(row.get("status") == FULFILLED for row in rows)


def _fulfil_reservation_once(reservation_group):
	if not _reservation_is_fulfilled(reservation_group):
		fulfil_reservation(reservation_group)


def _find_existing_fulfilment(payload):
	"""Locking existence check for an already-created URY Fulfilment Record,
	for the same reason as `_find_existing_stock_entry`: this table is not
	covered by `_claim_intent`'s lock on the posting intent row, so a plain
	`get_value` here can be served from this transaction's pinned consistent
	read view and miss a concurrent worker's already-committed record,
	risking a duplicate fulfilment record instead of updating the existing
	one.
	"""
	rows = frappe.db.sql(
		f"""
		SELECT name
		FROM `tab{FULFILMENT_DOCTYPE}`
		WHERE kot = %(kot)s AND item_code = %(item_code)s AND batch_key = %(batch_key)s
		ORDER BY creation DESC
		LIMIT 1
		FOR UPDATE
		""",
		{
			"kot": payload["kot"],
			"item_code": payload["item_code"],
			"batch_key": payload["idempotency_key"],
		},
		as_dict=True,
	)
	return rows[0]["name"] if rows else None


def _create_or_update_fulfilment(intent, payload, stock_entry):
	existing = intent.get("fulfilment_record") or _find_existing_fulfilment(payload)
	if existing:
		doc = frappe.get_doc(FULFILMENT_DOCTYPE, existing)
	else:
		doc = frappe.get_doc(
			{
				"doctype": FULFILMENT_DOCTYPE,
				"kot": payload["kot"],
				"item_code": payload["item_code"],
				"qty": payload["accepted_qty"],
				"reservation_ref": payload["reservation_group"],
				"fulfilment_type": MTO_LEGACY if payload["production_policy"] == MADE_TO_ORDER else payload["production_policy"],
				"batch_key": payload["idempotency_key"],
				"branch": payload["branch"],
				"company": payload["company"],
				"actor": payload.get("actor"),
				"fulfilled_at": now(),
			}
		)
	doc.posted_to_erpnext = 1
	doc.posting_reference = stock_entry
	if existing:
		with _service_mutation():
			doc.save(ignore_permissions=False)
	else:
		with _service_mutation():
			doc.insert(ignore_permissions=False)
	return doc.name


def _mark_failed(intent_name, error):
	doc = frappe.get_doc(INTENT_DOCTYPE, intent_name)
	doc.status = FAILED
	doc.last_error = str(error)
	doc.failure_class = getattr(error, "reason_code", error.__class__.__name__)
	max_attempts = int(doc.max_attempts or 0) or DEFAULT_MAX_ATTEMPTS
	if int(doc.attempts or 0) >= max_attempts:
		# Give up: this intent has exhausted its retry budget. Leave it FAILED
		# but not retryable so recover_pending_posting_intents stops
		# re-enqueuing it forever — it becomes a dead letter, visible for
		# manual intervention instead of retrying indefinitely.
		doc.retryable = 0
		doc.next_retry_at = None
	else:
		doc.retryable = 1
		doc.next_retry_at = add_to_date(now_datetime(), minutes=RETRY_MINUTES)
	doc.leased_until = None
	with _service_mutation():
		doc.save(ignore_permissions=False)
	return _intent_result(doc.as_dict(), idempotent=False)


def process_posting_intent(intent_name):
	"""Claim and post one fulfilment intent. Safe to replay."""
	intent = _claim_intent(intent_name)
	if not intent:
		return _intent_result(frappe.get_doc(INTENT_DOCTYPE, intent_name), idempotent=True)
	try:
		payload = _payload(intent)
		stock_entry = _submit_stock_entry(intent, payload)
		if not intent.get("erpnext_stock_entry"):
			intent.erpnext_stock_entry = stock_entry
			with _service_mutation():
				intent.save(ignore_permissions=False)
		with _service_mutation():
			_fulfil_reservation_once(payload["reservation_group"])

		# Emit realtime events (cheap component-level + rich fan-out) for each
		# distinct component_item in the stock entry.
		# Wrap in try/except so a socketio failure never breaks the posting transaction.
		seen = set()
		for component in payload.get("components") or []:
			component_item = component.get("item_code")
			warehouse = component.get("s_warehouse")
			if not component_item or not warehouse:
				continue
			key = (component_item, warehouse)
			if key not in seen:
				try:
					publish_component_stock_fanout(
						component_item,
						warehouse,
						payload.get("company"),
						payload.get("branch"),
						department=payload.get("department"),
						logger_name="ury_fulfilment_posting_service",
					)
				except Exception:
					# Failure to publish is best-effort, fire-and-forget.
					frappe.logger("ury_fulfilment_posting_service").exception(
						"Failed to publish realtime fan-out for component {0}".format(component_item)
					)
				seen.add(key)

		fulfilment = _create_or_update_fulfilment(intent, payload, stock_entry)
		intent.fulfilment_record = fulfilment
		intent.erpnext_stock_entry = stock_entry
		intent.status = POSTED
		intent.posted_at = now()
		intent.posted_by = frappe.session.user
		intent.leased_until = None
		intent.last_error = None
		with _service_mutation():
			intent.save(ignore_permissions=False)
		return _intent_result(intent.as_dict(), idempotent=False)
	except Exception as exc:
		return _mark_failed(intent.name, exc)


def recover_pending_posting_intents(limit=100):
	"""Re-enqueue stale PENDING/FAILED/POSTING intents for recovery.

	FAILED intents that _mark_failed gave up on (retryable=0, having exceeded
	max_attempts) are dead letters: they are deliberately skipped here so they
	stop retrying forever and stay visible for manual intervention instead.
	"""
	candidates = frappe.get_all(
		INTENT_DOCTYPE,
		filters={"status": ["in", [PENDING, FAILED, POSTING]]},
		fields=["name", "status", "leased_until", "next_retry_at", "retryable"],
		limit=limit,
	)
	queued = []
	now_dt = now_datetime()
	for row in candidates:
		if row.get("status") == POSTING and row.get("leased_until") and frappe.utils.get_datetime(row.leased_until) > now_dt:
			continue
		if row.get("status") == FAILED and not row.get("retryable"):
			continue
		if row.get("status") == FAILED and row.get("next_retry_at") and frappe.utils.get_datetime(row.next_retry_at) > now_dt:
			continue
		enqueue_posting_intent(row.name)
		queued.append(row.name)
	return queued

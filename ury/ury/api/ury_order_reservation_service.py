"""Server-authoritative reservation reconciliation for POS order acceptance.

This module is intentionally not wired into ``sync_order`` in this scoped
correction. It provides the narrow reservation reconciliation primitive and
keeps line/context isolation in the reservation layer.
"""

from collections import defaultdict
import json

import frappe
from frappe import _
from frappe.utils import flt

from ury.ury.api.ury_availability import _resolve_production_config
from ury.ury.api.ury_reservation_service import (
	RESERVED,
	create_reservation,
	release_reservation,
)


RESERVATION_DOCTYPE = "URY Stock Reservation"

LINE_REF_FIELDS = (
	"reservation_line_key",
	"reservation_line_ref",
	"line_ref",
	"pos_line_ref",
	"pos_line_id",
	"unique_id",
	"uniqueId",
	"name",
)
CONTEXT_FIELDS = (
	"comment",
	"comments",
	"custom_course",
	"course",
	"rate",
	"price_list_rate",
	"warehouse",
	"production_unit",
	"department",
	"production_configuration",
	"production_policy",
)


def _item_code(row):
	return row.get("item_code") or row.get("item")


def _line_ref(row):
	for fieldname in LINE_REF_FIELDS:
		value = row.get(fieldname)
		if value:
			return str(value)
	return None


def _line_context(row):
	context = {}
	for fieldname in CONTEXT_FIELDS:
		value = row.get(fieldname)
		if value not in (None, ""):
			context[fieldname] = value
	return context


def _line_key(item_code, row, occurrence):
	explicit_ref = _line_ref(row)
	if explicit_ref:
		return "ref:{0}:{1}".format(item_code, explicit_ref)

	context = _line_context(row)
	if context:
		context_token = json.dumps(context, sort_keys=True, default=str)
		return "ctx:{0}:{1}:{2}".format(item_code, context_token, occurrence)

	return "pos:{0}:{1}".format(item_code, occurrence)


def _line_quantities(rows):
	"""Return line-keyed quantities without collapsing distinct same-item rows."""
	seen = defaultdict(int)
	result = {}
	for row in rows or []:
		item_code = _item_code(row)
		if not item_code:
			continue
		base_context = _line_ref(row) or json.dumps(_line_context(row), sort_keys=True, default=str)
		occurrence_base = "{0}:{1}".format(item_code, base_context)
		seen[occurrence_base] += 1
		key = _line_key(item_code, row, seen[occurrence_base])
		result[key] = {
			"item_code": item_code,
			"qty": result.get(key, {}).get("qty", 0) + flt(row.get("qty")),
			"source_context": _line_context(row),
			"source_line_ref": _line_ref(row),
		}
	return result


def _warehouse_for_context(context):
	warehouse = context.get("warehouse")
	if not warehouse and context.get("department"):
		warehouse = frappe.db.get_value(
			"URY Production Department", context.get("department"), "department_warehouse"
		)
	return warehouse


def resolve_production_context(item_code, branch, company):
	"""Resolve the existing production configuration shape for reservation use."""
	context = _resolve_production_config(item_code, branch, company)
	if not context:
		return None
	return context


def _audit_frozen_context(row):
	audit_log = row.get("audit_log")
	if not audit_log:
		return {}
	try:
		entries = json.loads(audit_log)
	except (TypeError, ValueError):
		return {}

	for entry in reversed(entries or []):
		frozen_context = entry.get("frozen_context")
		if frozen_context:
			return frozen_context
	return {}


def _active_groups(order_ref, item_code, reservation_line_key=None):
	rows = frappe.get_all(
		RESERVATION_DOCTYPE,
		filters={
			"order_ref": order_ref,
			"top_level_item": item_code,
			"status": RESERVED,
		},
		fields=["name", "reservation_group", "audit_log"],
		order_by="creation desc",
	)

	groups = []
	for row in rows:
		group = row.get("reservation_group")
		if not group:
			continue
		if reservation_line_key:
			frozen_context = _audit_frozen_context(row)
			if frozen_context.get("reservation_line_key") != reservation_line_key:
				continue
		groups.append(group)
	return list(dict.fromkeys(groups))


def _reconcile_line(order_ref, line_key, line, branch, company, actor):
	item_code = line["item_code"]
	requested_qty = flt(line["qty"])
	context = resolve_production_context(item_code, branch, company=company)
	if not context:
		frappe.throw(
			_("Active production context is required for Item {0} in Branch {1}").format(item_code, branch),
			frappe.ValidationError,
		)

	warehouse = _warehouse_for_context(context)
	if not warehouse:
		frappe.throw(
			_("A reservation warehouse is required for Item {0}").format(item_code),
			frappe.ValidationError,
		)

	for group in _active_groups(order_ref, item_code, reservation_line_key=line_key):
		release_reservation(group, reason="Order acceptance line quantity reconciliation")

	frozen_context = {
		"item_code": item_code,
		"branch": branch,
		"company": company,
		"warehouse": warehouse,
		"production_policy": context.production_policy,
		"production_unit": context.get("production_unit"),
		"department": context.get("department"),
		"production_configuration": context.get("name"),
		"reservation_line_key": line_key,
		"source_line_ref": line.get("source_line_ref"),
		"source_context": line.get("source_context") or {},
	}

	if requested_qty > 0:
		return create_reservation(
			item_code=item_code,
			qty=requested_qty,
			warehouse=warehouse,
			branch=branch,
			company=company,
			order_ref=order_ref,
			policy=context.production_policy,
			actor=actor,
			frozen_context=frozen_context,
		)
	return None


def reconcile_order_reservations(order_ref, previous_items, accepted_items, branch, company, actor=None):
	"""Reconcile reservations to the accepted POS item delta.

	Reservation groups are released and rebuilt only for the changed POS line
	context. Same item codes on other POS lines keep their unrelated groups.
	"""
	if not order_ref or not branch or not company:
		frappe.throw(_("Order reservation scope is incomplete"), frappe.ValidationError)

	actor = actor or frappe.session.user
	previous = _line_quantities(previous_items)
	accepted = _line_quantities(accepted_items)
	for line_key in sorted(set(previous) | set(accepted)):
		previous_qty = flt(previous.get(line_key, {}).get("qty"))
		accepted_qty = flt(accepted.get(line_key, {}).get("qty"))
		if previous_qty == accepted_qty:
			continue

		line = accepted.get(line_key) or previous[line_key]
		line = dict(line)
		line["qty"] = accepted_qty
		_reconcile_line(order_ref, line_key, line, branch, company, actor)

"""Server-authoritative reservation reconciliation for POS order acceptance.

This module IS wired into ``sync_order`` (see ``ury/ury/doctype/ury_order/
ury_order.py::sync_order``, which calls ``reconcile_order_reservations``
directly). It provides the reservation reconciliation primitive, keeps line/
context isolation in the reservation layer, and (as of D1) re-checks each
line against ``ury_availability.get_item_availability`` before committing an
increased reservation, so order acceptance cannot reserve stock for an item
the display-layer availability engine would refuse to sell.
"""

from collections import defaultdict
import json

import frappe
from frappe import _
from frappe.utils import flt

from ury.ury.api.ury_availability import _resolve_production_config, get_item_availability
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


def _check_line_availability(item_code, branch, company, context):
	"""Return an availability-rejection dict for `item_code`, or None if sellable.

	Pure read-only check -- callers use this to pre-flight a whole batch of
	lines before any reservation side effect (release/create) begins, so a
	single unavailable line does not leave earlier lines partially reconciled
	when the overall sync is aborted (B-4).
	"""
	availability = get_item_availability(
		item_code=item_code,
		branch=branch,
		company=company,
		department=context.get("department"),
	)
	if availability.get("sellable"):
		return None
	return {
		"item_code": item_code,
		"reason_code": availability.get("reason_code"),
	}


def _reconcile_line(order_ref, line_key, line, previous_qty, branch, company, actor):
	item_code = line["item_code"]
	requested_qty = flt(line["qty"])
	previous_qty = flt(previous_qty)
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

	# Order acceptance is the authoritative transaction boundary for real
	# stock reservations -- it must not reserve stock for a line the
	# display-layer availability engine (`get_item_availability`) would
	# refuse to sell. Only gate a NET INCREASE in reserved qty (requested_qty
	# > previous_qty), never merely `requested_qty > 0` -- `requested_qty` is
	# the line's new ABSOLUTE quantity, not a delta, so gating on ">0" would
	# also block ordinary decreases (e.g. 5 -> 2 because the kitchen ran
	# out), which must never be blocked by availability or a user could
	# never remove/reduce a now-unsellable item from an order (B-3). A
	# same-or-decreasing edit (including all the way to 0) only releases
	# existing reservation groups. This folds DEPARTMENT_DISABLED and
	# NO_ACTIVE_PLAN/PLAN_EXHAUSTED gating -- which this reconciliation
	# path previously skipped entirely -- into order acceptance itself.
	if requested_qty > previous_qty:
		rejection = _check_line_availability(item_code, branch, company, context)
		if rejection:
			frappe.throw(
				_("{0} is not available for order (reason: {1}). Please refresh the menu.").format(
					item_code, rejection.get("reason_code")
				),
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

	Availability is pre-flighted for ALL changed lines before any reservation
	side effect (release/create) begins for ANY line (B-4). This codebase's
	dominant convention for a rejected transaction is a single hard
	`frappe.throw` that aborts the whole request (see the other validation
	failures throughout `ury_order.py`), so we keep that hard-abort shape
	here rather than inventing a partial-acceptance protocol -- but doing the
	full pre-flight first (instead of throwing mid-loop, as before) means a
	rejected line can no longer leave earlier lines in this same sync
	partially released/re-reserved: either the whole batch passes and is
	applied, or nothing in this call is mutated.
	"""
	if not order_ref or not branch or not company:
		frappe.throw(_("Order reservation scope is incomplete"), frappe.ValidationError)

	actor = actor or frappe.session.user
	previous = _line_quantities(previous_items)
	accepted = _line_quantities(accepted_items)

	changed_lines = []
	for line_key in sorted(set(previous) | set(accepted)):
		previous_qty = flt(previous.get(line_key, {}).get("qty"))
		accepted_qty = flt(accepted.get(line_key, {}).get("qty"))
		if previous_qty == accepted_qty:
			continue

		line = accepted.get(line_key) or previous[line_key]
		line = dict(line)
		line["qty"] = accepted_qty
		changed_lines.append((line_key, line, previous_qty))

	# Pre-flight: only a net INCREASE in a line's qty needs an availability
	# check (see _reconcile_line for why absolute qty is not the right
	# gate). Collect every rejection before mutating any reservation state.
	rejections = []
	for line_key, line, previous_qty in changed_lines:
		accepted_qty = flt(line["qty"])
		if accepted_qty <= previous_qty:
			continue
		item_code = line["item_code"]
		context = resolve_production_context(item_code, branch, company=company)
		if not context:
			# Let _reconcile_line raise the proper "context required" error
			# below, in original line order, rather than duplicating it here.
			continue
		rejection = _check_line_availability(item_code, branch, company, context)
		if rejection:
			rejections.append(rejection)

	if rejections:
		if len(rejections) == 1:
			message = _("{0} is not available for order (reason: {1}). Please refresh the menu.").format(
				rejections[0]["item_code"], rejections[0]["reason_code"]
			)
		else:
			detail = ", ".join(f"{r['item_code']} ({r['reason_code']})" for r in rejections)
			message = _("The following items are not available for order: {0}. Please refresh the menu.").format(
				detail
			)
		frappe.throw(message, frappe.ValidationError)

	for line_key, line, previous_qty in changed_lines:
		_reconcile_line(order_ref, line_key, line, previous_qty, branch, company, actor)

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""V3-73: POS stock authority feature flag.

This module is the SOLE read path used by `ury_order.py` to decide whether a
POS Invoice's stock authority is handled by ERPNext's native
`update_stock=1` posting (the current, always-on-by-default behavior) or by
the new fulfilment services from V3-71/V3-72 (an integration STUB — see the
loud warning below and in `ury_order.py`).

Governing contract:
tracks/sa-v3_nxt/outputs/V3-70-fulfilment-accounting-transition-checklist.md

HARD RULES this module exists to enforce:

1. The flag defaults to False/off in every circumstance: unset field, a
   missing "URY Feature Flags" doctype/table (e.g. before migration), a
   database error, or any other unexpected condition. This function FAILS
   CLOSED -- any exception is caught here and treated as "flag is off". It
   must never fail open to the new, less-battle-tested code path.
2. Nothing in this module, or anywhere else in the shipped application code,
   sets this flag to True. The only way the flag becomes True in a real
   deployment is a human deliberately editing the "URY Feature Flags" single
   doctype (Desk UI or a direct, out-of-band data change) -- an explicit,
   auditable, out-of-band admin action, not a code default.
3. Per-branch/per-company overrides are accepted as optional future-proofing
   (the checklist recommends per-branch scoping) but the current
   implementation only reads the single global flag; `company`/`branch`
   arguments are accepted so callers don't need to change their call sites
   later, and are currently unused. Document any future per-scope storage
   choice here when it's built.

DO NOT set this flag to True anywhere in this codebase. If you are looking
for how to enable the new fulfilment path in a live environment, that is an
operational decision requiring the evidence and sign-off described in the
governing contract above -- not a code change.
"""

import frappe
from frappe import _

FLAG_DOCTYPE = "URY Feature Flags"
FLAG_FIELD = "pos_stock_authority_v2"


def is_pos_stock_authority_flag_enabled(company=None, branch=None):
	"""Return True only if a human has explicitly enabled the V3-73 flag.

	Fails CLOSED (returns False) on any error, including a missing doctype
	(e.g. before this app's migration has run), an unset field, or any other
	unexpected condition. Never raises.

	`company` and `branch` are accepted for forward compatibility with a
	future per-scope override but are not currently used to vary the result
	-- the single global "URY Feature Flags" value is authoritative today.
	"""

	try:
		value = frappe.db.get_single_value(FLAG_DOCTYPE, FLAG_FIELD)
	except Exception:
		# Fail closed: doctype missing, DB error, not yet migrated, etc.
		# Never let a read failure be interpreted as "flag on".
		return False

	return bool(value)


def maybe_wire_fulfilment_on_submit(doc, method=None):
	"""V3-73 flag-on integration point, called from POS Invoice's on_submit
	doc_event (additive: appended alongside the existing on_submit handler,
	never replacing it).

	Flag OFF (default in every real environment): no-op, returns immediately.

	Flag ON: for each submitted invoice's linked URY KOT items whose
	execution has reached READY/SERVED, look up a matching URY Stock
	Reservation and call the appropriate V3-71/V3-72 fulfilment service.

	This does NOT post anything to ERPNext's real stock ledger -- the
	fulfilment services themselves only record a URY Fulfilment Record with
	posted_to_erpnext=False, per V3-71/V3-72's own accepted scope. Real
	ERPNext posting remains explicit future work.

	This also does NOT create reservations -- nothing in the accepted V3
	graph automatically creates a URY Stock Reservation when an order is
	placed (V3-43 only provides create_reservation as a callable service, it
	is not wired to any order-creation trigger). So on a real order today,
	no matching reservation will exist yet, and this function will log a
	single informational entry and skip that KOT item rather than error --
	wiring automatic reservation creation into order/KOT placement is a
	separate, not-yet-built follow-up.

	Any failure here is caught and logged, never raised, so a fulfilment
	bookkeeping problem can never block or roll back a real invoice
	submission -- update_stock was already resolved (to 0, since this path
	only runs when the flag is on) before this hook runs.
	"""
	if not is_pos_stock_authority_flag_enabled(branch=doc.get("branch")):
		return

	try:
		_wire_fulfilment_for_invoice(doc)
	except Exception:
		frappe.log_error(
			title="V3-73 flag-on fulfilment wiring failed",
			message=frappe.get_traceback(),
		)


def _wire_fulfilment_for_invoice(doc):
	kots = frappe.get_all("URY KOT", filters={"invoice": doc.name}, fields=["name"])
	if not kots:
		return

	for kot in kots:
		execution_rows = frappe.get_all(
			"URY KOT Execution",
			filters={"kot": kot.name},
			fields=["state"],
			limit=1,
		)
		if not execution_rows or execution_rows[0].state not in ("READY", "SERVED"):
			continue

		kot_doc = frappe.get_doc("URY KOT", kot.name)
		for item_row in kot_doc.get("kot_items") or []:
			item_code = item_row.get("item")
			# URY KOT Items.quantity is a Data (string) field, not Float --
			# a doc reloaded fresh from DB (as kot_doc is here) yields a
			# string, which breaks numeric comparisons inside
			# fulfil_mto_order/fulfil_preproduced_order downstream.
			qty = frappe.utils.flt(item_row.get("quantity"))
			if not item_code or not qty:
				continue

			production_policy = frappe.db.get_value(
				"URY Item Production Configuration",
				{"item": item_code},
				"production_policy",
			)

			reservation = frappe.get_all(
				"URY Stock Reservation",
				filters={
					"order_ref": doc.name,
					"top_level_item": item_code,
					"status": "Reserved",
				},
				fields=["name"],
				limit=1,
			)
			if not reservation:
				frappe.log_error(
					title="V3-73 flag-on: no reservation found",
					message=(
						f"KOT {kot.name} item {item_code} on invoice {doc.name} is "
						"READY/SERVED but no matching URY Stock Reservation exists "
						"(automatic reservation-on-order-creation is not yet wired "
						"into the live order flow -- separate follow-up task). "
						"Skipped, not an error."
					),
				)
				continue

			from ury.ury.api.ury_preproduced_fulfilment_service import fulfil_preproduced_order
			from ury.ury.api.ury_mto_fulfilment_service import fulfil_mto_order

			if production_policy == "MADE_TO_ORDER":
				fulfil_mto_order(
					kot=kot.name,
					item_code=item_code,
					qty=qty,
					reservation_group_ref=reservation[0].name,
					actor=frappe.session.user,
					batch_key=f"{kot.name}:{item_code}",
				)
			else:
				fulfil_preproduced_order(
					kot=kot.name,
					item_code=item_code,
					qty=qty,
					reservation_ref=reservation[0].name,
					actor=frappe.session.user,
				)


def _verify_fulfilment_posted_for_invoice(invoice_doc, strict=False):
	"""Verify every produced MADE_TO_ORDER line on `invoice_doc` has a
	matching `URY Fulfilment Record`. Raises `frappe.ValidationError` (via
	`frappe.throw`) on a real problem; returns `None` when clean.

	Two callers, two severities, same check:

	  - `strict=False` (till-time advisory -- not currently wired to any
	    live call site, reserved for a future submit-time advisory use):
	    would surface a problem without blocking a cashier's payment.
	  - `strict=True` (`ury_pos_closing_reconciliation._verify_invoice_
	    production`, the closing-time enforcement point): a missing
	    fulfilment record gets exactly one synchronous retry (a lagging
	    background worker is exactly the case that should self-heal at
	    end-of-shift instead of blocking a manager); if that retry also
	    fails, this raises.

	Scope note: only MADE_TO_ORDER lines are checked here, matching
	`ury_pos_closing_reconciliation.py`'s own module docstring ("every
	produced MADE_TO_ORDER item"). PRE_PRODUCED/DIRECT_RETAIL items are not
	covered by this function -- their stock posture is ERPNext's native Bin/
	Stock Ledger, reconciled by ordinary stock-count tooling, not by this
	fulfilment-record check.

	A KOT item is "produced" (and therefore in scope at all) only once its
	`URY KOT Execution.state` has reached READY or SERVED -- an item still
	queued/cooking has nothing to verify yet, matching `_wire_fulfilment_
	for_invoice`'s own READY_STATES gate above.

	This intentionally re-queries `URY Fulfilment Record` / `URY Stock
	Reservation` directly rather than importing `ury_mto_fulfilment_
	service`'s private `_find_prior_fulfilment` -- that helper is correct
	but underscore-private to its own module's internal dedup step; this
	function needs only a read, not that module's full fulfil-or-dedupe
	state machine.
	"""
	from ury.ury.api.ury_mto_fulfilment_service import (
		READY_STATES as MTO_READY_STATES,
		MADE_TO_ORDER as MTO_FULFILMENT_TYPE,
		fulfil_mto_order,
	)

	kots = frappe.get_all("URY KOT", filters={"invoice": invoice_doc.get("name")}, fields=["name"])
	for kot in kots:
		execution_rows = frappe.get_all(
			"URY KOT Execution", filters={"kot": kot.name}, fields=["state"], limit=1
		)
		if not execution_rows or execution_rows[0].state not in MTO_READY_STATES:
			continue

		kot_doc = frappe.get_doc("URY KOT", kot.name)
		for item_row in kot_doc.get("kot_items") or []:
			item_code = item_row.get("item")
			# URY KOT Items.quantity is a Data (string) field, not Float --
			# a doc reloaded fresh from DB (as kot_doc is here) yields a
			# string, which breaks the numeric comparisons inside
			# fulfil_mto_order/compile_bom_vector. flt() coerces safely.
			qty = frappe.utils.flt(item_row.get("quantity"))
			if not item_code or not qty:
				continue

			production_policy = frappe.db.get_value(
				"URY Item Production Configuration", {"item": item_code}, "production_policy"
			)
			if production_policy != "MADE_TO_ORDER":
				continue

			existing = frappe.get_all(
				"URY Fulfilment Record",
				filters={"kot": kot.name, "item_code": item_code, "fulfilment_type": MTO_FULFILMENT_TYPE},
				fields=["name", "qty"],
				order_by="creation desc",
				limit=1,
			)
			if existing:
				if existing[0].qty != qty:
					frappe.throw(
						_(
							"Production posting for item {0} on KOT {1} is for qty {2}, "
							"but the invoice line is qty {3}."
						).format(item_code, kot.name, existing[0].qty, qty)
					)
				continue

			if not strict:
				# Advisory mode: a missing record is worth knowing about but
				# must never block a cashier's payment.
				continue

			reservation = frappe.get_all(
				"URY Stock Reservation",
				filters={
					"order_ref": invoice_doc.get("name"),
					"top_level_item": item_code,
					"status": "Reserved",
				},
				fields=["reservation_group", "name"],
				limit=1,
			)
			if not reservation:
				frappe.throw(
					_(
						"Production posting is missing for item {0} on KOT {1}, and no "
						"active reservation exists to retry it against."
					).format(item_code, kot.name)
				)

			try:
				fulfil_mto_order(
					kot=kot.name,
					item_code=item_code,
					qty=qty,
					reservation_group_ref=reservation[0].reservation_group or reservation[0].name,
					actor=frappe.session.user,
					batch_key=f"{kot.name}:{item_code}",
				)
			except Exception as exc:
				frappe.throw(
					_("Production posting is missing for item {0} on KOT {1}: {2}").format(
						item_code, kot.name, str(exc)
					)
				)

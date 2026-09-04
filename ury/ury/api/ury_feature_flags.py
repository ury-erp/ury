# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""V3-73: POS stock authority feature flag.

This module is the SOLE read path used by `ury_order.py` to decide whether a
POS Invoice's stock authority is handled by ERPNext's native
`update_stock=1` posting (the current, always-on-by-default behavior) or by
the fulfilment services from V3-71/V3-72. The replacement path remains
feature-flagged and operationally gated until its runtime accounting and
deployment evidence is accepted.

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
RESERVATION_DOCTYPE = "URY Stock Reservation"


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

	The fulfilment services must complete inside the invoice transaction; any
	missing or ambiguous reservation binding or posting failure aborts submit.
	The flag remains operationally gated until real-ledger posting evidence is
	accepted.

	This also does NOT create reservations -- nothing in the accepted V3
	graph automatically creates a URY Stock Reservation when an order is
	placed (V3-43 only provides create_reservation as a callable service, it
	is not wired to any order-creation trigger). So on a real order today,
	no matching reservation will exist yet, and this function will reject the
	submit rather than silently bypass stock authority --
	wiring automatic reservation creation into order/KOT placement is a
	separate, not-yet-built follow-up.

	When enabled, fulfilment must complete inside the invoice transaction. Any
	missing reservation or posting failure is raised so the invoice cannot be
	marked submitted while replacement stock authority is incomplete.
	"""
	if not is_pos_stock_authority_flag_enabled(branch=doc.get("branch")):
		return

	_wire_fulfilment_for_invoice(doc)


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
			qty = item_row.get("quantity")
			if not item_code:
				continue

			production_policy = frappe.db.get_value(
				"URY Item Production Configuration",
				{"item": item_code},
				"production_policy",
			)

			reservations = _reservation_rows_for_invoice_item(doc, item_code)
			reservation_ref = _select_reservation_ref(reservations, production_policy, item_code, kot.name)
			if not reservation_ref:
				frappe.throw(
					_("No stock reservation exists for KOT {0}, item {1}; fulfilment cannot be posted.").format(
						kot.name, item_code
					),
					frappe.ValidationError,
				)

			from ury.ury.api.ury_preproduced_fulfilment_service import fulfil_preproduced_order
			from ury.ury.api.ury_mto_fulfilment_service import fulfil_mto_order

			if production_policy == "MADE_TO_ORDER":
				fulfil_mto_order(
					kot=kot.name,
					item_code=item_code,
					qty=qty,
					reservation_group_ref=reservation_ref,
					actor=frappe.session.user,
					batch_key=f"{kot.name}:{item_code}",
				)
			else:
				fulfil_preproduced_order(
					kot=kot.name,
					item_code=item_code,
					qty=qty,
					reservation_ref=reservation_ref,
					actor=frappe.session.user,
				)


def _reservation_rows_for_invoice_item(doc, item_code):
	filters = {
		"order_ref": doc.name,
		"top_level_item": item_code,
		"status": "Reserved",
	}
	branch = doc.get("branch")
	company = doc.get("company")
	if branch:
		filters["branch"] = branch
	if company:
		filters["company"] = company

	rows = frappe.get_all(
		RESERVATION_DOCTYPE,
		filters=filters,
		fields=["name", "reservation_group"],
		order_by="creation asc",
	)
	if not rows:
		return []
	return rows


def _select_reservation_ref(reservations, production_policy, item_code, kot_name):
	if not reservations:
		return None

	reservation_groups = []
	for row in reservations:
		reservation_group = row.get("reservation_group") or row.get("name")
		if reservation_group:
			reservation_groups.append(reservation_group)

	if production_policy == "MADE_TO_ORDER":
		if len(set(reservation_groups)) != 1:
			frappe.throw(
				_("KOT {0}, item {1} maps to multiple reservation groups; fulfilment cannot be posted until the line is resolved.").format(
					kot_name, item_code
				),
				frappe.ValidationError,
			)
		return reservation_groups[0]

	if len(reservations) != 1:
		frappe.throw(
			_("KOT {0}, item {1} maps to multiple stock reservations; fulfilment cannot be posted until the line is resolved.").format(
				kot_name, item_code
			),
			frappe.ValidationError,
		)

	return reservation_groups[0]

"""Cashier/captain-facing quantity-reduction API for a printed POS Invoice.

`ury.ury.hooks.ury_pos_invoice.validate_invoice` blocks any qty reduction or
item removal on a POS Invoice once `invoice_printed == 1`, unless the POS
Profile's `remove_items` flag is set -- see that function for the existing
blanket-block behaviour and its own generic "Cannot modify items after
invoice is printed" error. This module adds a SEPARATE, deliberate, item-
level qty-reduction path that:

  1. Is gated by Order Type, not by `remove_items`. Reduction is only
     permitted when the invoice's `order_type` (an existing Select field on
     POS Invoice; see fixtures/custom_field.json "POS Invoice-order_type")
     appears in the POS Profile's new
     `custom_qty_reduction_allowed_order_types` field (a comma-separated
     list of the same Select's options -- see
     fixtures/custom_field.json "POS Profile-custom_qty_reduction_allowed_
     order_types"). An order type NOT in that list is rejected with a
     specific `ORDER_TYPE_NOT_ALLOWED` error naming the order type --
     deliberately NOT the generic "Cannot modify items after invoice is
     printed" message `validate_invoice` raises for everything else. An
     unconfigured (empty) allow-list means NO order type is permitted --
     fail closed, matching this app's cancellation-service style (see
     ury_kot_cancellation_service.py's ITEM_LEVEL_STATE_REQUIRED case).

  2. Bypasses `validate_invoice`'s guard for exactly this one legitimate
     write, via a `frappe.flags.ury_qty_reduction` flag -- the identical
     pattern `ury_bill_split` already uses in the same function. This module
     never weakens or removes that guard for any other caller; see
     `ury_pos_invoice.validate_invoice`'s own diff.

  3. Reuses the existing cancel-KOT creation path
     (`ury_kot_generate.process_items_for_cancel_kot` ->
     `create_cancel_kot_doc`) to generate a partial ("Partially cancelled")
     cancel-KOT for exactly the reduced delta -- it does not reimplement
     cancel-KOT creation, and it does not touch `URY KOT Execution` /
     `cancel_partial` in ury_kot_cancellation_service.py at all; that
     KOT-execution-level state machine is deliberately untouched by this
     item-level qty-reduction path.

Generic by design: this is a single whitelisted API used by BOTH cashier
(Register) and captain (order UI) frontends -- there is no cashier-specific
or captain-specific backend branch here. Frontend wiring is out of scope for
this module.
"""

import frappe
from frappe import _

from ury.ury.api.ury_kot_generate import (
	create_order_items,
	process_items_for_cancel_kot,
)


# Reason codes, following ury_kot_cancellation_service.py's stable-reason-code style.
INVOICE_NOT_FOUND = "INVOICE_NOT_FOUND"
ITEM_NOT_FOUND = "ITEM_NOT_FOUND"
INVALID_QTY = "INVALID_QTY"
ORDER_TYPE_NOT_ALLOWED = "ORDER_TYPE_NOT_ALLOWED"
KOT_NAMING_SERIES_MISSING = "KOT_NAMING_SERIES_MISSING"
NOT_PERMITTED = "NOT_PERMITTED"
LAST_ITEM_CANNOT_BE_REMOVED = "LAST_ITEM_CANNOT_BE_REMOVED"


class QtyReductionError(frappe.ValidationError):
	"""Raised for fail-closed qty-reduction errors; carries a stable reason_code."""

	def __init__(self, reason_code, message=None):
		self.reason_code = reason_code
		super().__init__(message or reason_code)


def _allowed_order_types(pos_profile_doc):
	raw = (pos_profile_doc.get("custom_qty_reduction_allowed_order_types") or "").strip()
	if not raw:
		return set()
	return {part.strip() for part in raw.split(",") if part.strip()}


@frappe.whitelist()
def reduce_order_item_qty(invoice_id, item_row_name, new_qty, item_code=None, reason=None):
	"""Reduce (or fully remove, `new_qty=0`) one item's qty on a printed POS
	Invoice, for an Order Type the POS Profile has explicitly allowed, and
	generate the matching partial cancel-KOT for the delta.

	Works identically for a cashier (Register) or captain (order UI) caller
	-- there is no separate backend path per caller type.

	The item to modify is selected by `item_row_name` -- the actual POS
	Invoice Item child-table row `name` -- NOT by `item_code`. Matching by
	item_code alone was ambiguous whenever the same item appeared as more
	than one row (e.g. added in two separate rounds, or with different
	comments): it matched the FIRST row with that item_code and, for
	`new_qty=0`, removed EVERY row sharing that item_code rather than just
	the one row the caller meant. `item_code`, if given, is only used as a
	secondary sanity check against the resolved row.

	Steps (see module docstring for the full rationale of each):
	  1. Load the POS Invoice and resolve its Order Type.
	  2. Check that Order Type against the POS Profile's configurable
	     allow-list; raise `ORDER_TYPE_NOT_ALLOWED` (specific, not the
	     generic post-print block) if not allowed.
	  3. Resolve the exact item row by `item_row_name`.
	  4. Validate `new_qty` is a real, integer reduction:
	     `0 <= new_qty < current_qty`.
	  5. Reject a `new_qty=0` that would leave the invoice with zero items --
	     the whole invoice must be cancelled instead.
	  6. Set `frappe.flags.ury_qty_reduction` around the save so
	     `validate_invoice`'s guard does not fire for this legitimate write.
	  7. Update the invoice item's qty (0 = full removal of that item row).
	  8. Reuse `process_items_for_cancel_kot` (which itself reuses
	     `create_cancel_kot_doc`) to create a partial cancel-KOT for exactly
	     the reduced delta.

	The permission check and the `actor` recorded on the result are always
	`frappe.session.user` -- never a caller-supplied value. An `actor`
	argument accepted from the client would be forgeable and must never be
	used as the authority for a permission decision or an audit trail.

	Returns a dict with the created cancel-KOT name(s) and the updated
	invoice state.
	"""
	actor = frappe.session.user

	if not invoice_id or not frappe.db.exists("POS Invoice", invoice_id):
		raise QtyReductionError(INVOICE_NOT_FOUND, _("POS Invoice {0} not found").format(invoice_id))

	pos_invoice = frappe.get_doc("POS Invoice", invoice_id)

	if not frappe.has_permission("POS Invoice", "write", doc=pos_invoice, user=actor):
		raise QtyReductionError(
			NOT_PERMITTED, _("Not permitted to modify invoice {0}").format(invoice_id)
		)

	order_type = pos_invoice.get("order_type")
	pos_profile = frappe.get_doc("POS Profile", pos_invoice.pos_profile)
	allowed_order_types = _allowed_order_types(pos_profile)

	if order_type not in allowed_order_types:
		raise QtyReductionError(
			ORDER_TYPE_NOT_ALLOWED,
			_(
				"Quantity reduction after printing is not permitted for order "
				"type {0} on POS Profile {1}. Allowed order types: {2}."
			).format(
				order_type or _("(not set)"),
				pos_profile.name,
				", ".join(sorted(allowed_order_types)) or _("(none configured)"),
			),
		)

	item_row = None
	for row in pos_invoice.items:
		if row.name == item_row_name:
			item_row = row
			break
	if item_row is None:
		raise QtyReductionError(
			ITEM_NOT_FOUND,
			_("Item row {0} not found on invoice {1}").format(item_row_name, invoice_id),
		)

	if item_code and item_row.item_code != item_code:
		raise QtyReductionError(
			ITEM_NOT_FOUND,
			_(
				"Item row {0} on invoice {1} is item {2}, not the expected {3}"
			).format(item_row_name, invoice_id, item_row.item_code, item_code),
		)

	item_code = item_row.item_code
	current_qty = item_row.qty

	try:
		new_qty = float(new_qty)
	except (TypeError, ValueError):
		raise QtyReductionError(INVALID_QTY, _("new_qty must be numeric, got {0!r}").format(new_qty))

	if not (0 <= new_qty < current_qty):
		raise QtyReductionError(
			INVALID_QTY,
			_(
				"new_qty ({0}) must be a real reduction: 0 <= new_qty < current qty ({1})"
			).format(new_qty, current_qty),
		)

	delta = new_qty - current_qty  # negative

	if not float(new_qty).is_integer() or not float(delta).is_integer():
		raise QtyReductionError(
			INVALID_QTY,
			_(
				"new_qty ({0}) must be a whole number: fractional quantity reductions are not supported"
			).format(new_qty),
		)

	if new_qty == 0 and len(pos_invoice.items) <= 1:
		raise QtyReductionError(
			LAST_ITEM_CANNOT_BE_REMOVED,
			_(
				"Item {0} is the only item on invoice {1}. Cancel the whole invoice instead of "
				"removing its last item."
			).format(item_code, invoice_id),
		)

	pos_profile_id = pos_invoice.pos_profile
	kot_naming_series = pos_profile.custom_kot_naming_series
	if not kot_naming_series:
		raise QtyReductionError(
			KOT_NAMING_SERIES_MISSING,
			_(
				"KOT Naming Series is mandatory for cancel-KOT creation. "
				"Ensure it is configured in POS Profile: {0}"
			).format(pos_profile.name),
		)
	cancel_kot_naming_series = "CNCL-" + kot_naming_series

	# Snapshot of the invoice items BEFORE the qty change, in the same shape
	# create_cancel_kot_doc expects for `invoiceItems` (it reads `item["qty"]`
	# per matching item_code to populate the cancel-KOT row's `quantity`).
	previous_items_snapshot = create_order_items(
		[
			{
				"item": row.item_code,
				"qty": row.qty,
				"item_name": row.item_name,
				"comment": row.get("comment") or "",
			}
			for row in pos_invoice.items
		]
	)

	# Apply the reduction (or full removal) to the invoice, bypassing
	# validate_invoice's post-print guard for exactly this legitimate write.
	frappe.flags.ury_qty_reduction = True
	try:
		if new_qty == 0:
			pos_invoice.items = [row for row in pos_invoice.items if row.name != item_row_name]
		else:
			item_row.qty = new_qty
		pos_invoice.save(ignore_permissions=False)
	finally:
		frappe.flags.ury_qty_reduction = False

	# Reuse the existing cancel-KOT creation path for exactly the delta.
	cancel_item = {
		"item": item_code,
		"qty": delta,
		"item_name": item_row.item_name,
		"comment": reason or "",
	}
	created_kot_names = process_items_for_cancel_kot(
		invoice_id,
		pos_invoice.customer,
		pos_invoice.get("restaurant_table"),
		create_order_items([cancel_item]),
		reason,
		pos_profile_id,
		cancel_kot_naming_series,
		"Partially cancelled",
		previous_items_snapshot,
	)

	return {
		"invoice": invoice_id,
		"item_row_name": item_row_name,
		"item_code": item_code,
		"previous_qty": current_qty,
		"new_qty": new_qty,
		"delta": delta,
		"order_type": order_type,
		"cancel_kot_names": created_kot_names,
		"actor": actor,
	}

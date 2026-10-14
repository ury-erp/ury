"""Opt-in: settle a draft POS Invoice into a Sales Invoice with ERPNext SI naming.

Enabled via POS Profile.custom_consolidate_on_payment.

Flow:
  1. Open order stays a draft POS Invoice (tables / KOT / Mosaic) — may still
     use the restaurant INV- series while open.
  2. On pay, create a Sales Invoice with the **ERPNext Sales Invoice** naming
     series (e.g. ACC-SINV-2026-#####) — authoritative accounting id.
  3. Rename the POS Invoice to that same Sales Invoice name so the Service
     Board / POS history show the ERPNext consecutive.
  4. Submit the POS Invoice and mark it consolidated against the SI.
  5. Both doctypes share one ticket id; GL lives on the Sales Invoice.
"""

from __future__ import annotations

import frappe
from frappe.utils import cint, nowdate, nowtime


_SHARED_CUSTOM_FIELDS = (
	"restaurant",
	"branch",
	"restaurant_table",
	"order_type",
	"waiter",
	"cashier",
	"no_of_pax",
	"mobile_number",
	"arrived_time",
	"total_spend_time",
	"custom_restaurant_room",
	"custom_waiter_employee",
	"custom_closing_employee",
	"custom_aggregator_id",
	"order_info",
	"restaurant_info",
)

_SKIP_ITEM_KEYS = {
	"name",
	"owner",
	"creation",
	"modified",
	"modified_by",
	"parent",
	"parentfield",
	"parenttype",
	"idx",
	"docstatus",
	"doctype",
}


def profile_uses_sales_invoice_on_payment(pos_profile: str | None) -> bool:
	if not pos_profile:
		return False
	return bool(
		frappe.db.get_value(
			"POS Profile", pos_profile, "custom_consolidate_on_payment"
		)
	)


def settle_as_sales_invoice(pos_invoice):
	"""Pay: Sales Invoice gets ERPNext SI name; POS Invoice is renamed to match.

	Returns the submitted Sales Invoice document.
	"""
	if pos_invoice.doctype != "POS Invoice":
		frappe.throw("settle_as_sales_invoice expects a POS Invoice")
	if cint(pos_invoice.docstatus) != 0:
		frappe.throw(
			f"POS Invoice {pos_invoice.name} must be a draft to settle as Sales Invoice"
		)

	old_pos_name = pos_invoice.name
	if not old_pos_name:
		frappe.throw("POS Invoice must be saved before settlement")

	pos_invoice.flags.ignore_permissions = True
	pos_invoice.save(ignore_permissions=True)

	# 1) Sales Invoice with ERPNext consecutive (ACC-SINV-… by default).
	si = _build_sales_invoice_from_pos(pos_invoice, old_pos_name)
	si.flags.ury_settle_as_sales_invoice = True
	si.flags.ignore_permissions = True
	si.insert(ignore_permissions=True)
	si_name = si.name

	si.flags.ignore_permissions = True
	si.submit()

	# 2) Point POS Invoice at the SI id (dashboard keeps a POS Invoice row).
	if old_pos_name != si_name:
		frappe.rename_doc(
			"POS Invoice",
			old_pos_name,
			si_name,
			force=True,
			show_alert=False,
		)
		_retarget_kot_invoice_refs(old_pos_name, si_name)

	pos_invoice = frappe.get_doc("POS Invoice", si_name)
	pos_invoice.flags.ignore_permissions = True
	# Skip stock/GL on POS Invoice — already posted on the Sales Invoice.
	pos_invoice.flags.ury_settling_as_sales_invoice = True
	frappe.flags.ury_settling_as_sales_invoice = True
	try:
		pos_invoice.submit()
	finally:
		frappe.flags.ury_settling_as_sales_invoice = False

	# Mirror Merge Log outcome so status becomes Consolidated and close skips re-merge.
	frappe.db.set_value(
		"POS Invoice",
		si_name,
		{
			"consolidated_invoice": si_name,
			"status": "Consolidated",
		},
		update_modified=False,
	)

	return frappe.get_doc("Sales Invoice", si_name)


def _retarget_kot_invoice_refs(old_name: str, new_name: str) -> None:
	"""URY KOT.invoice is Data (not Link) — rename_doc does not update it."""
	if not frappe.db.exists("DocType", "URY KOT"):
		return
	frappe.db.sql(
		"UPDATE `tabURY KOT` SET `invoice` = %s WHERE `invoice` = %s",
		(new_name, old_name),
	)


def _build_sales_invoice_from_pos(pos_invoice, pos_name_for_reservations):
	si = frappe.new_doc("Sales Invoice")
	# No forced name — ERPNext / company naming series assigns ACC-SINV-….

	_copy_if_has(
		si,
		pos_invoice,
		(
			"customer",
			"customer_name",
			"company",
			"posting_date",
			"posting_time",
			"due_date",
			"currency",
			"conversion_rate",
			"selling_price_list",
			"price_list_currency",
			"plc_conversion_rate",
			"ignore_pricing_rule",
			"apply_discount_on",
			"additional_discount_percentage",
			"discount_amount",
			"pos_profile",
			"taxes_and_charges",
			"tax_category",
			"cost_center",
			"project",
			"territory",
			"campaign",
			"source",
			"remarks",
			"terms",
			"letter_head",
			"language",
			"is_return",
			"return_against",
			"update_billed_amount_in_sales_order",
			"change_amount",
			"account_for_change_amount",
			"base_change_amount",
			"write_off_amount",
			"base_write_off_amount",
			"write_off_account",
			"write_off_cost_center",
			"loyalty_program",
			"loyalty_points",
			"loyalty_amount",
			"redeem_loyalty_points",
		),
	)

	for field in _SHARED_CUSTOM_FIELDS:
		_copy_if_has(si, pos_invoice, (field,))

	si.is_pos = 1
	si.update_stock = 1
	si.is_consolidated = 1
	si.set_posting_time = 1
	si.posting_date = pos_invoice.posting_date or nowdate()
	si.posting_time = pos_invoice.posting_time or nowtime()

	for item in pos_invoice.get("items") or []:
		row = si.append("items", {})
		_copy_child_row(row, item)
		# Reservations are keyed on the pre-rename POS Invoice name.
		if row.meta.has_field("pos_invoice"):
			row.pos_invoice = pos_name_for_reservations
		if row.meta.has_field("pos_invoice_item"):
			row.pos_invoice_item = item.name

	for tax in pos_invoice.get("taxes") or []:
		row = si.append("taxes", {})
		_copy_child_row(row, tax)

	for payment in pos_invoice.get("payments") or []:
		row = si.append("payments", {})
		_copy_child_row(row, payment)

	if hasattr(si, "calculate_taxes_and_totals"):
		si.calculate_taxes_and_totals()

	return si


def _copy_if_has(target, source, fields):
	for field in fields:
		if not target.meta.has_field(field):
			continue
		if not source.meta.has_field(field) and not hasattr(source, field):
			continue
		value = source.get(field)
		if value is None or value == "":
			continue
		target.set(field, value)


def _copy_child_row(target_row, source_row):
	data = source_row.as_dict() if hasattr(source_row, "as_dict") else dict(source_row)
	for key, value in data.items():
		if key in _SKIP_ITEM_KEYS:
			continue
		if not target_row.meta.has_field(key):
			continue
		target_row.set(key, value)

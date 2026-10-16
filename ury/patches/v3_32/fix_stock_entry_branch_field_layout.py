# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Fix the `branch` custom field layout on Stock Entry to eliminate duplicate Details section.

Stock Entry-branch was originally provisioned with `insert_after: null`, which placed
it before the standard `stock_entry_details_tab` (Tab Break: "Details"). Because a
visible field preceded the first Tab Break, Frappe's form layout synthesized an extra
Tab Break labeled "Details", causing two duplicate "Details" headers in the UI.

This patch updates `Stock Entry-branch` to `insert_after: "company"`, merging it
into the standard Details section and eliminating the duplicate section header.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	fields = get_custom_fields().get("Stock Entry")
	if fields:
		create_custom_fields({"Stock Entry": fields}, update=True)

	if frappe.db.exists("Custom Field", "Stock Entry-branch"):
		frappe.db.set_value(
			"Custom Field",
			"Stock Entry-branch",
			"insert_after",
			"company",
			update_modified=False,
		)

	_update_stock_entry_field_order()
	frappe.clear_cache(doctype="Stock Entry")


def _update_stock_entry_field_order():
	meta = frappe.get_meta("Stock Entry")
	fields = [f.fieldname for f in meta.fields]

	repositioned = ["naming_series", "company", "branch", "stock_entry_type", "inspection_required"]
	for fn in repositioned:
		if fn in fields:
			fields.remove(fn)

	left_subset = ["naming_series", "company", "branch", "stock_entry_type"]
	insert_idx = (fields.index("stock_entry_details_tab") + 1) if "stock_entry_details_tab" in fields else 0
	for i, fn in enumerate(left_subset):
		fields.insert(insert_idx + i, fn)

	if "set_posting_time" in fields:
		spt_idx = fields.index("set_posting_time")
		fields.insert(spt_idx, "inspection_required")
	else:
		fields.append("inspection_required")

	if frappe.db.exists("Property Setter", "Stock Entry-main-field_order"):
		frappe.db.set_value(
			"Property Setter",
			"Stock Entry-main-field_order",
			"value",
			frappe.as_json(fields),
			update_modified=False,
		)
	else:
		frappe.make_property_setter(
			{
				"doctype": "Stock Entry",
				"doctype_or_field": "DocType",
				"property": "field_order",
				"value": frappe.as_json(fields),
				"property_type": "Data",
			},
			is_system_generated=False,
		)

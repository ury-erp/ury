"""Desk wrapper around ``get_shadow_comparison_report`` (T15 / gap G-15).

Flattens the structured, per-closing-entry comparison into one row per
(closing entry, item) so it renders as a normal Query/Script Report grid.
All comparison logic lives in
``ury.ury.api.ury_stock_authority_shadow_report`` -- this file only shapes
that data for the Desk report view.
"""

import frappe

from ury.ury.api.ury_stock_authority_shadow_report import get_shadow_comparison_report


def execute(filters=None):
	filters = frappe._dict(filters or {})
	branch = filters.get("branch")
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")

	columns = [
		{"label": "POS Closing Entry", "fieldname": "pos_closing_entry", "fieldtype": "Link", "options": "POS Closing Entry", "width": 160},
		{"label": "Item", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 140},
		{"label": "Policy", "fieldname": "production_policy", "fieldtype": "Data", "width": 120},
		{"label": "Native Deduction Qty", "fieldname": "native_deduction_qty", "fieldtype": "Float", "width": 140},
		{"label": "Shadow Production Qty", "fieldname": "shadow_production_qty", "fieldtype": "Float", "width": 150},
		{"label": "Shadow Stock Entries", "fieldname": "shadow_stock_entries", "fieldtype": "Data", "width": 160},
		{"label": "Consistent", "fieldname": "consistent", "fieldtype": "Check", "width": 90},
		{"label": "Discrepancy", "fieldname": "discrepancy_reason", "fieldtype": "Data", "width": 320},
	]

	if not (branch and from_date and to_date):
		return columns, []

	report = get_shadow_comparison_report(branch, from_date, to_date)

	rows = []
	for closing_entry in report["closing_entries"]:
		for item in closing_entry["items"]:
			rows.append(
				{
					"pos_closing_entry": closing_entry["pos_closing_entry"],
					"item_code": item["item_code"],
					"production_policy": item["production_policy"],
					"native_deduction_qty": item["native_deduction_qty"],
					"shadow_production_qty": item["shadow_production_qty"],
					"shadow_stock_entries": ", ".join(item["shadow_stock_entries"]),
					"consistent": 1 if item["consistent"] else 0,
					"discrepancy_reason": item["discrepancy_reason"] or "",
				}
			)

	return columns, rows

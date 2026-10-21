# Copyright (c) 2026, Tridz Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"label": _("Stock Correction"), "fieldname": "stock_correction", "fieldtype": "Link", "options": "Stock Correction", "width": 160},
		{"label": _("Item Code"), "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 130},
		{"label": _("Item Name"), "fieldname": "item_name", "fieldtype": "Data", "width": 160},
		{"label": _("Warehouse"), "fieldname": "warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 150},
		{"label": _("Quantity (Delta)"), "fieldname": "qty_delta", "fieldtype": "Float", "precision": 3, "width": 120},
		{"label": _("UOM"), "fieldname": "uom", "fieldtype": "Link", "options": "UOM", "width": 80},
		{"label": _("Branch"), "fieldname": "branch", "fieldtype": "Link", "options": "Branch", "width": 120},
		{"label": _("Posting Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
		{"label": _("Short"), "fieldname": "short", "fieldtype": "Float", "precision": 3, "width": 90},
		{"label": _("Excess"), "fieldname": "excess", "fieldtype": "Float", "precision": 3, "width": 90},
		{"label": _("Type"), "fieldname": "type", "fieldtype": "Data", "width": 90},
	]


def get_data(filters):
	# On v16, Stock Correction Item.qty is the counted qty and current_qty the
	# system qty, so the real delta is qty - current_qty.
	return frappe.db.sql(
		"""
		SELECT
			sc.name AS stock_correction,
			sci.item_code,
			sci.item_name,
			sci.warehouse,
			ROUND(sci.qty - IFNULL(sci.current_qty, 0), 3) AS qty_delta,
			sci.uom,
			sc.branch,
			sc.posting_date,
			CASE WHEN sci.qty - IFNULL(sci.current_qty, 0) < 0
				THEN ROUND(ABS(sci.qty - IFNULL(sci.current_qty, 0)), 3) ELSE 0 END AS short,
			CASE WHEN sci.qty - IFNULL(sci.current_qty, 0) > 0
				THEN ROUND(sci.qty - IFNULL(sci.current_qty, 0), 3) ELSE 0 END AS excess,
			CASE
				WHEN sci.qty - IFNULL(sci.current_qty, 0) < 0 THEN 'Short'
				WHEN sci.qty - IFNULL(sci.current_qty, 0) > 0 THEN 'Excess'
				ELSE 'No Change'
			END AS type
		FROM `tabStock Correction` sc
		JOIN `tabStock Correction Item` sci ON sc.name = sci.parent
		WHERE
			sc.branch = %(branch)s
			AND sc.posting_date >= %(start_date)s
			AND sc.posting_date <= %(end_date)s
			AND sc.docstatus = 1
			AND (%(warehouse)s = '' OR sci.warehouse = %(warehouse)s)
		ORDER BY sc.posting_date DESC, sci.item_code
		""",
		{
			"branch": filters.get("branch"),
			"start_date": filters.get("start_date"),
			"end_date": filters.get("end_date"),
			"warehouse": filters.get("warehouse") or "",
		},
		as_dict=True,
	)

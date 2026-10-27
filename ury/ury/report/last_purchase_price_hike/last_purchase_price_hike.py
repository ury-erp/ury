# Copyright (c) 2026, Tridz and contributors
# For license information, please see license.txt

import frappe

def execute(filters=None):

	columns = [
		{"label": "Date", "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
		{"label": "Item", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 150},
		{"label": "Supplier", "fieldname": "supplier", "fieldtype": "Link", "options": "Supplier", "width": 150},
		{"label": "Previous Rate", "fieldname": "previous_rate", "fieldtype": "Currency", "width": 120},
		{"label": "Current Rate", "fieldname": "current_rate", "fieldtype": "Currency", "width": 120},
		{"label": "Increase ₹", "fieldname": "increase_amount", "fieldtype": "Currency", "width": 120},
		{"label": "Increase %", "fieldname": "increase_percent", "fieldtype": "Percent", "width": 100},
		{"label": "Qty", "fieldname": "qty", "fieldtype": "Float", "width": 100},
		{"label": "Invoice", "fieldname": "invoice", "fieldtype": "Link", "options": "Purchase Invoice", "width": 150},
	]

	data = frappe.db.sql("""
		SELECT *
		FROM (
			SELECT
				pi.posting_date,
				pii.item_code,
				pi.supplier,
				pii.rate AS current_rate,
				pii.qty,
				pi.name AS invoice,

				LAG(pii.rate) OVER (
					PARTITION BY pii.item_code
					ORDER BY pi.posting_date, pi.name
				) AS previous_rate

			FROM `tabPurchase Invoice` pi
			JOIN `tabPurchase Invoice Item` pii
				ON pi.name = pii.parent
			WHERE
				pi.docstatus = 1
		) t
		WHERE
			t.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND t.previous_rate IS NOT NULL
			AND (t.current_rate - t.previous_rate) > 0
		ORDER BY
			t.posting_date DESC,
			((t.current_rate - t.previous_rate) / t.previous_rate) DESC
	""", filters, as_dict=1)

	for row in data:
		increase = row.current_rate - row.previous_rate
		row["increase_amount"] = increase
		row["increase_percent"] = (increase / row.previous_rate) * 100

	return columns, data
# Copyright (c) 2024, Tridz Technologies Pvt. Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe import _

def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data

def get_columns():
	return [
		{
			"fieldname": "item_code",
			"label": _("Item Code"),
			"fieldtype": "Link",
			"options": "Item",
			"width": 120
		},
		{
			"fieldname": "item_name",
			"label": _("Item Name"),
			"fieldtype": "Data",
			"width": 150
		},
		{
			"fieldname": "total_qty",
			"label": _("Total Quantity Sold"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "total_revenue",
			"label": _("Total Revenue"),
			"fieldtype": "Currency",
			"width": 120
		},
		{
			"fieldname": "invoice_count",
			"label": _("Number of Invoices"),
			"fieldtype": "Int",
			"width": 120
		}
	]

def get_data(filters):
	conditions = get_conditions(filters)
	
	data = frappe.db.sql(f"""
		SELECT
			item.item_code,
			item.item_name,
			SUM(item.qty) as total_qty,
			SUM(item.amount) as total_revenue,
			COUNT(DISTINCT parent.name) as invoice_count
		FROM
			`tabPOS Invoice Item` item
		INNER JOIN
			`tabPOS Invoice` parent ON item.parent = parent.name
		WHERE
			parent.docstatus = 1
			AND parent.is_return = 0
			{conditions}
		GROUP BY
			item.item_code
		ORDER BY
			total_qty DESC
	""", filters, as_dict=1)
	
	return data

def get_conditions(filters):
	conditions = []
	
	if filters.get("from_date"):
		conditions.append("parent.posting_date >= %(from_date)s")
	
	if filters.get("to_date"):
		conditions.append("parent.posting_date <= %(to_date)s")
		
	if filters.get("pos_profile"):
		conditions.append("parent.pos_profile = %(pos_profile)s")
		
	if filters.get("company"):
		conditions.append("parent.company = %(company)s")

	return "AND " + " AND ".join(conditions) if conditions else ""

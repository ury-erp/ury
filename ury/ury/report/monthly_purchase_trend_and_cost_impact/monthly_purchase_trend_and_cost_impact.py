# Copyright (c) 2026, Tridz and contributors
# For license information, please see license.txt

import frappe
import datetime
from frappe.utils import get_first_day, get_last_day, add_months


def execute(filters=None):

	month_number = datetime.datetime.strptime(filters.month, "%B").month
	year = int(filters.year)
	company = filters.get("company")
	if not company:
		frappe.throw("Company is a mandatory filter for this report.")
	currency = frappe.get_cached_value("Company", company, "default_currency") or ""

	month_date = datetime.date(year, month_number, 1)

	current_start = get_first_day(month_date)
	current_end = get_last_day(month_date)

	prev_start = get_first_day(add_months(month_date, -1))
	prev_end = get_last_day(add_months(month_date, -1))

	columns = [
		{"label": "Item", "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 150},
		{"label": f"Previous Avg ({currency})", "fieldname": "prev_avg", "fieldtype": "Currency", "options": currency, "width": 120},
		{"label": f"Current Avg ({currency})", "fieldname": "curr_avg", "fieldtype": "Currency", "options": currency, "width": 120},
		{"label": f"Change ({currency})", "fieldname": "change_amount", "fieldtype": "Currency", "options": currency, "width": 120},
		{"label": "Change %", "fieldname": "change_percent", "fieldtype": "Percent", "width": 100},
		{"label": "Current Qty", "fieldname": "curr_qty", "fieldtype": "Float", "width": 100},
		{"label": f"Impact ({currency})", "fieldname": "impact", "fieldtype": "Currency", "options": currency, "width": 120},
		{"label": "Major Supplier", "fieldname": "major_supplier", "fieldtype": "Link", "options": "Supplier", "width": 150},
	]

	prev_data = get_avg(prev_start, prev_end, company, filters.get("item_group"))
	curr_data = get_avg(current_start, current_end, company, filters.get("item_group"))

	supplier_map = get_major_suppliers(company)

	result = []

	for item in curr_data:
		if item not in prev_data:
			continue

		prev_avg = prev_data[item]["avg"] or 0
		curr_avg = curr_data[item]["avg"] or 0
		curr_qty = curr_data[item]["qty"]

		change = curr_avg - prev_avg
		if change == 0:
			continue

		percent = (change / prev_avg) * 100 if prev_avg else 0
		impact = change * curr_qty

		if filters.get("min_impact") and impact < filters.min_impact:
			continue

		result.append({
			"item_code": item,
			"prev_avg": prev_avg,
			"curr_avg": curr_avg,
			"change_amount": change,
			"change_percent": percent,
			"curr_qty": curr_qty,
			"impact": impact,
			"major_supplier": supplier_map.get(item)
		})

	# Sort by highest financial impact
	result.sort(key=lambda x: x["impact"], reverse=True)

	return columns, result


def get_avg(start, end, company, item_group=None):

	conditions = " AND pi.company = %s"
	values = [start, end, company]

	if item_group:
		conditions += " AND item.item_group = %s"
		values.append(item_group)

	data = frappe.db.sql(f"""
		SELECT
			pii.item_code,
			SUM(pii.base_net_amount)/SUM(pii.qty) AS avg_rate,
			SUM(pii.qty) AS total_qty
		FROM `tabPurchase Invoice Item` pii
		JOIN `tabPurchase Invoice` pi
			ON pi.name = pii.parent
		JOIN `tabItem` item
			ON item.name = pii.item_code
		WHERE
			pi.posting_date BETWEEN %s AND %s
			AND pi.docstatus = 1
			{conditions}
		GROUP BY pii.item_code
		HAVING SUM(pii.qty) > 0
	""", values, as_dict=1)

	return {
		d.item_code: {"avg": d.avg_rate, "qty": d.total_qty}
		for d in data
	}


def get_major_suppliers(company):

	data = frappe.db.sql("""
		SELECT
			pii.item_code,
			pi.supplier,
			COUNT(*) as purchase_count
		FROM `tabPurchase Invoice Item` pii
		JOIN `tabPurchase Invoice` pi
			ON pi.name = pii.parent
		WHERE pi.docstatus = 1
			AND pi.company = %s
		GROUP BY pii.item_code, pi.supplier
		ORDER BY pii.item_code, purchase_count DESC
	""", company, as_dict=1)

	result = {}
	for row in data:
		if row.item_code not in result:
			result[row.item_code] = row.supplier

	return result
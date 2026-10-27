# Copyright (c) 2026, Ashique and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import add_days

def execute(filters=None):
	if not filters:
		filters = frappe._dict()
	elif not isinstance(filters, (dict, frappe._dict)):
		filters = frappe._dict(filters)
	else:
		filters = frappe._dict(filters)

	# Ensure all optional filters have safe default values to prevent KeyError in SQL execution
	filters.setdefault("start_date", None)
	filters.setdefault("end_date", None)
	filters.setdefault("branch", None)
	filters.setdefault("order_type", "")
	filters.setdefault("customer", "")

	# Early return if mandatory filters are not provided
	if not filters.start_date or not filters.end_date or not filters.branch:
		return get_columns(), []

	columns = get_columns()
	data = get_data(filters)
	return columns, data

def get_columns():
	return [
		{
			"fieldname": "item_name",
			"label": _("Item Name"),
			"fieldtype": "Data",
			"width": 150
		},
		{
			"fieldname": "qty",
			"label": _("Qty"),
			"fieldtype": "Float",
			"width": 100
		},
		{
			"fieldname": "amount",
			"label": _("Amount"),
			"fieldtype": "Currency",
			"width": 120
		}
	]

def get_data(filters):
	branch = filters.branch
	
	# Fetch hours cut-off setting for the branch to properly bound the date range
	hours = frappe.db.get_value("URY Report Settings", {"branch": branch}, "hours")
	try:
		hours = float(hours) if hours is not None else 0
	except (ValueError, TypeError):
		hours = 0

	conditions = [
		"a.branch = %(branch)s",
		"a.status IN ('Consolidated', 'Paid')",
		"a.docstatus = 1",
		"(b.is_disposable = 0 OR b.is_disposable IS NULL)"
	]

	filters["disposable_pattern"] = "%disposable%"
	conditions.append("LOWER(IFNULL(c.item_group, IFNULL(b.item_group, ''))) NOT LIKE %(disposable_pattern)s")

	if hours > 0:
		filters["start_datetime"] = f"{filters.start_date} {int(hours):02d}:00:00"
		filters["end_datetime"] = f"{add_days(filters.end_date, 1)} {int(hours):02d}:00:00"
		conditions.append("TIMESTAMP(a.posting_date, a.posting_time) >= %(start_datetime)s")
		conditions.append("TIMESTAMP(a.posting_date, a.posting_time) < %(end_datetime)s")
	else:
		conditions.append("a.posting_date >= %(start_date)s")
		conditions.append("a.posting_date <= %(end_date)s")

	order_type = (filters.order_type or "").strip()
	if order_type:
		if order_type.lower() in ("take away", "takeaway"):
			conditions.append("(a.order_type IN ('Take away', 'Take Away') AND a.restaurant_table IS NULL)")
		elif order_type.lower() == "table takeaway":
			conditions.append("(a.order_type IN ('Take away', 'Take Away') AND a.restaurant_table IS NOT NULL)")
		else:
			conditions.append("a.order_type = %(order_type)s")

	customer = (filters.customer or "").strip()
	if customer:
		conditions.append("a.customer = %(customer)s")

	where_clause = " AND ".join(conditions)

	query = f"""
		SELECT
			IFNULL(c.item_name, b.item_code) AS item_name,
			SUM(b.qty) AS qty,
			SUM(b.amount) AS amount
		FROM `tabPOS Invoice` a
		INNER JOIN `tabPOS Invoice Item` b ON a.name = b.parent
		LEFT JOIN `tabItem` c ON c.item_code = b.item_code
		WHERE {where_clause}
		GROUP BY IFNULL(c.item_name, b.item_code)
		ORDER BY item_name ASC
	"""
	return frappe.db.sql(query, filters, as_dict=True)

@frappe.whitelist()
def get_aggregator_customers(doctype, txt, searchfield, start, page_len, filters):
	if isinstance(filters, str):
		import json
		filters = json.loads(filters)

	branch = filters.get("branch") if filters else None
	if not branch:
		return []

	res = frappe.db.sql("""
		SELECT customer, customer
		FROM `tabAggregator Settings`
		WHERE parent = %s AND customer LIKE %s
		ORDER BY customer ASC
		LIMIT %s, %s
	""", (branch, f"%{txt or ''}%", int(start or 0), int(page_len or 20)))

	if not res:
		res = frappe.db.sql("""
			SELECT name, customer_name
			FROM `tabCustomer`
			WHERE customer_group = 'Aggregators' AND (name LIKE %s OR customer_name LIKE %s)
			ORDER BY name ASC
			LIMIT %s, %s
		""", (f"%{txt or ''}%", f"%{txt or ''}%", int(start or 0), int(page_len or 20)))

	return res


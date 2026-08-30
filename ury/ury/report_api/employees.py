import frappe

from ury.ury.report_api.utils import (
	date_list_cte,
	get_business_day_condition,
	report_settings_join,
	require_manager,
	validate_date_range,
)


@frappe.whitelist()
def search_employees(query, limit=10):
	"""Autocomplete search backing Employee Item Wise Sales' employee picker
	(analogous to customers.search_customers)."""
	require_manager()

	if not query or len(query) < 2:
		return []

	limit = min(int(limit), 25)

	return frappe.get_list(
		"User",
		filters=[["full_name", "like", f"%{query}%"]],
		fields=["name", "full_name"],
		limit=limit,
		order_by="full_name asc",
	)


@frappe.whitelist()
def get_employee_sales(start_date, end_date, branch=None, sort_by="sales_amount"):
	"""Staff sales leaderboard over a date range.

	Mirrors the existing "Employee Sales" Query Report, restructured from a
	per-employee-per-date table into a per-employee leaderboard (summed
	across the whole range) per the research brief — managers think in
	terms of "who's on top this month," not a flat date x employee grid.
	`waiter` is the field on POS Invoice identifying staff (joined to
	tabUser for full_name), matching the original report exactly.
	"""
	require_manager()
	validate_date_range(start_date, end_date)
	if sort_by not in ("sales_amount", "total_invoices"):
		sort_by = "sales_amount"

	date_list = date_list_cte()

	if branch:
		condition = get_business_day_condition(date_expr="date_list.`date`")
		join = report_settings_join()
		params = {"branch": branch, "start_date": start_date, "end_date": end_date}
		invoice_join = "b.`branch` = %(branch)s AND b.`status` IN (\"Consolidated\", \"Paid\") AND b.`docstatus` = 1"
	else:
		condition = "b.`posting_date` = date_list.`date`"
		join = ""
		params = {"start_date": start_date, "end_date": end_date}
		invoice_join = "b.`status` IN (\"Consolidated\", \"Paid\") AND b.`docstatus` = 1"

	rows = frappe.db.sql(
		f"""
		SELECT
			e.`name` AS employee_id,
			e.`full_name` AS employee_name,
			COUNT(b.`name`) AS total_invoices,
			ROUND(SUM(b.`grand_total`), 2) AS sales_amount,
			ROUND(SUM(b.`net_total`), 2) AS net_sales_amount
		FROM {date_list}
		LEFT JOIN `tabPOS Invoice` b ON ({invoice_join})
		INNER JOIN `tabUser` e ON (e.`name` = b.`waiter`)
		{join}
		WHERE {condition}
		GROUP BY e.`name`
		ORDER BY {sort_by} DESC
		""",
		params,
		as_dict=True,
	)

	unattributed = frappe.db.sql(
		f"""
		SELECT COUNT(b.`name`) AS invoices, ROUND(SUM(b.`grand_total`), 2) AS sales
		FROM {date_list}
		LEFT JOIN `tabPOS Invoice` b ON ({invoice_join})
		LEFT JOIN `tabUser` e ON (e.`name` = b.`waiter`)
		{join}
		WHERE {condition} AND e.`name` IS NULL
		""",
		params,
		as_dict=True,
	)[0]

	for i, r in enumerate(rows, start=1):
		r["rank"] = i
		r["sales_amount"] = r["sales_amount"] or 0
		r["average_invoice_value"] = (
			round(r["sales_amount"] / r["total_invoices"], 2) if r["total_invoices"] else 0
		)

	return {
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"employees": rows,
		"summary": {
			"total_employees": len(rows),
			"period_total_invoices": sum(r["total_invoices"] for r in rows),
			"period_total_sales": round(sum(r["sales_amount"] for r in rows), 2),
			"unattributed_invoices": unattributed["invoices"] or 0,
			"unattributed_sales": unattributed["sales"] or 0,
		},
	}


@frappe.whitelist()
def get_employee_item_wise_sales(employee, start_date, end_date, branch=None):
	"""Item-level sales breakdown for a single employee ("waiter") over a
	date range — a drill-down, same pattern as get_customer_data.

	Mirrors the existing "Employee Item Wise Sales" Query Report. Soft-
	depends on get_employee_sales sharing the same `waiter`-join convention
	(the employee picker here reuses search_employees above, and the
	returned employee_id is what a leaderboard row in get_employee_sales
	would link out to).
	"""
	require_manager()
	validate_date_range(start_date, end_date)

	if not employee:
		frappe.throw("employee is required.")

	date_list = date_list_cte()

	if branch:
		condition = get_business_day_condition(date_expr="date_list.`date`", prefix="a")
		join = report_settings_join(prefix="a")
		params = {"branch": branch, "employee": employee, "start_date": start_date, "end_date": end_date}
		invoice_join = "a.`branch` = %(branch)s AND a.`status` IN (\"Consolidated\", \"Paid\") AND a.`docstatus` = 1 AND a.`waiter` = %(employee)s"
	else:
		condition = "a.`posting_date` = date_list.`date`"
		join = ""
		params = {"employee": employee, "start_date": start_date, "end_date": end_date}
		invoice_join = "a.`status` IN (\"Consolidated\", \"Paid\") AND a.`docstatus` = 1 AND a.`waiter` = %(employee)s"

	rows = frappe.db.sql(
		f"""
		SELECT
			b.`item_code` AS item_code,
			b.`item_name` AS item_name,
			i.`item_group` AS item_group,
			ROUND(SUM(b.`qty`), 2) AS qty,
			ROUND(SUM(b.`amount`), 2) AS amount
		FROM {date_list}
		LEFT JOIN `tabPOS Invoice` a ON ({invoice_join})
		INNER JOIN `tabPOS Invoice Item` b ON (a.`name` = b.`parent`)
		LEFT JOIN `tabItem` i ON (b.`item_code` = i.`item_code`)
		{join}
		WHERE {condition}
		GROUP BY b.`item_code`
		ORDER BY amount DESC
		""",
		params,
		as_dict=True,
	)
	for r in rows:
		r["qty"] = r["qty"] or 0
		r["amount"] = r["amount"] or 0

	employee_name = frappe.db.get_value("User", employee, "full_name") or employee

	return {
		"employee": employee,
		"employee_name": employee_name,
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"items": rows,
		"summary": {
			"total_qty": round(sum(r["qty"] for r in rows), 2),
			"total_amount": round(sum(r["amount"] for r in rows), 2),
		},
	}

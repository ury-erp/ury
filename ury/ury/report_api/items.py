import frappe

from ury.ury.report_api.utils import (
	date_list_cte,
	get_business_day_condition,
	report_settings_join,
	require_manager,
	validate_date_range,
)


@frappe.whitelist()
def get_item_wise_sales(start_date, end_date, branch=None, item_group=None, search=None, page=1, page_size=50):
	"""Item-level sales ranking over a date range.

	Mirrors the existing "Item Wise Sales" Query Report, extended with
	pagination, an item_group filter, and a name/code search — this report
	commonly returns the full menu catalog (potentially hundreds of rows),
	which the original report just dumped unpaginated. Defaults to
	amount-descending (best-sellers first) rather than the original's
	alphabetical-by-group ordering, since this is fundamentally a ranking
	report per the research brief.
	"""
	require_manager()
	validate_date_range(start_date, end_date)

	page = max(1, int(page))
	page_size = max(1, min(int(page_size), 200))
	offset = (page - 1) * page_size

	date_list = date_list_cte()

	if branch:
		condition = get_business_day_condition(date_expr="date_list.`date`", prefix="a")
		join = report_settings_join(prefix="a")
		params = {"branch": branch, "start_date": start_date, "end_date": end_date}
		invoice_join = "a.`branch` = %(branch)s AND a.`status` IN (\"Consolidated\", \"Paid\") AND a.`docstatus` = 1"
	else:
		condition = "a.`posting_date` = date_list.`date`"
		join = ""
		params = {"start_date": start_date, "end_date": end_date}
		invoice_join = "a.`status` IN (\"Consolidated\", \"Paid\") AND a.`docstatus` = 1"

	extra_filters = ""
	if item_group:
		extra_filters += " AND c.`item_group` = %(item_group)s"
		params["item_group"] = item_group
	if search:
		extra_filters += " AND (c.`item_name` LIKE %(search)s OR b.`item_code` LIKE %(search)s)"
		params["search"] = f"%{search}%"

	base_sql = f"""
		FROM {date_list}
		LEFT JOIN `tabPOS Invoice` a ON ({invoice_join})
		INNER JOIN `tabPOS Invoice Item` b ON a.`name` = b.`parent`
		LEFT JOIN `tabItem` c ON c.`item_code` = b.`item_code`
		{join}
		WHERE {condition} {extra_filters}
		GROUP BY b.`item_code`
	"""

	total_count = frappe.db.sql(
		f"SELECT COUNT(*) AS total FROM (SELECT 1 {base_sql}) AS sub",
		params,
		as_dict=True,
	)[0]["total"]

	summary_row = frappe.db.sql(
		f"SELECT ROUND(SUM(b.`qty`), 2) AS total_qty, ROUND(SUM(b.`amount`), 2) AS total_amount {base_sql.replace('GROUP BY b.`item_code`', '')}",
		params,
		as_dict=True,
	)[0]

	params["limit"] = page_size
	params["offset"] = offset
	rows = frappe.db.sql(
		f"""
		SELECT
			b.`item_code` AS item_code,
			c.`item_name` AS item_name,
			c.`item_group` AS item_group,
			ROUND(SUM(b.`qty`), 2) AS qty,
			ROUND(SUM(b.`amount`), 2) AS amount
		{base_sql}
		ORDER BY amount DESC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		params,
		as_dict=True,
	)

	total_qty = summary_row["total_qty"] or 0
	total_amount = summary_row["total_amount"] or 0
	for r in rows:
		r["qty"] = r["qty"] or 0
		r["amount"] = r["amount"] or 0
		r["avg_price"] = round(r["amount"] / r["qty"], 2) if r["qty"] else 0
		r["pct_of_total_amount"] = round((r["amount"] / total_amount) * 100, 1) if total_amount else 0

	return {
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"items": rows,
		"summary": {"total_qty": total_qty, "total_amount": total_amount, "unique_items": total_count},
		"pagination": {
			"page": page,
			"page_size": page_size,
			"total": total_count,
			"total_pages": (total_count + page_size - 1) // page_size if total_count else 0,
		},
	}


@frappe.whitelist()
def get_item_groups():
	"""Item groups for the Item Wise Sales filter dropdown."""
	require_manager()
	return frappe.get_all("Item Group", fields=["name"], order_by="name asc", limit_page_length=0)


@frappe.whitelist()
def get_item_wise_purchase_history(start_date, end_date, branch=None, page=1, page_size=50):
	"""Item-level purchase (procurement) breakdown over a date range.

	Unlike every other report in this section, there is no existing URY
	Query Report to port from — research (a dedicated investigation pass,
	including checking the restored demo DB directly) found no custom URY
	code touching purchasing at all, but confirmed real submitted Purchase
	Invoice + Purchase Invoice Item data exists (created via standard
	ERPNext Desk, not any URY-specific workflow). Built directly against
	those standard doctypes rather than POS Invoice. No extended-hours
	boundary logic applies here — that's specific to URY's POS Invoice
	business-day handling, not standard ERPNext purchasing.
	"""
	require_manager()
	validate_date_range(start_date, end_date)

	page = max(1, int(page))
	page_size = max(1, min(int(page_size), 200))
	offset = (page - 1) * page_size

	params = {"start_date": start_date, "end_date": end_date, "limit": page_size, "offset": offset}
	branch_filter = ""
	if branch:
		params["branch"] = branch
		branch_filter = "AND a.`branch` = %(branch)s"

	base_sql = f"""
		FROM `tabPurchase Invoice` a
		INNER JOIN `tabPurchase Invoice Item` b ON a.`name` = b.`parent`
		WHERE a.`docstatus` = 1
			AND a.`posting_date` BETWEEN %(start_date)s AND %(end_date)s
			{branch_filter}
		GROUP BY b.`item_code`
	"""

	total_count = frappe.db.sql(
		f"SELECT COUNT(*) AS total FROM (SELECT 1 {base_sql}) AS sub",
		params,
		as_dict=True,
	)[0]["total"]

	summary_row = frappe.db.sql(
		f"SELECT ROUND(SUM(b.`qty`), 2) AS total_qty, ROUND(SUM(b.`amount`), 2) AS total_amount {base_sql.replace('GROUP BY b.`item_code`', '')}",
		params,
		as_dict=True,
	)[0]

	rows = frappe.db.sql(
		f"""
		SELECT
			b.`item_code` AS item_code,
			b.`item_name` AS item_name,
			ROUND(SUM(b.`qty`), 2) AS qty,
			ROUND(AVG(b.`rate`), 2) AS avg_rate,
			ROUND(SUM(b.`amount`), 2) AS amount,
			COUNT(DISTINCT a.`name`) AS purchase_count,
			COUNT(DISTINCT a.`supplier`) AS supplier_count
		{base_sql}
		ORDER BY amount DESC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		params,
		as_dict=True,
	)
	for r in rows:
		r["qty"] = r["qty"] or 0
		r["avg_rate"] = r["avg_rate"] or 0
		r["amount"] = r["amount"] or 0

	return {
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"items": rows,
		"summary": {"total_qty": summary_row["total_qty"] or 0, "total_amount": summary_row["total_amount"] or 0},
		"pagination": {
			"page": page,
			"page_size": page_size,
			"total": total_count,
			"total_pages": (total_count + page_size - 1) // page_size if total_count else 0,
		},
	}

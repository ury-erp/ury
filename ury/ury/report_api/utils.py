import frappe


def require_manager():
	"""Raise frappe.PermissionError unless the current user is a URY Manager,
	System Manager, or Administrator. Every report_api endpoint must call this
	first — the frontend's AuthGuard hides the nav item but is not a security
	boundary on its own.
	"""
	allowed_roles = {"URY Manager", "System Manager"}
	user_roles = set(frappe.get_roles())
	if frappe.session.user == "Administrator":
		return
	if not allowed_roles & user_roles:
		frappe.throw(
			"You do not have permission to access this report.",
			frappe.PermissionError,
		)


def get_business_day_condition(date_expr="curdate()", prefix="b"):
	"""Return a SQL fragment implementing URY's extended-business-day boundary
	logic, shared by every report that needs "today"/a single business day,
	or a per-row business day when grouped over a date range.

	Mirrors the logic already duplicated across the existing Query Reports
	(see e.g. today's_sales.json / daywise_sales.json): if URY Report
	Settings has extended_hours with hours > 0, the business day runs from
	`hours`:00:00 on the given date through `hours`:00:00 the next calendar
	day; otherwise it's the plain calendar date.

	`date_expr` is a raw SQL expression for "the date to check against" —
	pass a bind-param placeholder (e.g. "%(target_date)s") for a single-day
	report, or a column reference (e.g. "date_list.`date`") for a date-range
	report grouped per day. Defaults to CURDATE(). `prefix` is the POS
	Invoice table alias used in the caller's query (matches existing
	convention of aliasing tabPOS Invoice as `b`).
	"""
	return f"""(
		((rs.`hours` IS NULL OR rs.`hours` = 0) AND {prefix}.`posting_date` = {date_expr})
		OR (rs.`hours` > 0 AND TIMESTAMP({prefix}.`posting_date`, {prefix}.`posting_time`)
			<= TIMESTAMP(DATE_ADD({date_expr}, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00'))
			AND TIMESTAMP({prefix}.`posting_date`, {prefix}.`posting_time`)
			>= TIMESTAMP({date_expr}, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
		OR (rs.`branch` IS NULL AND {prefix}.`posting_date` = {date_expr})
	)"""


def date_list_cte(start_param="start_date", end_param="end_date"):
	"""Return a derived-table SQL fragment ("date_list") enumerating every
	calendar date from start_param to end_param inclusive, so date-range
	reports can LEFT JOIN against it and get a row for every day even when
	no invoices exist that day. Mirrors the number-generator pattern already
	used in the existing Query Reports (e.g. daywise_sales.json); supports
	up to 999 days, well above validate_date_range's default 366-day cap.
	"""
	return f"""(
		SELECT %({start_param})s AS `date`
		UNION
		SELECT DATE_ADD(%({start_param})s, INTERVAL n DAY) AS `date`
		FROM (
			SELECT a.N + b.N * 10 + c.N * 100 + 1 AS n
			FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) AS a
			CROSS JOIN (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) AS b
			CROSS JOIN (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) AS c
			ORDER BY n
		) AS nums
		WHERE DATE_ADD(%({start_param})s, INTERVAL n DAY) < %({end_param})s
		UNION
		SELECT %({end_param})s AS `date`
	) AS date_list"""


def report_settings_join(prefix="b", branch_param="branch"):
	"""Standard LEFT JOIN to URY Report Settings, matched on the same branch
	parameter as the caller's WHERE clause."""
	return f"LEFT JOIN `tabURY Report Settings` rs ON (rs.`branch` = %({branch_param})s)"


def validate_date_range(start_date, end_date, max_days=366):
	"""Shared validation for date-range report filters. Raises
	frappe.ValidationError on bad input so every report gets consistent
	error messages instead of a raw SQL failure."""
	if not start_date or not end_date:
		frappe.throw("Both start_date and end_date are required.")
	if frappe.utils.getdate(start_date) > frappe.utils.getdate(end_date):
		frappe.throw("start_date must not be after end_date.")
	if (frappe.utils.getdate(end_date) - frappe.utils.getdate(start_date)).days > max_days:
		frappe.throw(f"Date range cannot exceed {max_days} days.")

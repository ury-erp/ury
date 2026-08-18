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


def get_business_day_condition(branch_param="branch", date_param=None, prefix="b"):
	"""Return a (sql_fragment, extra_params) pair implementing URY's
	extended-business-day boundary logic, shared by every report that needs
	"today" or a single business day for a branch.

	Mirrors the logic already duplicated across the existing Query Reports
	(see e.g. today's_sales.json): if URY Report Settings has extended_hours
	with hours > 0, the business day runs from `hours`:00:00 on the given
	date through `hours`:00:00 the next calendar day; otherwise it's the
	plain calendar date.

	`date_param` is the bind-parameter name for the target date (defaults to
	CURDATE() when None). `prefix` is the POS Invoice table alias used in the
	caller's query (matches existing convention of aliasing tabPOS Invoice
	as `b`).
	"""
	date_sql = f"%({date_param})s" if date_param else "curdate()"
	condition = f"""(
		((rs.`hours` IS NULL OR rs.`hours` = 0) AND {prefix}.`posting_date` = {date_sql})
		OR (rs.`hours` > 0 AND TIMESTAMP({prefix}.`posting_date`, {prefix}.`posting_time`)
			<= TIMESTAMP(DATE_ADD({date_sql}, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00'))
			AND TIMESTAMP({prefix}.`posting_date`, {prefix}.`posting_time`)
			>= TIMESTAMP({date_sql}, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
		OR (rs.`branch` IS NULL AND {prefix}.`posting_date` = {date_sql})
	)"""
	return condition


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

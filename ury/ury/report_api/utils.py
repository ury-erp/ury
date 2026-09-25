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


#: Non-manager roles that identify a URY staff member (as opposed to a
#: portal/Website user or any other role-less logged-in user). Sourced from
#: `rg -o '"role": "URY[^"]*"' ury/ury/doctype` -- the actual role set granted
#: on URY doctypes across the app -- minus the manager-tier roles already
#: covered by `_MANAGER_ROLES` below.
STAFF_ROLES = {"URY Captain", "URY Cashier", "URY Admin", "URY Manager"}

#: Roles that bypass branch scoping entirely (any branch, or all branches
#: when none is supplied) -- mirrors require_manager()'s admin-bypass
#: convention.
_MANAGER_ROLES = {"URY Manager", "System Manager"}


def require_branch_staff(branch):
	"""Enforce that the current user may see dashboard data for `branch`,
	and return the effective branch to use for the query/cache key.

	Replaces the commented-out `require_manager()` gate in the
	staff-facing dashboard endpoints (get_active_insights, get_service_line,
	get_running_low) after upstream PR ury-erp/ury#456 intentionally opened
	those endpoints to non-manager staff roles so POS dashboard cards render
	for cashiers/captains, not just managers. Without this, any logged-in
	user -- including a Website/portal user -- could read any branch's data
	by passing an arbitrary `branch`, or every branch's data by passing
	none.

	Rules:
	  - Administrator / System Manager / URY Manager: allowed for any
	    branch, including None (meaning "all branches").
	  - Any other user must hold at least one URY staff role (see
	    STAFF_ROLES) AND must supply a `branch` that matches their own
	    branch, as resolved by ury.ury_pos.api.getBranch() (the same
	    Branch.user-child-table assignment the POS frontend itself relies
	    on). A staff user passing no branch, another branch, or no branch
	    assignment at all is rejected -- staff never get the "all branches"
	    view that managers get.
	  - Anyone else (no URY role at all, e.g. a Website/portal user) is
	    rejected outright.

	Raises frappe.PermissionError on any rejection.
	"""
	user = frappe.session.user
	if user == "Administrator":
		return branch

	user_roles = set(frappe.get_roles(user))
	if _MANAGER_ROLES & user_roles:
		return branch

	def _deny():
		frappe.throw(
			"You do not have permission to access this report.",
			frappe.PermissionError,
		)

	if not STAFF_ROLES & user_roles:
		_deny()

	if not branch:
		_deny()

	# Imported inside the function (not at module level) to avoid a
	# circular import -- ury.ury_pos.api imports from ury.ury.report_api in
	# other code paths.
	from ury.ury_pos.api import getBranch

	user_branch = getBranch()
	if branch != user_branch:
		_deny()

	return branch


def user_has_branch_access(user, branch):
	"""True if `user` is assigned to `branch` via Branch's `user` child table
	(rows of URY User, each linking a User in its own `user` field), or if
	`user` is Administrator or holds the System Manager role — matching the
	admin-bypass convention used by require_manager() so admins are never
	locked out.

	Shared by the staff-facing WRITE endpoints that accept a caller-supplied
	branch (record_yield_check in ury_yield_variance, and
	create_issue_authorization in ury_issue_authorization) to confirm the
	calling user is actually assigned to that specific branch, not merely
	that some branch/company value was supplied. Not used by the
	manager-gated reporting endpoints (get_yield_variance,
	get_yield_check_compliance), which intentionally rely on
	require_manager() instead — managers may report across branches they
	oversee even without a Branch.user row.
	"""
	if not user or not branch:
		return False
	if user == "Administrator":
		return True
	if "System Manager" in frappe.get_roles(user):
		return True
	return bool(
		frappe.db.exists(
			"URY User",
			{
				"parenttype": "Branch",
				"parent": branch,
				"parentfield": "user",
				"user": user,
			},
		)
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


def get_prior_business_day_condition(date_expr="curdate()", prefix="c"):
	"""Return a SQL fragment for "this invoice's business day is strictly
	BEFORE date_expr" — used for lifetime-first-visit checks (e.g. Repeated
	Customers' "is this the customer's first visit ever" NOT EXISTS clause).

	This is the strict-inequality sibling of get_business_day_condition,
	not a string transform of it: the legacy Repeated Customers Query
	Report's equivalent inline SQL has a bug in its first OR-branch
	(`(rs.hours IS NULL OR rs.hours = 0) IS NULL AND ...` — comparing a
	boolean expression to NULL is always NULL/false, so that branch never
	matches for a non-extended-hours branch, silently making almost every
	visit look "new"). This helper fixes that rather than reproducing it.
	"""
	return f"""(
		((rs.`hours` IS NULL OR rs.`hours` = 0) AND {prefix}.`posting_date` < {date_expr})
		OR (rs.`hours` > 0 AND TIMESTAMP({prefix}.`posting_date`, {prefix}.`posting_time`)
			< TIMESTAMP({date_expr}, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
		OR (rs.`branch` IS NULL AND {prefix}.`posting_date` < {date_expr})
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


def get_business_day_range_condition(start_param="start_date", end_param="end_date", prefix="b"):
	"""Return a SQL fragment for "does this invoice's business day fall within
	[start_param, end_param]" — the range analogue of get_business_day_condition,
	for invoice-level detail reports (e.g. Daywise Invoices) that filter a
	range directly rather than grouping via date_list_cte's per-day rows.
	Same extended-hours semantics as get_business_day_condition.
	"""
	return f"""(
		((rs.`hours` IS NULL OR rs.`hours` = 0) AND {prefix}.`posting_date` BETWEEN %({start_param})s AND %({end_param})s)
		OR (rs.`hours` > 0 AND TIMESTAMP({prefix}.`posting_date`, {prefix}.`posting_time`)
			>= TIMESTAMP(%({start_param})s, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00'))
			AND TIMESTAMP({prefix}.`posting_date`, {prefix}.`posting_time`)
			< TIMESTAMP(DATE_ADD(%({end_param})s, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
		OR (rs.`branch` IS NULL AND {prefix}.`posting_date` BETWEEN %({start_param})s AND %({end_param})s)
	)"""


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

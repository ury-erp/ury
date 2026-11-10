"""Aggregation for the Daily Operations dashboard (number cards and waiter chart).

Pure data layer: no whitelisted functions here, see `ury.ury.api.cashier_dashboard`.

Shared definitions
------------------
* Business day: an invoice belongs to the business day
  ``DATE(TIMESTAMP(posting_date, posting_time) - hours)`` where ``hours`` comes from the
  branch's ``URY Report Settings`` (0 when none). This is the same boundary as
  ``report_api.utils.get_business_day_condition`` and
  ``api.ury_dashboard._business_day_bounds``. "Now" is ``now_datetime()`` which is in the
  site (System Settings) timezone.
* Eligible sale: POS Invoice, ``docstatus = 1``, ``status IN ('Paid', 'Consolidated')``,
  ``is_return = 0``. Measure is ``grand_total``. Only POS Invoice is read, never Sales
  Invoice, so consolidated invoices are not counted twice.
* Branch scope: the branches the user is assigned to (``URY User`` rows). Elevated users
  without a branch see every branch. Anyone else without a branch gets an error.
"""

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, now_datetime

from ury.ury.utils.cashier_desk import ELEVATED_ROLES

ELIGIBLE_STATUSES = ("Paid", "Consolidated")
OPEN_KOT_STATUS = "Ready For Prepare"
OPEN_KOT_TYPES = ("New Order", "Order Modified", "Duplicate")

UNASSIGNED_LABEL = "Unassigned"
SYSTEM_WAITER = "Administrator"
SYSTEM_WAITER_LABEL = "Self Order / System"
OTHERS_LABEL = "Others"
CHART_DAYS = 7
CHART_MAX_WAITERS = 8


# ---------------------------------------------------------------------------
# Scope
# ---------------------------------------------------------------------------


def get_user_branches(user):
	"""All branches the user is assigned to through Branch -> URY User rows."""
	rows = frappe.db.sql(
		"""
		SELECT DISTINCT b.name AS branch
		FROM `tabURY User` AS a
		INNER JOIN `tabBranch` AS b ON a.parent = b.name
		WHERE a.user = %s
		""",
		(user,),
		as_dict=True,
	)
	return [r.branch for r in rows if r.branch]


def get_branch_scope(user=None):
	"""Return a list of branches, or None meaning "all branches" (elevated, unassigned).

	Never takes a branch from the caller.
	"""
	user = user or frappe.session.user
	branches = get_user_branches(user)
	if branches:
		return branches

	if user == "Administrator" or ELEVATED_ROLES & set(frappe.get_roles(user)):
		return None

	frappe.throw(_("User is not Associated with any Branch."), frappe.PermissionError)


def _branch_clause(scope, column="b.branch"):
	"""SQL fragment and params for a branch scope. `scope` is None or a list."""
	if scope is None:
		return "", {}
	params = {f"branch_{i}": branch for i, branch in enumerate(scope)}
	placeholders = ", ".join(f"%({key})s" for key in params)
	return f" AND {column} IN ({placeholders})", params


def _hours_expr(branch_column):
	return (
		"COALESCE((SELECT MAX(rs.`hours`) FROM `tabURY Report Settings` rs "
		f"WHERE rs.`branch` = {branch_column}), 0)"
	)


def _days_ago_expr(date_col, time_col, branch_column):
	"""SQL: how many business days before today's business day the row falls."""
	hours = _hours_expr(branch_column)
	return (
		f"DATEDIFF(DATE(DATE_SUB(TIMESTAMP(%(now)s), INTERVAL {hours} HOUR)), "
		f"DATE(DATE_SUB(TIMESTAMP({date_col}, {time_col}), INTERVAL {hours} HOUR)))"
	)


def _base_params(scope, now):
	_, params = _branch_clause(scope)
	params["now"] = now
	params["window_start"] = add_days(getdate(now), -(CHART_DAYS + 2))
	params["window_end"] = add_days(getdate(now), 1)
	return params


def _scope_hours(scope):
	"""Largest business-day offset (hours) in the scope, used to label chart days."""
	filters = {} if scope is None else {"branch": ["in", scope]}
	rows = frappe.get_all("URY Report Settings", filters=filters, pluck="hours")
	return max([int(h or 0) for h in rows] or [0])


# ---------------------------------------------------------------------------
# Number cards
# ---------------------------------------------------------------------------


def get_sales_summary(scope, now=None):
	"""{days_ago: {"sales": float, "bills": int}} for business days 0 (today) and 1 (yesterday)."""
	now = now or now_datetime()
	branch_sql, _p = _branch_clause(scope)
	params = _base_params(scope, now)
	params["statuses"] = ELIGIBLE_STATUSES
	days_ago = _days_ago_expr("b.posting_date", "b.posting_time", "b.branch")

	rows = frappe.db.sql(
		f"""
		SELECT {days_ago} AS days_ago,
			COALESCE(SUM(b.grand_total), 0) AS sales,
			COUNT(b.name) AS bills
		FROM `tabPOS Invoice` b
		WHERE b.docstatus = 1
			AND b.status IN %(statuses)s
			AND b.is_return = 0
			AND b.posting_date BETWEEN %(window_start)s AND %(window_end)s
			{branch_sql}
		GROUP BY days_ago
		HAVING days_ago IN (0, 1)
		""",
		params,
		as_dict=True,
	)

	result = {0: {"sales": 0.0, "bills": 0}, 1: {"sales": 0.0, "bills": 0}}
	for row in rows:
		result[int(row.days_ago)] = {"sales": flt(row.sales), "bills": int(row.bills)}
	return result


def get_average_bill(summary_day):
	"""Sales divided by bills, from the same query as the sales and bills cards."""
	bills = summary_day["bills"]
	return flt(summary_day["sales"] / bills, 2) if bills else 0.0


def get_cancelled_bills_today(scope, now=None):
	"""Cancelled POS Invoices whose business day is today (same basis as the manager card)."""
	now = now or now_datetime()
	branch_sql, _p = _branch_clause(scope)
	params = _base_params(scope, now)
	days_ago = _days_ago_expr("b.posting_date", "b.posting_time", "b.branch")
	rows = frappe.db.sql(
		f"""
		SELECT COUNT(b.name) AS total
		FROM `tabPOS Invoice` b
		WHERE b.docstatus = 2
			AND b.posting_date BETWEEN %(window_start)s AND %(window_end)s
			AND {days_ago} = 0
			{branch_sql}
		""",
		params,
		as_dict=True,
	)
	return int(rows[0].total) if rows else 0


def get_unsettled_bills(scope):
	"""Bills handed out and awaiting payment, any date.

	Same filter as the POS "Draft" tab (`ury_pos.api.getPosInvoice`): a draft that is
	either printed or has no table (takeaway). Running table orders that have not been
	billed yet (`invoice_printed = 0` with a table) are not unsettled.
	"""
	branch_sql, params = _branch_clause(scope)
	rows = frappe.db.sql(
		f"""
		SELECT COUNT(b.name) AS total
		FROM `tabPOS Invoice` b
		WHERE b.docstatus = 0
			AND b.status = 'Draft'
			AND (b.invoice_printed = 1 OR COALESCE(b.restaurant_table, '') = '')
			{branch_sql}
		""",
		params,
		as_dict=True,
	)
	return int(rows[0].total) if rows else 0


def get_open_kots(scope, now=None):
	"""KOTs the kitchen still has to prepare, for today's business day.

	Same triple as the `URY Open KOTs` card (submitted, Ready For Prepare, not verified),
	limited to order-type KOTs: cancel notifications are not kitchen work.
	"""
	now = now or now_datetime()
	branch_sql, _p = _branch_clause(scope, "k.branch")
	params = _base_params(scope, now)
	params["types"] = OPEN_KOT_TYPES
	params["open_status"] = OPEN_KOT_STATUS
	days_ago = _days_ago_expr("k.date", "k.time", "k.branch")
	rows = frappe.db.sql(
		f"""
		SELECT COUNT(k.name) AS total
		FROM `tabURY KOT` k
		WHERE k.docstatus = 1
			AND k.order_status = %(open_status)s
			AND k.verified = 0
			AND k.type IN %(types)s
			AND k.date BETWEEN %(window_start)s AND %(window_end)s
			AND {days_ago} = 0
			{branch_sql}
		""",
		params,
		as_dict=True,
	)
	return int(rows[0].total) if rows else 0


# ---------------------------------------------------------------------------
# Waiter chart
# ---------------------------------------------------------------------------


def _waiter_label(waiter, full_names):
	if not waiter:
		return UNASSIGNED_LABEL
	if waiter == SYSTEM_WAITER:
		return SYSTEM_WAITER_LABEL
	return full_names.get(waiter) or waiter


def get_waiter_sales(scope, days=CHART_DAYS, now=None):
	"""Sales per waiter per business day for the last `days` days including today.

	Returns ``{"labels": [...], "dates": [...], "datasets": [{"name", "values"}], "currency_totals"}``.
	All days are present (zero filled). Waiters are ranked by total; beyond
	`CHART_MAX_WAITERS` they are summed into "Others".
	"""
	now = now or now_datetime()
	days = max(1, min(int(days), 14))
	branch_sql, _p = _branch_clause(scope)
	params = _base_params(scope, now)
	params["statuses"] = ELIGIBLE_STATUSES
	params["days"] = days
	days_ago = _days_ago_expr("b.posting_date", "b.posting_time", "b.branch")

	rows = frappe.db.sql(
		f"""
		SELECT COALESCE(NULLIF(b.waiter, ''), '') AS waiter_name,
			{days_ago} AS days_ago,
			COALESCE(SUM(b.grand_total), 0) AS sales
		FROM `tabPOS Invoice` b
		WHERE b.docstatus = 1
			AND b.status IN %(statuses)s
			AND b.is_return = 0
			AND b.posting_date BETWEEN %(window_start)s AND %(window_end)s
			{branch_sql}
		GROUP BY waiter_name, days_ago
		HAVING days_ago BETWEEN 0 AND %(days)s - 1
		""",
		params,
		as_dict=True,
	)

	# Oldest day first.
	label_today = getdate(now - timedelta(hours=_scope_hours(scope)))
	dates = [add_days(label_today, -n) for n in range(days - 1, -1, -1)]
	index_of = {n: days - 1 - n for n in range(days)}

	by_waiter = {}
	for row in rows:
		values = by_waiter.setdefault(row.waiter_name, [0.0] * days)
		values[index_of[int(row.days_ago)]] += flt(row.sales)

	names = [w for w in by_waiter if w and w != SYSTEM_WAITER]
	full_names = {}
	if names:
		full_names = {
			user: full_name
			for user, full_name in frappe.db.get_values(
				"User", {"name": ["in", names]}, ["name", "full_name"]
			)
		}

	merged = {}
	for waiter, values in by_waiter.items():
		label = _waiter_label(waiter, full_names)
		current = merged.setdefault(label, [0.0] * days)
		merged[label] = [a + b for a, b in zip(current, values)]

	ranked = sorted(merged.items(), key=lambda item: (-sum(item[1]), item[0]))
	top, rest = ranked[:CHART_MAX_WAITERS], ranked[CHART_MAX_WAITERS:]
	datasets = [{"name": name, "values": [flt(v, 2) for v in values]} for name, values in top]
	if rest:
		others = [flt(sum(day), 2) for day in zip(*(values for _n, values in rest))]
		datasets.append({"name": OTHERS_LABEL, "values": others})

	return {
		"labels": [d.strftime("%a %d %b") for d in dates],
		"dates": [d.isoformat() for d in dates],
		"datasets": datasets,
	}

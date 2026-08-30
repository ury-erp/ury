"""Read-only tool surface for HUF (URY's AI assistant layer).

Every function here is a thin, whitelisted wrapper over an existing
deterministic data source (service line, dashboard stats, report_api). None
of them write or mutate anything, and every one enforces the same manager
role check used by report_api (`report_api.utils.require_manager`).

This module has no dependency on HUF itself — registering these functions as
HUF tools is PR-B scope (see PLAN.md item 1/6). Until then they are just
ordinary whitelisted `ury` endpoints, independently callable/testable.
"""

import frappe
from frappe.utils import add_to_date, get_datetime, today

from ury.ury.api.ury_dashboard import get_needs_attention
from ury.ury.api.ury_dashboard import get_shift_metrics as _dashboard_get_shift_metrics
from ury.ury.api.ury_service_line import get_service_line
from ury.ury.report_api.utils import require_manager

from ury.ury.report_api import customers as _customers
from ury.ury.report_api import employees as _employees
from ury.ury.report_api import financial as _financial
from ury.ury.report_api import items as _items
from ury.ury.report_api import operations as _operations
from ury.ury.report_api import sales as _sales


@frappe.whitelist(methods=["GET"])
def get_floor_state(branch=None):
	"""Table/floor status summary. Reuses `ury_service_line.get_service_line`
	(per-table stage: open/seated/fired/served/over) — same source the
	Dashboard's service-line rail renders from."""
	require_manager()
	return {"branch": branch, "tables": get_service_line(branch=branch)}


@frappe.whitelist(methods=["GET"])
def get_open_exceptions(branch=None):
	"""Currently-open "needs attention" items (pending payments, long-held
	tables, KOT errors, unclosed POS sessions). Reuses
	`ury_dashboard.get_needs_attention` — no separate rule logic here."""
	require_manager()
	return {"branch": branch, "exceptions": get_needs_attention(branch=branch)}


@frappe.whitelist(methods=["GET"])
def get_shift_metrics(window="today", branch=None):
	"""Sales/covers/avg-bill for the given window. Only `window="today"` is
	currently supported (the underlying dashboard stats are scoped to the
	current business day); reuses `ury_dashboard.get_shift_metrics`."""
	require_manager()
	if window != "today":
		frappe.throw(f"Unsupported window: {window}. Only 'today' is supported.")

	metrics = _dashboard_get_shift_metrics(branch=branch)
	return {"window": window, "branch": branch, **metrics}


def _median(values):
	values = sorted(values)
	n = len(values)
	if not n:
		return 0
	mid = n // 2
	if n % 2:
		return values[mid]
	return round((values[mid - 1] + values[mid]) / 2, 2)


@frappe.whitelist(methods=["GET"])
def get_baseline(weekday=None, hour=None, branch=None, weeks=6):
	"""Median sales/covers for the same weekday+hour window over the last
	`weeks` weeks — "a normal <weekday>" baseline for comparison against
	tonight. Self-contained (does not depend on `ury_dashboard`'s own
	current-time-only `get_baseline`), so it can compare an arbitrary
	weekday/hour, not just "right now".

	Same 6-week rolling-window pattern described in PLAN.md item 9.
	"""
	require_manager()

	now = get_datetime()
	weekday = int(weekday) if weekday is not None else now.weekday()
	hour = int(hour) if hour is not None else now.hour
	weeks = int(weeks)

	cache_key = f"ury_ai_tools_baseline:{branch}:{weekday}:{hour}:{weeks}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	conditions = """
		b.`docstatus` = 1
		AND b.`status` IN ('Consolidated', 'Paid')
		AND WEEKDAY(b.`posting_date`) = %(weekday)s
		AND HOUR(b.`posting_time`) BETWEEN %(hour_low)s AND %(hour_high)s
		AND b.`posting_date` >= DATE_SUB(CURDATE(), INTERVAL %(weeks)s WEEK)
		AND b.`posting_date` < CURDATE()
	"""
	params = {
		"weekday": weekday,
		"hour_low": max(hour - 1, 0),
		"hour_high": min(hour + 1, 23),
		"weeks": weeks,
	}
	if branch:
		conditions += " AND b.`branch` = %(branch)s"
		params["branch"] = branch

	rows = frappe.db.sql(
		f"""
		SELECT b.`posting_date` AS d, SUM(b.`grand_total`) AS sales, COUNT(b.`name`) AS covers
		FROM `tabPOS Invoice` b
		WHERE {conditions}
		GROUP BY b.`posting_date`
		ORDER BY b.`posting_date`
		""",
		params,
		as_dict=True,
	)

	sales_values = [r.sales or 0 for r in rows]
	covers_values = [r.covers or 0 for r in rows]

	result = {
		"weekday": weekday,
		"hour": hour,
		"branch": branch,
		"weeks": weeks,
		"sample_days": len(rows),
		"median_sales": _median(sales_values),
		"median_covers": _median(covers_values),
	}

	frappe.cache().set_value(cache_key, result, expires_in_sec=300)
	return result


# slug -> (function, required args not covered by defaults)
# Mirrors frontend/src/pages/Reports/reportsRegistry.ts exactly.
_REPORT_DISPATCH = {
	"today-sales": _sales.get_today_sales,
	"daywise-sales": _sales.get_daywise_sales,
	"daywise-invoices": _sales.get_daywise_invoices,
	"month-wise-sales": _sales.get_month_wise_sales,
	"time-wise-sales": _sales.get_time_wise_sales,
	"service-wise-sales": _sales.get_service_wise_sales,
	"cancelled-invoices": _sales.get_cancelled_invoices,
	"average-bill-value": _sales.get_average_bill_value,
	"item-wise-sales": _items.get_item_wise_sales,
	"item-wise-purchase-history": _items.get_item_wise_purchase_history,
	"customer-data": _customers.get_customer_data,
	"daywise-customer-details": _customers.get_daywise_customer_details,
	"repeated-customers": _customers.get_repeated_customers,
	"employee-sales": _employees.get_employee_sales,
	"employee-item-wise-sales": _employees.get_employee_item_wise_sales,
	"completed-work-orders": _operations.get_completed_work_orders,
	"daily-pnl": _financial.get_daily_pnl,
}

# Slugs whose underlying report function requires start_date/end_date and has
# no default — default both to today() when the caller didn't supply them, so
# an AI caller can ask for a snapshot without knowing the report's exact
# signature.
_DEFAULT_TO_TODAY_RANGE = {
	"daywise-sales",
	"daywise-invoices",
	"service-wise-sales",
	"cancelled-invoices",
	"average-bill-value",
	"item-wise-sales",
	"item-wise-purchase-history",
	"daywise-customer-details",
	"repeated-customers",
	"employee-sales",
	"employee-item-wise-sales",
	"completed-work-orders",
}

# customer-data additionally requires a specific customer; daily-pnl requires
# a specific branch and date. Both are left to the caller via `filters` —
# there is no sane default customer/branch to guess.


@frappe.whitelist(methods=["GET"])
def get_report_snapshot(report_slug, filters=None):
	"""Dispatch `report_slug` (e.g. "today-sales", "item-wise-sales") to the
	matching `report_api` function and return its JSON result, applying a
	sensible default of "today" for reports whose date range isn't supplied.

	`filters` is a dict of keyword arguments forwarded to the underlying
	report function (e.g. {"branch": "...", "start_date": "...",
	"end_date": "..."}). Each report_api function performs its own
	`require_manager()` check; we also check here so an unknown/mistyped
	slug fails the same permission gate before we even look it up.
	"""
	require_manager()

	fn = _REPORT_DISPATCH.get(report_slug)
	if not fn:
		frappe.throw(f"Unknown report_slug: {report_slug}")

	kwargs = dict(filters) if filters else {}

	if report_slug in _DEFAULT_TO_TODAY_RANGE:
		kwargs.setdefault("start_date", today())
		kwargs.setdefault("end_date", today())
	elif report_slug == "today-sales":
		kwargs.setdefault("date", today())
	elif report_slug == "daily-pnl":
		kwargs.setdefault("date", today())

	data = fn(**kwargs)
	return {"report_slug": report_slug, "filters": kwargs, "data": data}


_REPORTS_CATALOG = [
	{"slug": "today-sales", "label": "Today's Sales", "description": "Total sales, orders, and average bill for the current business day."},
	{"slug": "daywise-sales", "label": "Daywise Sales", "description": "Sales totals broken down by day over a date range."},
	{"slug": "daywise-invoices", "label": "Daywise Invoices", "description": "Individual invoice-level detail for each day in a date range."},
	{"slug": "month-wise-sales", "label": "Month Wise Sales", "description": "Sales totals broken down by month over a trailing window."},
	{"slug": "time-wise-sales", "label": "Time Wise Sales", "description": "Sales broken down into hourly/bucketed time slots for a single day."},
	{"slug": "service-wise-sales", "label": "Service Wise Sales", "description": "Sales broken down by service type (e.g. dine-in, takeaway) over a date range."},
	{"slug": "cancelled-invoices", "label": "Cancelled Invoices", "description": "List of invoices that were cancelled within a date range."},
	{"slug": "average-bill-value", "label": "Average Bill Value", "description": "Average bill/order value trend over a date range."},
	{"slug": "item-wise-sales", "label": "Item Wise Sales", "description": "Sales broken down by menu item, with optional item group/search filters."},
	{"slug": "item-wise-purchase-history", "label": "Item-wise Purchase History", "description": "Purchase history for stock items over a date range."},
	{"slug": "customer-data", "label": "Customer Data", "description": "Order history and spend detail for a specific customer."},
	{"slug": "daywise-customer-details", "label": "Daywise Customer Details", "description": "New vs. returning customer counts broken down by day."},
	{"slug": "repeated-customers", "label": "Repeated Customers", "description": "Customers with more than one visit within a date range."},
	{"slug": "employee-sales", "label": "Employee Sales", "description": "Sales totals attributed to each employee/waiter over a date range."},
	{"slug": "employee-item-wise-sales", "label": "Employee Item Wise Sales", "description": "Item-level sales breakdown for a specific employee."},
	{"slug": "completed-work-orders", "label": "Completed Work Orders", "description": "Kitchen/production work orders completed within a date range."},
	{"slug": "daily-pnl", "label": "Daily P&L", "description": "Daily profit and loss statement for a branch on a given date."},
]


@frappe.whitelist(methods=["GET"])
def list_reports():
	"""Static catalog of all 16 reports (slug, label, human description),
	mirroring `frontend/src/pages/Reports/reportsRegistry.ts`. Lets HUF
	answer "do you have a report on X" without any DB round-trip."""
	require_manager()
	return {"reports": _REPORTS_CATALOG}

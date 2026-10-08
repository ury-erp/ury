"""Single source of truth for every URY report the HUF assistant can run.

Each catalog entry describes one report: its slug, label, group, what it
answers, which filters it takes (name, type, required, default) and how to
run it — either a `report_api` JSON function (the React Reports section) or a
Frappe Desk report under `ury/ury/report/` (run through
`frappe.desk.query_report.run`, which enforces that report's own roles).

`ury_tools.list_reports`, `describe_report`, `get_report_snapshot` and
`compare_periods` are all driven from this one list, so adding a report here
is the only step needed to make it queryable from chat.

Everything here is read-only.
"""

import json

import frappe
from frappe.utils import add_days, add_months, cint, get_first_day, get_last_day, getdate, today

# HUF swaps any tool result longer than 8000 chars for a paged "context
# artifact" handle (huf.ai.context_artifacts.INLINE_PAYLOAD_CHAR_LIMIT); for a
# one-line JSON payload that paging is useless to the model. Keep every
# result under this budget instead, shrinking lists until it fits.
LLM_CHAR_BUDGET = 7500

# Rows kept per list in a tool result. Large invoice/item lists would otherwise
# swamp the model's context; totals and summaries are never truncated.
DEFAULT_MAX_ROWS = 40

PERIOD_PRESETS = (
	"today",
	"yesterday",
	"this_week",
	"last_week",
	"last_7_days",
	"last_30_days",
	"this_month",
	"last_month",
	"month_before_last",
	"week_before_last",
	"this_quarter",
	"this_year",
	"last_year",
)


def _f(name, type="string", required=False, default=None, description=""):
	return {"name": name, "type": type, "required": required, "default": default, "description": description}


_BRANCH = _f("branch", description="Branch (outlet) name, e.g. 'URY Muscat'. Use ury_lookup(entity='branch') if unsure.")
_BRANCH_REQ = {**_BRANCH, "required": True}
_START = _f("start_date", "date", True, "today", "Range start (YYYY-MM-DD). Or pass `period` instead.")
_END = _f("end_date", "date", True, "today", "Range end (YYYY-MM-DD). Or pass `period` instead.")
_PAGE = _f("page_size", "integer", default=50, description="Rows per page for invoice-level lists.")


def _api(module, fn):
	return {"kind": "api", "path": f"ury.ury.report_api.{module}.{fn}"}


def _api_path(path):
	return {"kind": "api", "path": path}


def _desk(report_name):
	return {"kind": "desk", "report_name": report_name}


REPORTS = [
	# --- Sales -------------------------------------------------------------
	{
		"slug": "today-sales", "label": "Today's Sales", "group": "Sales",
		"description": "Sales, orders, average bill and payment-mode split for one business day (defaults to today).",
		"filters": [_BRANCH, _f("date", "date", default="today", description="Business day (YYYY-MM-DD).")],
		**_api("sales", "get_today_sales"),
	},
	{
		"slug": "daywise-sales", "label": "Daywise Sales", "group": "Sales",
		"description": "Net/gross sales, tax, discounts and invoice count per day over a date range.",
		"filters": [_START, _END, _BRANCH], **_api("sales", "get_daywise_sales"),
	},
	{
		"slug": "daywise-invoices", "label": "Daywise Invoices", "group": "Sales",
		"description": "Invoice-level list (number, time, customer, table, total, payment) over a date range.",
		"filters": [_START, _END, _BRANCH, _PAGE], **_api("sales", "get_daywise_invoices"),
	},
	{
		"slug": "month-wise-sales", "label": "Month Wise Sales", "group": "Sales",
		"description": "Monthly sales totals over a trailing window of months.",
		"filters": [_BRANCH, _f("months_back", "integer", default=6, description="How many months back.")],
		**_api("sales", "get_month_wise_sales"),
	},
	{
		"slug": "time-wise-sales", "label": "Time Wise Sales", "group": "Sales",
		"description": "Sales by time-of-day bucket (busiest hours) for one day.",
		"filters": [_BRANCH, _f("date", "date", default="today"), _f("bucket_size_hours", "integer", default=2)],
		**_api("sales", "get_time_wise_sales"),
	},
	{
		"slug": "service-wise-sales", "label": "Service Wise Sales", "group": "Sales",
		"description": "Sales split by order/service type (dine-in, takeaway, delivery, aggregators).",
		"filters": [_START, _END, _BRANCH], **_api("sales", "get_service_wise_sales"),
	},
	{
		"slug": "cancelled-invoices", "label": "Cancelled Invoices", "group": "Sales",
		"description": "Invoices cancelled in a date range, with who/when/value.",
		"filters": [_START, _END, _BRANCH, _PAGE], **_api("sales", "get_cancelled_invoices"),
	},
	{
		"slug": "average-bill-value", "label": "Average Bill Value", "group": "Sales",
		"description": "Average bill value trend per day over a date range.",
		"filters": [_START, _END, _BRANCH], **_api("sales", "get_average_bill_value"),
	},
	{
		"slug": "apc", "label": "APC (Average Per Cover)", "group": "Sales",
		"description": "Average spend per cover (guest) per day for a branch.",
		"filters": [_BRANCH_REQ, _START, _END], **_desk("APC"),
	},
	{
		"slug": "revpash", "label": "RevPASH", "group": "Sales",
		"description": "Revenue per available seat-hour — how well seats are monetised by hour.",
		"filters": [_BRANCH_REQ, _START, _END], **_desk("RevPASH Report"),
	},
	{
		"slug": "unsettled-bills", "label": "Unsettled Bills", "group": "Sales",
		"description": "Open/unpaid bills currently pending settlement at a branch.",
		"filters": [_BRANCH_REQ], **_desk("Unsettled Bills"),
	},
	# --- Menu & items -------------------------------------------------------
	{
		"slug": "item-wise-sales", "label": "Item Wise Sales", "group": "Menu & Items",
		"description": "Qty and value sold per menu item (best/worst sellers), optional item group or search.",
		"filters": [_START, _END, _BRANCH, _f("item_group"), _f("search", description="Item name/code fragment."), _PAGE],
		**_api("items", "get_item_wise_sales"),
	},
	{
		"slug": "item-wise-purchase-history", "label": "Item-wise Purchase History", "group": "Menu & Items",
		"description": "Purchases of stock items (qty, rate, supplier) over a date range.",
		"filters": [_START, _END, _BRANCH, _PAGE], **_api("items", "get_item_wise_purchase_history"),
	},
	{
		"slug": "product-categorization", "label": "Product Categorization (Menu Engineering)", "group": "Menu & Items",
		"description": "Menu-engineering matrix: items classed as Star, Work Horse, Puzzle or Dog by popularity vs margin.",
		"filters": [
			_BRANCH_REQ, _START, _END,
			_f("category", default="Star", required=True, description="One of: Star, Work Horse, Puzzle, Dog."),
		],
		**_desk("Product Categorization"),
	},
	{
		"slug": "food-cost-and-margin", "label": "Food Cost and Margin", "group": "Cost & Variance",
		"description": "Per menu item: selling price, recipe (BOM) cost, food-cost % and margin for a branch.",
		"filters": [_BRANCH_REQ], **_desk("Food Cost and Margin Report"),
	},
	# --- Customers ----------------------------------------------------------
	{
		"slug": "customer-data", "label": "Customer Data", "group": "Customers",
		"description": "Visit and spend history for one customer.",
		"filters": [_f("customer", required=True, description="Customer name/ID — use ury_lookup(entity='customer')."), _START, _END, _BRANCH, _PAGE],
		**_api("customers", "get_customer_data"),
	},
	{
		"slug": "daywise-customer-details", "label": "Daywise Customer Details", "group": "Customers",
		"description": "New vs returning customers per day.",
		"filters": [_START, _END, _BRANCH], **_api("customers", "get_daywise_customer_details"),
	},
	{
		"slug": "repeated-customers", "label": "Repeated Customers", "group": "Customers",
		"description": "Customers who visited more than once in a date range.",
		"filters": [_START, _END, _BRANCH], **_api("customers", "get_repeated_customers"),
	},
	# --- Staff --------------------------------------------------------------
	{
		"slug": "employee-sales", "label": "Employee Sales", "group": "Staff",
		"description": "Sales attributed to each waiter/cashier over a date range.",
		"filters": [_START, _END, _BRANCH], **_api("employees", "get_employee_sales"),
	},
	{
		"slug": "employee-item-wise-sales", "label": "Employee Item Wise Sales", "group": "Staff",
		"description": "Items sold by one employee.",
		"filters": [_f("employee", required=True, description="User ID — use ury_lookup(entity='employee')."), _START, _END, _BRANCH],
		**_api("employees", "get_employee_item_wise_sales"),
	},
	{
		"slug": "employee-commission", "label": "Employee Commission", "group": "Staff",
		"description": "Commission earned per employee under the configured commission rules.",
		"filters": [_START, _END, _BRANCH, _f("employee")], **_api("commission", "get_employee_commission"),
	},
	# --- Operations ---------------------------------------------------------
	{
		"slug": "table-turnaround-delay", "label": "Table Turnaround Delay", "group": "Operations",
		"description": "How long tables take to turn and where delays occur, for a branch.",
		"filters": [_BRANCH_REQ], **_desk("Table Turnaround Delay"),
	},
	{
		"slug": "completed-work-orders", "label": "Completed Work Orders", "group": "Production",
		"description": "Kitchen production work orders completed in a date range (item, qty, time).",
		"filters": [_START, _END], **_api("operations", "get_completed_work_orders"),
	},
	{
		"slug": "close-day-checklist", "label": "Close Day Checklist", "group": "Operations",
		"description": "Day-close readiness for a branch: open invoices, unclosed POS, pending KOTs, stock postings.",
		"filters": [_BRANCH_REQ, _f("service_date", "date", True, "today")], **_api("day_close", "get_close_day_checklist"),
	},
	# --- Cost, variance & stock control -------------------------------------
	{
		"slug": "short-excess", "label": "Short / Excess (Stock Count Variance)", "group": "Cost & Variance",
		"description": "Physical stock count vs system stock per item: short/excess qty and value.",
		"filters": [_BRANCH_REQ, _START, _END, _f("warehouse")], **_desk("Short-Excess Report"),
	},
	{
		"slug": "wastage-and-damage", "label": "Wastage and Damage", "group": "Cost & Variance",
		"description": "Wastage/damage write-offs by item, department and reason with qty, value and approval status.",
		"filters": [
			_BRANCH_REQ,
			_f("from_date", "date", False, None, "Range start (YYYY-MM-DD). Or pass `period`."),
			_f("to_date", "date", False, None, "Range end (YYYY-MM-DD)."),
			_f("department"), _f("status", description="Draft, Approved or Rejected."),
		],
		**_api_path("ury.ury.ai_tools.ury_ops_tools.get_wastage"),
	},
	{
		"slug": "yield-variance", "label": "Yield Variance", "group": "Cost & Variance",
		"description": "Measured production yield vs standard yield % per item (prep losses).",
		"filters": [_f("company", required=True), _BRANCH, _f("item")],
		**_api_path("ury.ury.api.ury_yield_variance.get_yield_variance"),
	},
	{
		"slug": "department-profitability", "label": "Department Profitability", "group": "Cost & Variance",
		"description": "Revenue, posted cost, theoretical cost and variance per production department.",
		"filters": [_f("company", required=True), _BRANCH_REQ, _f("service_date_or_period", required=True, default="today", description="A date (YYYY-MM-DD).")],
		**_api_path("ury.ury.api.ury_department_profitability.get_department_profitability"),
	},
	{
		"slug": "plan-vs-actual", "label": "Sales Plan vs Actual", "group": "Production",
		"description": "Planned (approved Sales Plan) vs actually sold quantities per item/department.",
		"filters": [_f("company", required=True), _BRANCH_REQ, _f("service_date_or_period", required=True, default="today")],
		**_api_path("ury.ury.api.ury_department_profitability.get_plan_vs_actual"),
	},
	# --- Financial ----------------------------------------------------------
	{
		"slug": "daily-pnl", "label": "Daily P&L (saved)", "group": "Financial",
		"description": "The submitted 'URY Daily P and L' statement for a branch/date (sales, COGS, expenses, profit). For a live estimate when none is saved use ury_get_outlet_pnl.",
		"filters": [_BRANCH_REQ, _f("date", "date", True, "today")], **_api("financial", "get_daily_pnl"),
	},
]

_BY_SLUG = {r["slug"]: r for r in REPORTS}

# Old slugs / Desk report names the model may use.
_ALIASES = {
	"todays-sales": "today-sales",
	"food-cost-and-margin-report": "food-cost-and-margin",
	"revpash-report": "revpash",
	"short-excess-report": "short-excess",
	"wastage-and-damage-report": "wastage-and-damage",
	"pnl": "daily-pnl",
	"p&l": "daily-pnl",
}


def resolve_slug(slug):
	key = (slug or "").strip().lower().replace("_", "-").replace(" ", "-").replace("'", "")
	key = _ALIASES.get(key, key)
	if key in _BY_SLUG:
		return key
	for r in REPORTS:
		if r.get("report_name", "").lower() == (slug or "").strip().lower():
			return r["slug"]
	return None


def get_report(slug):
	key = resolve_slug(slug)
	if not key:
		frappe.throw(
			f"Unknown report '{slug}'. Valid slugs: {', '.join(r['slug'] for r in REPORTS)}",
			frappe.ValidationError,
		)
	return _BY_SLUG[key]


def catalog_summary():
	return [
		{"slug": r["slug"], "label": r["label"], "group": r["group"], "description": r["description"]}
		for r in REPORTS
	]


def describe(slug):
	r = get_report(slug)
	example = {f["name"]: f["default"] or f"<{f['name']}>" for f in r["filters"] if f["required"]}
	return {
		"slug": r["slug"],
		"label": r["label"],
		"group": r["group"],
		"description": r["description"],
		"filters": r["filters"],
		"accepts_period": any(f["name"] in ("start_date", "from_date", "date", "service_date", "service_date_or_period") for f in r["filters"]),
		"period_presets": PERIOD_PRESETS,
		"example_filters": example,
	}


# ---------------------------------------------------------------------------
# Argument coercion
# ---------------------------------------------------------------------------


def parse_json_arg(value, default=None):
	"""HUF/LLMs may hand an "object" parameter over as a dict, a JSON string,
	an empty string, or None. Normalise to a dict."""
	if value in (None, "", "null"):
		return {} if default is None else default
	if isinstance(value, dict):
		return dict(value)
	if isinstance(value, str):
		try:
			parsed = json.loads(value)
		except ValueError:
			frappe.throw(f"filters must be a JSON object, got: {value[:80]}", frappe.ValidationError)
		if not isinstance(parsed, dict):
			frappe.throw("filters must be a JSON object", frappe.ValidationError)
		return parsed
	frappe.throw("filters must be a JSON object", frappe.ValidationError)


def resolve_period(period):
	"""Turn a preset ('last_month'), a single date or 'YYYY-MM-DD..YYYY-MM-DD'
	into (start_date, end_date) strings."""
	if not period:
		return None
	p = str(period).strip().lower().replace(" ", "_").replace("-", "_") if not _looks_like_date(period) else str(period).strip()
	t = getdate(today())
	if p == "today":
		return str(t), str(t)
	if p == "yesterday":
		y = add_days(t, -1)
		return str(y), str(y)
	if p == "this_week":
		start = add_days(t, -t.weekday())
		return str(start), str(t)
	if p == "last_week":
		start = add_days(t, -t.weekday() - 7)
		return str(start), str(add_days(start, 6))
	if p == "last_7_days":
		return str(add_days(t, -6)), str(t)
	if p == "last_30_days":
		return str(add_days(t, -29)), str(t)
	if p == "this_month":
		return str(get_first_day(t)), str(t)
	if p == "last_month":
		prev = add_months(t, -1)
		return str(get_first_day(prev)), str(get_last_day(prev))
	if p == "month_before_last":
		prev = add_months(t, -2)
		return str(get_first_day(prev)), str(get_last_day(prev))
	if p == "week_before_last":
		start = add_days(t, -t.weekday() - 14)
		return str(start), str(add_days(start, 6))
	if p == "this_quarter":
		q_start_month = 3 * ((t.month - 1) // 3) + 1
		return str(t.replace(month=q_start_month, day=1)), str(t)
	if p == "this_year":
		return str(t.replace(month=1, day=1)), str(t)
	if p == "last_year":
		return str(t.replace(year=t.year - 1, month=1, day=1)), str(t.replace(year=t.year - 1, month=12, day=31))
	if ".." in str(period):
		a, b = str(period).split("..", 1)
		return str(getdate(a.strip())), str(getdate(b.strip()))
	if _looks_like_date(period):
		d = getdate(str(period).strip())
		return str(d), str(d)
	frappe.throw(
		f"Unknown period '{period}'. Use one of {', '.join(PERIOD_PRESETS)}, a date, or 'YYYY-MM-DD..YYYY-MM-DD'.",
		frappe.ValidationError,
	)


def _looks_like_date(value):
	s = str(value).strip()
	return len(s) >= 10 and s[4] == "-" and s[:4].isdigit()


def _normalise_date(value):
	if value in (None, ""):
		return value
	if str(value).strip().lower() in ("today", "yesterday"):
		return resolve_period(value)[0]
	return str(getdate(value))


def build_kwargs(report, filters):
	"""Apply period presets, defaults and type coercion; fail with a clear,
	model-actionable message when a required filter is missing."""
	filters = dict(filters or {})
	period = filters.pop("period", None)
	names = {f["name"] for f in report["filters"]}

	if period:
		start, end = resolve_period(period)
		if "start_date" in names:
			filters.setdefault("start_date", start)
			filters.setdefault("end_date", end)
		elif "from_date" in names:
			filters.setdefault("from_date", start)
			filters.setdefault("to_date", end)
		elif "date" in names:
			filters.setdefault("date", end)
		elif "service_date" in names:
			filters.setdefault("service_date", end)
		elif "service_date_or_period" in names:
			filters.setdefault("service_date_or_period", end)

	kwargs = {}
	missing = []
	for f in report["filters"]:
		name = f["name"]
		value = filters.get(name)
		if value in (None, "") and f["default"] is not None:
			value = f["default"]
		if value in (None, ""):
			if f["required"]:
				missing.append(name)
			continue
		if f["type"] == "date" or name in ("service_date_or_period",):
			value = _normalise_date(value)
		elif f["type"] == "integer":
			value = cint(value)
		kwargs[name] = value

	if missing:
		hint = ""
		if "branch" in missing:
			branches = frappe.get_all("Branch", pluck="name", order_by="name")
			hint = f" Available branches: {', '.join(branches)}."
		frappe.throw(
			f"Report '{report['slug']}' needs: {', '.join(missing)}.{hint}",
			frappe.ValidationError,
		)

	unknown = sorted(set(filters) - names)
	return kwargs, unknown


# ---------------------------------------------------------------------------
# Running
# ---------------------------------------------------------------------------


def run(slug, filters=None, max_rows=DEFAULT_MAX_ROWS):
	report = get_report(slug)
	kwargs, ignored = build_kwargs(report, parse_json_arg(filters))

	if report["kind"] == "api":
		data = frappe.get_attr(report["path"])(**kwargs)
	else:
		data = _run_desk_report(report["report_name"], kwargs, [f["name"] for f in report["filters"]])

	result = {
		"report_slug": report["slug"],
		"label": report["label"],
		"filters": kwargs,
		"data": compact(data, max_rows=cint(max_rows) or DEFAULT_MAX_ROWS),
	}
	if ignored:
		result["ignored_filters"] = ignored
	return result


def _run_desk_report(report_name, filters, declared=()):
	from frappe.desk.query_report import run as run_query_report

	# Query Reports interpolate every declared filter into their SQL
	# (%(warehouse)s ...) and raise KeyError when an optional one is absent.
	filters = {**{name: "" for name in declared}, **filters}

	out = run_query_report(report_name=report_name, filters=filters, ignore_prepared_report=True)
	columns = out.get("columns") or []
	keys = [_column_key(c, i) for i, c in enumerate(columns)]

	rows = []
	for row in out.get("result") or []:
		if isinstance(row, dict):
			rows.append({k: v for k, v in row.items() if k not in ("indent",)})
		elif isinstance(row, (list, tuple)):
			rows.append({keys[i] if i < len(keys) else f"col_{i}": v for i, v in enumerate(row)})

	data = {"columns": [k for k in keys], "rows": rows, "row_count": len(rows)}
	if out.get("report_summary"):
		data["summary"] = out["report_summary"]
	if out.get("message"):
		data["message"] = out["message"]
	return data


def _column_key(column, index):
	if isinstance(column, dict):
		return column.get("fieldname") or column.get("label") or f"col_{index}"
	if isinstance(column, str):
		return column.split(":", 1)[0] or f"col_{index}"
	return f"col_{index}"


def compact(data, max_rows=DEFAULT_MAX_ROWS, _depth=0):
	"""Truncate long lists (recursively, first 3 levels) and say so, so a
	big result never blows the model's context or gets silently cut."""
	if _depth > 3:
		return data
	if isinstance(data, list):
		items = [compact(x, max_rows, _depth + 1) for x in data[:max_rows]]
		if len(data) > max_rows:
			items.append({"_truncated": True, "_shown": max_rows, "_total_rows": len(data)})
		return items
	if isinstance(data, dict):
		return {k: (v if k == "columns" else compact(v, max_rows, _depth + 1)) for k, v in data.items()}
	return data


def fit_for_llm(data, budget=LLM_CHAR_BUDGET):
	"""Return `data` (or a progressively more truncated copy) whose JSON is
	within `budget` chars, so HUF passes it to the model inline."""
	if len(json.dumps(data, default=str)) <= budget:
		return data
	for n in (30, 20, 12, 8, 5, 3, 2, 1):
		trimmed = compact(data, max_rows=n)
		if len(json.dumps(trimmed, default=str)) <= budget:
			if isinstance(trimmed, dict):
				trimmed["_note"] = f"Lists trimmed to {n} rows to fit; narrow the filters (item, branch, period) for detail."
			return trimmed
	text = json.dumps(compact(data, max_rows=1), default=str)
	return {"_note": "Result too large; showing the start only — narrow the filters.", "partial": text[: budget - 200]}


def llm_sized(fn):
	"""Decorator for tool functions: cap the returned payload with fit_for_llm."""
	import functools

	@functools.wraps(fn)
	def wrapper(*args, **kwargs):
		return fit_for_llm(fn(*args, **kwargs))

	return wrapper

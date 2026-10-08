"""Read-only tool surface for HUF (URY's AI assistant layer).

Every function here is a thin, whitelisted wrapper over an existing
deterministic data source (service line, dashboard stats, report_api). None
of them write or mutate anything, and every one enforces the same manager
role check used by report_api (`report_api.utils.require_manager`).

This module has no dependency on HUF itself — `ury_tools_registry.py`
registers these (and `ury_ops_tools.py`'s stock/production/variance tools)
as HUF Agent Tools. The report tools are driven by `ury_report_catalog`.
"""

import frappe
from frappe.utils import get_datetime

from ury.ury.api.ury_dashboard import get_needs_attention
from ury.ury.api.ury_dashboard import get_shift_metrics as _dashboard_get_shift_metrics
from ury.ury.api.ury_service_line import get_service_line
from ury.ury.report_api.utils import require_manager

from ury.ury.ai_tools import ury_report_catalog as _catalog
from ury.ury.ai_tools.ury_report_catalog import llm_sized


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_floor_state(branch=None):
	"""Table/floor status summary. Reuses `ury_service_line.get_service_line`
	(per-table stage: open/seated/fired/served/over) — same source the
	Dashboard's service-line rail renders from."""
	require_manager()
	return {"branch": branch, "tables": get_service_line(branch=branch)}


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_open_exceptions(branch=None):
	"""Currently-open "needs attention" items (pending payments, long-held
	tables, KOT errors, unclosed POS sessions). Reuses
	`ury_dashboard.get_needs_attention` — no separate rule logic here."""
	require_manager()
	return {"branch": branch, "exceptions": get_needs_attention(branch=branch)}


@frappe.whitelist(methods=["GET"])
@llm_sized
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
@llm_sized
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


@frappe.whitelist(methods=["GET"])
@llm_sized
def list_reports():
	"""Catalog of every report the assistant can run (slug, label, group,
	description) — see `ury_report_catalog.REPORTS`. Lets HUF answer "do you
	have a report on X" without any DB round-trip."""
	require_manager()
	return {
		"reports": _catalog.catalog_summary(),
		"period_presets": _catalog.PERIOD_PRESETS,
		"hint": "Call ury_describe_report(slug) for a report's exact filters before running it.",
	}


@frappe.whitelist(methods=["GET"])
@llm_sized
def describe_report(report_slug):
	"""Filters (name, type, required, default) and an example call for one report."""
	require_manager()
	return _catalog.describe(report_slug)


@frappe.whitelist(methods=["GET"])
@llm_sized
def get_report_snapshot(report_slug, filters=None, max_rows=None):
	"""Run any catalog report (`report_api` JSON function or Frappe Desk
	report) and return its data as JSON.

	`filters` is a dict or JSON string of the report's filters, e.g.
	{"branch": "URY Muscat", "period": "last_month"} or explicit
	start_date/end_date. Required filters with a sensible default (dates →
	today) are filled in; a missing required filter with no default (e.g.
	branch, customer) returns a clear error naming it. Long row lists are
	capped and marked `_truncated`.
	"""
	require_manager()
	return _catalog.run(report_slug, filters, max_rows=max_rows or _catalog.DEFAULT_MAX_ROWS)


@frappe.whitelist(methods=["GET"])
@llm_sized
def compare_periods(report_slug, period_a, period_b, filters=None, max_rows=None):
	"""Run the same report for two periods (presets like 'this_month' /
	'last_month', a date, or 'YYYY-MM-DD..YYYY-MM-DD') and return both
	results plus deltas for every top-level numeric total."""
	require_manager()
	base = _catalog.parse_json_arg(filters)
	for key in ("period", "start_date", "end_date", "date"):
		base.pop(key, None)
	rows = max_rows or 15
	a = _catalog.run(report_slug, {**base, "period": period_a}, max_rows=rows)
	b = _catalog.run(report_slug, {**base, "period": period_b}, max_rows=rows)
	return {
		"report_slug": a["report_slug"],
		"period_a": {"period": period_a, "filters": a["filters"]},
		"period_b": {"period": period_b, "filters": b["filters"]},
		"deltas": _numeric_deltas(a["data"], b["data"]),
		"a": a["data"],
		"b": b["data"],
	}


def _numeric_deltas(a, b, prefix=""):
	"""a − b for numeric leaves of nested dicts (not lists), with % change."""
	out = {}
	if not (isinstance(a, dict) and isinstance(b, dict)):
		return out
	for key, va in a.items():
		vb = b.get(key)
		path = f"{prefix}{key}"
		if isinstance(va, bool) or isinstance(vb, bool):
			continue
		if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
			diff = va - vb
			out[path] = {"a": va, "b": vb, "change": round(diff, 3), "change_percent": round(diff / vb * 100, 1) if vb else None}
		elif isinstance(va, dict) and isinstance(vb, dict):
			out.update(_numeric_deltas(va, vb, prefix=f"{path}."))
	return out

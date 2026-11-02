# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Chairman Brief (P0 spike): read-only, session-authenticated executive
# summary API. NOT allow_guest. Pure helpers (formatter, headline builders,
# delta/tone, window math, aggregation) take plain Python values so they can
# be unit-tested without a Frappe site.

from datetime import timedelta

import frappe
from frappe.utils import getdate, now_datetime

SCHEMA_VERSION = 1
CURRENCY = "INR"
LOCALE = "en-IN"
ALLOWED_ROLES = ("System Manager", "URY Chairman")
DRILL_DASHBOARD = "/insights/dashboards/58aq35af28"
UNSPECIFIED = "Unspecified"
TONE_THRESHOLD = 0.02
WINDOW_DAYS = 7
NULL_SHARE_LIMIT = 0.10


# ---------------------------------------------------------------- pure helpers


def format_inr_compact(value):
	"""INR compact: >=1e7 Cr, >=1e5 L, >=1e3 K, else plain; one decimal, '.0' dropped."""
	value = float(value or 0)
	sign = "-" if value < 0 else ""
	n = abs(value)
	if n >= 1e7:
		num, suffix = n / 1e7, "Cr"
	elif n >= 1e5:
		num, suffix = n / 1e5, "L"
	elif n >= 1e3:
		num, suffix = n / 1e3, "K"
	else:
		num, suffix = n, ""
	text = f"{num:.1f}" if suffix else f"{num:.0f}"
	if text.endswith(".0"):
		text = text[:-2]
	return f"{sign}₹{text}{suffix}"


def window_dates(day, days=WINDOW_DAYS):
	"""[D-(days-1) .. D] as date objects, oldest first."""
	return [day - timedelta(days=i) for i in range(days - 1, -1, -1)]


def compute_delta(value, compare):
	"""Fractional change vs compare; None when compare is 0/None."""
	if not compare:
		return None
	return (value - compare) / compare


def tone_for(delta):
	if delta is None:
		return "neutral"
	if delta >= TONE_THRESHOLD:
		return "good"
	if delta <= -TONE_THRESHOLD:
		return "bad"
	return "neutral"


def yesterday_headline(value, compare, delta, day):
	if value == 0 and compare == 0 and delta is None:
		return frappe._("No sales recorded for {0}").format(day.isoformat())
	amount = format_inr_compact(value)
	weekday = day.strftime("%A")
	if delta is None:
		return frappe._("Yesterday {0}, no sales last {1}").format(amount, weekday)
	pct = abs(round(delta * 100))
	if tone_for(delta) == "neutral":
		return frappe._("Yesterday {0}, flat vs last {1}").format(amount, weekday)
	if delta > 0:
		return frappe._("Yesterday {0}, up {1}% vs last {2}").format(amount, pct, weekday)
	return frappe._("Yesterday {0}, down {1}% vs last {2}").format(amount, pct, weekday)


def share_pct(part, total):
	return round(part * 100 / total) if total else 0


def sort_series(series):
	"""Sort [{label, value}] by value desc, label asc for ties."""
	return sorted(series, key=lambda r: (-r["value"], r["label"]))


def aggregate_series(rows, label_key, value_key, unspecified=UNSPECIFIED):
	"""Group rows (dicts) by label (None/blank -> 'Unspecified'), sum, round 2, sort desc."""
	totals = {}
	for r in rows:
		label = (r.get(label_key) or "").strip() or unspecified
		totals[label] = totals.get(label, 0) + float(r.get(value_key) or 0)
	return sort_series([{"label": k, "value": round(v, 2)} for k, v in totals.items()])


def total_of(series):
	return round(sum(s["value"] for s in series), 2)


def top_share_headline(series, template):
	"""template has {0}=label {1}=percent. Empty series -> neutral empty text."""
	total = sum(s["value"] for s in series)
	if not series or total <= 0:
		return frappe._("No sales recorded")
	top = series[0]
	return frappe._(template).format(top["label"], share_pct(top["value"], total))


def data_quality_for(days_with_invoices, unspecified_value, total_value):
	"""'partial' if <7 days have invoices or Unspecified order_type exceeds 10% of value."""
	if days_with_invoices < WINDOW_DAYS:
		return "partial"
	if total_value > 0 and unspecified_value / total_value > NULL_SHARE_LIMIT:
		return "partial"
	return "ok"


def spark_series(dates, per_day):
	return [{"label": d.isoformat(), "value": round(per_day.get(d, 0), 2)} for d in dates]


# ---------------------------------------------------------------- DB layer


def _check_role():
	user = frappe.session.user
	if user == "Administrator":
		return
	if set(frappe.get_roles(user)) & set(ALLOWED_ROLES):
		return
	frappe.throw(frappe._("Not permitted"), frappe.PermissionError)


def _parse_date(date):
	if not date:
		return getdate(now_datetime()) - timedelta(days=1)
	try:
		return getdate(date)
	except Exception:
		frappe.throw(frappe._("Invalid date: {0}").format(date), frappe.ValidationError)


def _base_query(start, end):
	"""POS Invoice rows, docstatus=1, non-return, date range. Status deliberately NOT filtered
	(Consolidated invoices must count)."""
	pi = frappe.qb.DocType("POS Invoice")
	return pi, (
		frappe.qb.from_(pi)
		.where(pi.docstatus == 1)
		.where(pi.is_return == 0)
		.where(pi.posting_date >= start)
		.where(pi.posting_date <= end)
	)


def _daily_rows(start, end):
	from frappe.query_builder.functions import Count, Sum

	pi, q = _base_query(start, end)
	return (
		q.select(pi.posting_date, Sum(pi.net_total).as_("total"), Count(pi.name).as_("orders"))
		.groupby(pi.posting_date)
		.run(as_dict=True)
	)


def _scope(start, end):
	pi, q = _base_query(start, end)
	rows = q.select(pi.company, pi.branch).distinct().run(as_dict=True)
	return (
		sorted({r.company for r in rows if r.company}),
		sorted({r.branch for r in rows if r.branch}),
	)


def _per_day(rows):
	return {getdate(r["posting_date"]): float(r["total"] or 0) for r in rows}


def slide_yesterday(day):
	dates = window_dates(day)
	prev = day - timedelta(days=7)
	rows = _daily_rows(prev, day)
	totals = _per_day(rows)
	orders = {getdate(r["posting_date"]): int(r["orders"] or 0) for r in rows}
	value = round(totals.get(day, 0), 2)
	compare = round(totals.get(prev, 0), 2)
	delta = compute_delta(value, compare)
	return {
		"id": "yesterday",
		"title": frappe._("Yesterday ({0})").format(day.isoformat()),
		"headline": yesterday_headline(value, compare, delta, day),
		"value": value,
		"compare": compare,
		"delta_pct": None if delta is None else round(delta, 4),
		"tone": tone_for(delta),
		"orders": orders.get(day, 0),
		"orders_compare": orders.get(prev, 0),
		"chart": {"type": "spark", "series": spark_series(dates, totals)},
		"drill": DRILL_DASHBOARD,
		"data_quality": "ok",
	}


def slide_channel_mix(day):
	from frappe.query_builder.functions import Sum

	start = window_dates(day)[0]
	pi, q = _base_query(start, day)
	rows = q.select(pi.order_type, Sum(pi.net_total).as_("total")).groupby(pi.order_type).run(as_dict=True)
	series = aggregate_series(rows, "order_type", "total")
	total = total_of(series)
	unspecified = sum(s["value"] for s in series if s["label"] == UNSPECIFIED)
	days_with = len([r for r in _daily_rows(start, day) if (r["total"] or 0) or r["orders"]])
	return {
		"id": "channel_mix",
		"title": frappe._("Channel mix (7 days)"),
		"headline": top_share_headline(series, "{0} leads with {1}% of the week"),
		"value": total,
		"compare": None,
		"delta_pct": None,
		"tone": "neutral",
		"chart": {"type": "donut", "series": series},
		"drill": DRILL_DASHBOARD,
		"data_quality": data_quality_for(days_with, unspecified, total),
	}


def slide_payment_mix(day):
	from frappe.query_builder.functions import Sum

	start = window_dates(day)[0]
	pi, pq = _base_query(start, day)
	sip = frappe.qb.DocType("Sales Invoice Payment")
	rows = (
		frappe.qb.from_(sip)
		.join(pi)
		.on(sip.parent == pi.name)
		.where(sip.parenttype == "POS Invoice")
		.where(pi.docstatus == 1)
		.where(pi.is_return == 0)
		.where(pi.posting_date >= start)
		.where(pi.posting_date <= day)
		.select(sip.mode_of_payment, Sum(sip.amount).as_("total"))
		.groupby(sip.mode_of_payment)
		.run(as_dict=True)
	)
	series = aggregate_series(rows, "mode_of_payment", "total")
	return {
		"id": "payment_mix",
		"title": frappe._("Payment mix (7 days)"),
		"headline": top_share_headline(series, "{0} is {1}% of payments"),
		"value": total_of(series),
		"compare": None,
		"delta_pct": None,
		"tone": "neutral",
		"chart": {"type": "donut", "series": series},
		"drill": DRILL_DASHBOARD,
		"data_quality": "ok",
	}


@frappe.whitelist()
def get_brief(date=None):
	"""Chairman Brief for business day `date` (default yesterday). See p0_contract.md."""
	_check_role()
	day = _parse_date(date)
	start = window_dates(day)[0]
	companies, branches = _scope(start, day)
	return {
		"schema_version": SCHEMA_VERSION,
		"as_of": now_datetime().isoformat(),
		"date": day.isoformat(),
		"currency": CURRENCY,
		"locale": LOCALE,
		"scope": {"companies": companies, "branches": branches},
		"slides": [slide_yesterday(day), slide_channel_mix(day), slide_payment_mix(day)],
	}

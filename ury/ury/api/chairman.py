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
MAX_LOOKBACK_DAYS = 400
NULL_SHARE_LIMIT = 0.10


# ---------------------------------------------------------------- pure helpers


def format_inr_compact(value):
	"""INR compact: Cr (1e7), L (1e5), K (1e3), else plain; one decimal, '.0' dropped.

	The unit is promoted AFTER rounding: 99999 -> 100.0K -> '₹1L', 9999999 -> '₹1Cr'.
	"""
	value = float(value or 0)
	sign = "-" if value < 0 else ""
	n = abs(value)
	units = [(1e7, "Cr"), (1e5, "L"), (1e3, "K"), (1, "")]
	idx = next(i for i, (size, _) in enumerate(units) if n >= size or size == 1)
	while True:
		size, suffix = units[idx]
		num = round(n / size, 1 if suffix else 0)
		limit = 1000 if suffix == "" else 100
		if num >= limit and idx > 0:
			idx -= 1
			continue
		break
	text = f"{num:.1f}" if suffix else f"{num:.0f}"
	if text.endswith(".0"):
		text = text[:-2]
	return f"{sign}₹{text}{suffix}"


def pct_text(delta):
	"""One function for headline and chip: <10% -> one decimal ('12.5' style, '.0' dropped), else integer."""
	p = abs(delta) * 100
	r = round(p, 1)
	if r >= 10:
		return str(round(p))
	text = f"{r:.1f}"
	return text[:-2] if text.endswith(".0") else text


def net_revenue(invoices):
	"""Revenue basis: (SUM(net_total) incl. returns, count of is_return=0 invoices)."""
	total = sum(float(i.get("net_total") or 0) for i in invoices)
	orders = sum(1 for i in invoices if not i.get("is_return"))
	return round(total, 2), orders


def apply_cash_adjustment(rows, mode_types, change_total):
	"""Subtract invoice change_amount from the 'Cash' mode (else the largest Cash-type mode).

	rows: [{mode_of_payment, total}]; mode_types: {mode: Mode of Payment.type}.
	Returns new rows; unchanged when there is no cash-type mode or no change.
	"""
	change_total = float(change_total or 0)
	out = [dict(r) for r in rows]
	if not change_total:
		return out
	cash = [r for r in out if mode_types.get(r.get("mode_of_payment")) == "Cash"]
	if not cash:
		return out
	target = next((r for r in cash if r.get("mode_of_payment") == "Cash"), None)
	if target is None:
		target = max(cash, key=lambda r: float(r.get("total") or 0))
	target["total"] = float(target.get("total") or 0) - change_total
	return out


def date_in_range(day, today, max_lookback=MAX_LOOKBACK_DAYS):
	return today - timedelta(days=max_lookback) <= day <= today


def allowed_from_perms(perms, doctype):
	"""None if the user has no permission rows for doctype (unrestricted), else the allowed values."""
	rows = (perms or {}).get(doctype)
	if not rows:
		return None
	return sorted({r.get("doc") if isinstance(r, dict) else r for r in rows} - {None})


def intersect_scope(allowed, present):
	"""Intersection of allowed values with values present in data. None allowed -> all present."""
	if allowed is None:
		return sorted(present)
	return sorted(set(allowed) & set(present))


def currency_info(currency_by_company, companies, default=CURRENCY):
	"""(currency, mixed). Single distinct currency among companies in scope -> it; else default + mixed."""
	cur = {currency_by_company.get(c) for c in companies if currency_by_company.get(c)}
	if len(cur) == 1:
		return next(iter(cur)), False
	return default, len(cur) > 1


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
	pct = pct_text(delta)
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


def _today():
	return getdate(frappe.utils.nowdate())


def _parse_date(date):
	today = _today()
	if not date:
		return today - timedelta(days=1)
	try:
		day = getdate(date)
	except Exception:
		frappe.throw(frappe._("Invalid date: {0}").format(date), frappe.ValidationError)
	if not date_in_range(day, today):
		frappe.throw(frappe._("Date out of range: {0}").format(date), frappe.ValidationError)
	return day


def _allowed(doctype):
	# frappe.permissions.get_user_permissions: {doctype: [{doc, ...}]}; {} for Administrator/Guest
	return allowed_from_perms(frappe.permissions.get_user_permissions(frappe.session.user), doctype)


def _base_query(start, end):
	"""POS Invoice rows, docstatus=1, date range, INCLUDING returns (net_total is negative on
	returns). Status deliberately NOT filtered (Consolidated invoices must count). Single choke
	point for user-permission scoping on Company and Branch (Administrator is scoped too if
	they have permissions); a permitted-but-empty intersection yields no rows, never all."""
	pi = frappe.qb.DocType("POS Invoice")
	q = (
		frappe.qb.from_(pi)
		.where(pi.docstatus == 1)
		.where(pi.posting_date >= start)
		.where(pi.posting_date <= end)
	)
	for doctype, col in (("Company", pi.company), ("Branch", pi.branch)):
		allowed = _allowed(doctype)
		if allowed is None:
			continue
		q = q.where(col.isin(allowed)) if allowed else q.where(pi.docstatus == -99)
	return pi, q


def _daily_rows(start, end):
	from frappe.query_builder.functions import Sum
	from pypika import Case

	pi, q = _base_query(start, end)
	order = Case().when(pi.is_return == 0, 1).else_(0)
	return (
		q.select(pi.posting_date, Sum(pi.net_total).as_("total"), Sum(order).as_("orders"))
		.groupby(pi.posting_date)
		.run(as_dict=True)
	)


def _scope(start, end):
	pi, q = _base_query(start, end)
	rows = q.select(pi.company, pi.branch).distinct().run(as_dict=True)
	return (
		intersect_scope(None, {r.company for r in rows if r.company}),
		intersect_scope(None, {r.branch for r in rows if r.branch}),
	)


def _company_currencies(companies):
	if not companies:
		return {}
	co = frappe.qb.DocType("Company")
	rows = frappe.qb.from_(co).where(co.name.isin(companies)).select(co.name, co.default_currency).run(as_dict=True)
	return {r.name: r.default_currency for r in rows}


def _per_day(rows):
	return {getdate(r["posting_date"]): float(r["total"] or 0) for r in rows}


def slide_yesterday(day, rows):
	"""rows: _daily_rows(day-7, day), computed once per request by get_brief."""
	dates = window_dates(day)
	prev = day - timedelta(days=7)
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
		"delta_label": None if delta is None else pct_text(delta) + "%",
		"tone": tone_for(delta),
		"orders": orders.get(day, 0),
		"orders_compare": orders.get(prev, 0),
		"chart": {"type": "spark", "series": spark_series(dates, totals)},
		"drill": DRILL_DASHBOARD,
		"basis": "net_sales",
		"data_quality": "ok",
	}


def slide_channel_mix(day, rows):
	from frappe.query_builder.functions import Sum

	start = window_dates(day)[0]
	pi, q = _base_query(start, day)
	crow = q.select(pi.order_type, Sum(pi.net_total).as_("total")).groupby(pi.order_type).run(as_dict=True)
	series = aggregate_series(crow, "order_type", "total")
	total = total_of(series)
	unspecified = sum(s["value"] for s in series if s["label"] == UNSPECIFIED)
	days_with = len([r for r in rows if getdate(r["posting_date"]) >= start and ((r["total"] or 0) or r["orders"])])
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
		"basis": "net_sales",
		"data_quality": data_quality_for(days_with, unspecified, total),
	}


def slide_payment_mix(day):
	from frappe.query_builder.functions import Sum

	start = window_dates(day)[0]
	pi, q = _base_query(start, day)
	sip = frappe.qb.DocType("Sales Invoice Payment")
	rows = (
		q.join(sip)
		.on(sip.parent == pi.name)
		.where(sip.parenttype == "POS Invoice")
		.select(sip.mode_of_payment, Sum(sip.amount).as_("total"))
		.groupby(sip.mode_of_payment)
		.run(as_dict=True)
	)
	# Money actually received: tendered amount minus change given back (cash only).
	# NOTE: gross of tax, unlike the net_total channel mix; totals differ by design.
	pi2, cq = _base_query(start, day)
	change = cq.select(Sum(pi2.change_amount).as_("c")).run(as_dict=True)
	change_total = float((change[0]["c"] if change else 0) or 0)
	mop = frappe.qb.DocType("Mode of Payment")
	types = {r.name: r.type for r in frappe.qb.from_(mop).select(mop.name, mop.type).run(as_dict=True)}
	rows = apply_cash_adjustment(rows, types, change_total)
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
		"basis": "payments_received",
		"data_quality": "ok",
	}


@frappe.whitelist()
def get_brief(date=None):
	"""Chairman Brief for business day `date` (default yesterday, system time zone; must be within
	[today-400, today]). See p0_contract.md."""
	_check_role()
	day = _parse_date(date)
	start = window_dates(day)[0]
	rows = _daily_rows(day - timedelta(days=7), day)  # computed once, reused by slides 1 and 2
	companies, branches = _scope(start, day)
	currency, mixed = currency_info(_company_currencies(companies), companies)
	slides = [slide_yesterday(day, rows), slide_channel_mix(day, rows), slide_payment_mix(day)]
	scope = {"companies": companies, "branches": branches}
	out = {
		"schema_version": SCHEMA_VERSION,
		"as_of": now_datetime().isoformat(),
		"date": day.isoformat(),
		"currency": currency,
		"locale": LOCALE,
		"scope": scope,
		"slides": slides,
	}
	if mixed:
		scope["note"] = "Multiple company currencies in scope; amounts are not converted."
		out["currency_mixed"] = True
		for sl in slides:
			sl["data_quality"] = "partial"
	return out

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
"""Read-only tools the Chairman Brief chat agent (Huf) may call.

Every tool:
  * re-checks the caller has the "URY Chairman" role (chairman.ALLOWED_ROLES) and refuses
    with a PermissionError otherwise;
  * applies the caller's Company/Branch User Permissions, because all data comes through
    chairman._base_query / chairman_slides._pi_query (or chairman._allowed for KOTs);
  * validates dates (end not before start, not in the future, at most 366 days);
  * returns small JSON: every amount appears raw (number) and as "*_text" in compact INR.

There is deliberately NO generic SQL or list-any-doctype tool.

Registration: TOOLS is a list of {name, description, parameters (JSON schema), func}. The
agent seeding step creates one Huf Agent Tool per entry, with function_path
"ury.ury.api.chairman_tools.<name>". Huf calls func(**arguments) as the chairman.
Amounts are net of tax (net sales) unless the tool says otherwise.
"""

from datetime import timedelta
from functools import wraps

import frappe
from frappe.utils import getdate

MAX_RANGE_DAYS = 366
MAX_LOOKBACK_DAYS = 800
DEFAULT_LIMIT = 5
MAX_LIMIT = 20
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


# ---------------------------------------------------------------- lazy imports


def _chairman():
	try:
		from ury.ury.api import chairman
	except ImportError:  # pure run from this directory
		import chairman
	return chairman


def _slides():
	try:
		from ury.ury.api import chairman_slides
	except ImportError:
		import chairman_slides
	return chairman_slides


# ---------------------------------------------------------------- pure helpers


def money(value):
	return round(float(value or 0), 2)


def amount(value):
	"""{"value": raw, "text": compact INR}."""
	return {"value": money(value), "text": _chairman().format_inr_compact(value)}


def validate_range(start, end, today):
	"""Return (start_date, end_date). Raises ValueError with a plain message."""
	try:
		s, e = getdate(start), getdate(end)
	except Exception:
		raise ValueError("Dates must look like 2026-10-21.") from None
	if s is None or e is None:
		raise ValueError("Both start_date and end_date are required.")
	if e < s:
		raise ValueError("end_date is before start_date.")
	if e > today:
		raise ValueError("end_date is in the future.")
	if (e - s).days + 1 > MAX_RANGE_DAYS:
		raise ValueError(f"The range is longer than {MAX_RANGE_DAYS} days.")
	if s < today - timedelta(days=MAX_LOOKBACK_DAYS):
		raise ValueError("start_date is too far in the past.")
	return s, e


def clamp_limit(limit):
	try:
		n = int(limit if limit is not None else DEFAULT_LIMIT)
	except (TypeError, ValueError):
		raise ValueError("limit must be a whole number.") from None
	if n < 1:
		raise ValueError("limit must be at least 1.")
	return min(n, MAX_LIMIT)


def mix_series(rows, label_key, value_key, unspecified="Unspecified"):
	"""[{label, value, value_text, share_pct}] biggest first; blank label -> Unspecified."""
	acc = {}
	for r in rows:
		label = (r.get(label_key) or "").strip() or unspecified
		acc[label] = acc.get(label, 0.0) + float(r.get(value_key) or 0)
	total = sum(acc.values())
	out = []
	for label, v in sorted(acc.items(), key=lambda kv: (-kv[1], kv[0])):
		out.append(
			{
				"label": label,
				"value": money(v),
				"value_text": _chairman().format_inr_compact(v),
				"share_pct": round(v / total * 100, 1) if total else 0.0,
			}
		)
	return out, money(total)


def _secs(t):
	if t is None or t == "":
		return None
	if hasattr(t, "total_seconds"):
		return t.total_seconds()
	h, m, s = (str(t).split(":") + ["0", "0"])[:3]
	return int(h) * 3600 + int(m) * 60 + float(s)


def kitchen_speed_summary(rows):
	"""rows: [{time, start_time_prep, start_time_serv}] (times of day, one KOT each).
	Wait = order -> served, prep = order -> prep started. Negative/missing spans are skipped
	(midnight crossings are not guessed). Returns minutes, rounded to 0.1."""
	waits, preps = [], []
	for r in rows:
		t0, tp, ts = _secs(r.get("time")), _secs(r.get("start_time_prep")), _secs(r.get("start_time_serv"))
		if t0 is None:
			continue
		if ts is not None and ts >= t0:
			waits.append((ts - t0) / 60)
		if tp is not None and tp >= t0:
			preps.append((tp - t0) / 60)

	def avg(xs):
		return round(sum(xs) / len(xs), 1) if xs else None

	waits_sorted = sorted(waits)
	median = None
	if waits_sorted:
		mid = len(waits_sorted) // 2
		median = round(
			waits_sorted[mid] if len(waits_sorted) % 2 else (waits_sorted[mid - 1] + waits_sorted[mid]) / 2, 1
		)
	return {
		"tickets": len(rows),
		"tickets_with_served_time": len(waits),
		"avg_minutes_order_to_served": avg(waits),
		"median_minutes_order_to_served": median,
		"slowest_minutes_order_to_served": round(max(waits), 1) if waits else None,
		"avg_minutes_order_to_prep_start": avg(preps),
	}


def weekday_profile(per_day):
	"""per_day {date: net}. Average net sales per weekday over days present."""
	acc = {}
	for d, v in per_day.items():
		acc.setdefault(d.weekday(), []).append(v)
	return [
		{"weekday": WEEKDAYS[i], "days": len(acc[i]), "avg": money(sum(acc[i]) / len(acc[i]))}
		for i in sorted(acc)
	]


# ---------------------------------------------------------------- guard


def guarded(fn):
	"""Role check first, then input validation errors become clear ValidationErrors."""

	@wraps(fn)
	def wrapper(*args, **kwargs):
		_chairman()._check_role()  # raises frappe.PermissionError
		try:
			return fn(*args, **kwargs)
		except ValueError as e:
			frappe.throw(str(e), frappe.ValidationError)

	return wrapper


def _today():
	return _chairman()._today()


def _range(start_date, end_date):
	return validate_range(start_date, end_date, _today())


def _day(date):
	"""Single business day; default yesterday."""
	if not date:
		return _today() - timedelta(days=1)
	return _range(date, date)[0]


def _compact_slide(slide, keys=()):
	"""Slim a slide dict: keep headline, tone, numbers (raw + text) and listed extra keys."""
	out = {"headline": slide.get("headline"), "tone": slide.get("tone"), "status": slide.get("status", "ok")}
	if slide.get("value") is not None:
		out["value"] = amount(slide["value"])
	if slide.get("compare") is not None:
		out["compare"] = amount(slide["compare"])
	for k in ("delta_pct", "delta_label", "compare_label", "data_quality", "unavailable_reason"):
		if slide.get(k) is not None:
			out[k] = slide[k]
	for k in keys:
		if k in slide:
			out[k] = slide[k]
	return out


# ---------------------------------------------------------------- tools (reuse builders)


@guarded
def get_day_summary(date=None):
	"""Net sales and order count for one day, compared with the same weekday a week earlier.
	Use for questions like 'how did we do yesterday?'. Leave date empty for yesterday."""
	chairman = _chairman()
	day = _day(date)
	rows = chairman._daily_rows(day - timedelta(days=7), day)
	slide = chairman.slide_yesterday(day, rows)
	out = _compact_slide(slide, ("orders", "orders_compare"))
	out["date"] = day.isoformat()
	return out


@guarded
def get_month_to_date(date=None):
	"""Net sales from the 1st of the month up to the date, against the same number of days last
	month. There is no sales target in the system, so no target comparison is available."""
	day = _day(date)
	slide = _slides().slide_mtd_target(day)
	out = _compact_slide(slide, ("compare_basis",))
	out["date"] = day.isoformat()
	return out


@guarded
def get_branch_ranking(date=None):
	"""Branches ranked by net sales for the day, with month-to-date for each. Only branches the
	caller may see are included."""
	day = _day(date)
	slide = _slides().slide_branch_ranking(day)
	out = _compact_slide(slide)
	out["date"] = day.isoformat()
	out["branches"] = [
		{
			"branch": b["label"],
			"day": amount(b["value"]),
			"month_to_date": amount(b["mtd"]),
		}
		for b in slide.get("branches", [])
	]
	return out


@guarded
def get_leakage_week(date=None):
	"""Cancellations (count, value, top reason) and discounts for the 7 days ending on the date."""
	day = _day(date)
	slide = _slides().slide_leakage(day)
	out = _compact_slide(slide, ("cancellations", "discounts"))
	out["date"] = day.isoformat()
	return out


@guarded
def get_cashup_week(date=None):
	"""Cash-up (till closing) results for the 7 days ending on the date: how many closings were
	off from the expected cash, and by how much in total."""
	day = _day(date)
	slide = _slides().slide_cashup(day)
	out = _compact_slide(slide, ("entries", "exceptions"))
	out["net_difference"] = amount(slide.get("net_difference"))
	out["date"] = day.isoformat()
	return out


# ---------------------------------------------------------------- tools (small new reads)


@guarded
def get_sales_range(start_date, end_date):
	"""Net sales and order count for a date range (max 366 days), with a per-day list and the
	best and worst day. Returns are netted off."""
	chairman = _chairman()
	s, e = _range(start_date, end_date)
	rows = chairman._daily_rows(s, e)
	per_day = chairman._per_day(rows)
	orders = {getdate(r["posting_date"]): int(r["orders"] or 0) for r in rows}
	total = money(sum(per_day.values()))
	n_orders = sum(orders.values())
	days = []
	cur = s
	while cur <= e:
		days.append({"date": cur.isoformat(), "net": money(per_day.get(cur, 0)), "orders": orders.get(cur, 0)})
		cur += timedelta(days=1)
	trading = [d for d in days if d["orders"] or d["net"]]
	out = {
		"start_date": s.isoformat(),
		"end_date": e.isoformat(),
		"days_in_range": len(days),
		"days_with_sales": len(trading),
		"net_sales": amount(total),
		"orders": n_orders,
		"avg_order_value": amount(total / n_orders) if n_orders else None,
		"avg_per_trading_day": amount(total / len(trading)) if trading else None,
		"best_day": max(trading, key=lambda d: d["net"]) if trading else None,
		"worst_day": min(trading, key=lambda d: d["net"]) if trading else None,
		"weekday_profile": [{**w, "avg_text": chairman.format_inr_compact(w["avg"])} for w in weekday_profile(per_day)],
	}
	if len(days) <= 62:
		out["daily"] = days
	return out


@guarded
def get_top_bottom_dishes(start_date, end_date, limit=DEFAULT_LIMIT):
	"""Best and worst selling dishes (by net sales) for a date range, with quantity sold.
	The worst list only has dishes that sold at least once in the range."""
	from frappe.query_builder.functions import Sum

	chairman_slides = _slides()
	s, e = _range(start_date, end_date)
	n = clamp_limit(limit)
	pi, q = chairman_slides._pi_query(s, e)
	pii = frappe.qb.DocType("POS Invoice Item")
	rows = (
		q.join(pii)
		.on(pii.parent == pi.name)
		.where(pii.parenttype == "POS Invoice")
		.where(pi.is_return == 0)
		.where(pii.qty > 0)
		.select(pii.item_code, pii.item_name, Sum(pii.net_amount).as_("total"), Sum(pii.qty).as_("qty"))
		.groupby(pii.item_code, pii.item_name)
		.run(as_dict=True)
	)
	top, bottom = chairman_slides.split_top_bottom(rows, n)

	def fmt(items):
		return [
			{"dish": i["label"], "net_sales": amount(i["value"]), "qty": i["qty"]} for i in items
		]

	return {
		"start_date": s.isoformat(),
		"end_date": e.isoformat(),
		"dishes_sold": len(rows),
		"top": fmt(top),
		"bottom": fmt(bottom),
	}


@guarded
def get_order_type_and_payment_mix(start_date, end_date):
	"""How sales split by order type (dine in, takeaway, delivery...) as net sales, and by
	payment method as money received (cash is net of change given back), for a date range."""
	from frappe.query_builder.functions import Sum

	chairman = _chairman()
	s, e = _range(start_date, end_date)
	pi, q = chairman._base_query(s, e)
	crow = q.select(pi.order_type, Sum(pi.net_total).as_("total")).groupby(pi.order_type).run(as_dict=True)
	order_types, order_total = mix_series(crow, "order_type", "total")

	sip = frappe.qb.DocType("Sales Invoice Payment")
	pi2, q2 = chairman._base_query(s, e)
	prow = (
		q2.join(sip)
		.on(sip.parent == pi2.name)
		.where(sip.parenttype == "POS Invoice")
		.select(sip.mode_of_payment, Sum(sip.amount).as_("total"))
		.groupby(sip.mode_of_payment)
		.run(as_dict=True)
	)
	pi3, q3 = chairman._base_query(s, e)
	change = q3.select(Sum(pi3.change_amount).as_("c")).run(as_dict=True)
	change_total = float((change[0]["c"] if change else 0) or 0)
	mop = frappe.qb.DocType("Mode of Payment")
	types = {r.name: r.type for r in frappe.qb.from_(mop).select(mop.name, mop.type).run(as_dict=True)}
	prow = chairman.apply_cash_adjustment(prow, types, change_total)
	payments, pay_total = mix_series(prow, "mode_of_payment", "total")
	return {
		"start_date": s.isoformat(),
		"end_date": e.isoformat(),
		"order_types": {"basis": "net_sales", "total": amount(order_total), "series": order_types},
		"payments": {"basis": "payments_received", "total": amount(pay_total), "series": payments},
	}


@guarded
def get_cancellations(start_date, end_date):
	"""Cancelled invoices for a date range: count, value, and a split by the reason given."""
	from frappe.query_builder.functions import Count, Sum

	s, e = _range(start_date, end_date)
	pi, q = _slides()._pi_query(s, e, docstatus=2)
	rows = (
		q.select(pi.cancel_reason, Count(pi.name).as_("n"), Sum(pi.net_total).as_("total"))
		.groupby(pi.cancel_reason)
		.run(as_dict=True)
	)
	by_reason, total = mix_series(
		[{"cancel_reason": r["cancel_reason"], "total": abs(float(r["total"] or 0))} for r in rows],
		"cancel_reason",
		"total",
	)
	counts = {}
	for r in rows:
		label = (r["cancel_reason"] or "").strip() or "Unspecified"
		counts[label] = counts.get(label, 0) + int(r["n"] or 0)
	for item in by_reason:
		item["count"] = counts.get(item["label"], 0)
	return {
		"start_date": s.isoformat(),
		"end_date": e.isoformat(),
		"count": sum(counts.values()),
		"value": amount(total),
		"by_reason": by_reason,
	}


@guarded
def get_kitchen_speed(start_date, end_date):
	"""How fast the kitchen is for a date range: average and median minutes from the order
	being placed to the food being served, and to preparation starting. Based on kitchen
	tickets (KOT) that have times recorded."""
	chairman = _chairman()
	s, e = _range(start_date, end_date)
	kot = frappe.qb.DocType("URY KOT")
	q = (
		frappe.qb.from_(kot)
		.where(kot.docstatus != 2)
		.where(kot.date >= s)
		.where(kot.date <= e)
	)
	allowed = chairman._allowed("Branch")
	if allowed is not None:
		q = q.where(kot.branch.isin(allowed)) if allowed else q.where(kot.docstatus == -99)
	rows = q.select(kot.time, kot.start_time_prep, kot.start_time_serv).run(as_dict=True)
	out = kitchen_speed_summary(rows)
	out.update({"start_date": s.isoformat(), "end_date": e.isoformat()})
	return out


@guarded
def get_ideas_context(start_date, end_date):
	"""Facts only, no advice, for brainstorming ideas to grow sales or cut waste over a date
	range: sales and weekday pattern, order-type and payment mix, weakest and strongest dishes,
	branch spread, cancellations and discounts. The model reasons from these facts."""
	s, e = _range(start_date, end_date)
	sales = get_sales_range(start_date, end_date)
	mix = get_order_type_and_payment_mix(start_date, end_date)
	dishes = get_top_bottom_dishes(start_date, end_date, 5)
	cancels = get_cancellations(start_date, end_date)
	chairman_slides = _slides()
	from frappe.query_builder.functions import Sum

	pi, q = chairman_slides._pi_query(s, e)
	brows = q.select(pi.branch, Sum(pi.net_total).as_("total")).groupby(pi.branch).run(as_dict=True)
	branches, _t = mix_series(brows, "branch", "total")
	pi2, dq = chairman_slides._pi_query(s, e)
	d = dq.where(pi2.is_return == 0).select(Sum(pi2.discount_amount).as_("disc")).run(as_dict=True)
	discount = money(d[0]["disc"]) if d else 0.0
	net = sales["net_sales"]["value"]
	weekdays = sales["weekday_profile"]
	return {
		"start_date": s.isoformat(),
		"end_date": e.isoformat(),
		"note": "Facts only. Do not treat any line as a recommendation.",
		"net_sales": sales["net_sales"],
		"orders": sales["orders"],
		"avg_order_value": sales["avg_order_value"],
		"strongest_weekday": max(weekdays, key=lambda w: w["avg"]) if weekdays else None,
		"weakest_weekday": min(weekdays, key=lambda w: w["avg"]) if weekdays else None,
		"order_types": mix["order_types"]["series"],
		"payments": mix["payments"]["series"],
		"top_dishes": dishes["top"],
		"bottom_dishes": dishes["bottom"],
		"branches": branches,
		"cancellations": {"count": cancels["count"], "value": cancels["value"], "by_reason": cancels["by_reason"][:3]},
		"discounts": {
			"value": amount(discount),
			"pct_of_net_sales": round(discount / net * 100, 1) if net else None,
		},
	}


# ---------------------------------------------------------------- registry

_DATE = {"type": "string", "description": "Date as YYYY-MM-DD."}


def _schema(props, required=()):
	return {"type": "object", "properties": props, "required": list(required), "additionalProperties": False}


_RANGE_PROPS = {
	"start_date": {**_DATE, "description": "First day, YYYY-MM-DD."},
	"end_date": {**_DATE, "description": "Last day, YYYY-MM-DD, not in the future. Range is at most 366 days."},
}
_DAY_PROPS = {"date": {**_DATE, "description": "Business day, YYYY-MM-DD. Leave out for yesterday."}}


def _entry(func, props, required=()):
	return {
		"name": func.__name__,
		"description": " ".join((func.__doc__ or "").split()),
		"parameters": _schema(props, required),
		"func": func,
	}


TOOLS = [
	_entry(get_day_summary, _DAY_PROPS),
	_entry(get_month_to_date, _DAY_PROPS),
	_entry(get_branch_ranking, _DAY_PROPS),
	_entry(get_leakage_week, _DAY_PROPS),
	_entry(get_cashup_week, _DAY_PROPS),
	_entry(get_sales_range, _RANGE_PROPS, ("start_date", "end_date")),
	_entry(
		get_top_bottom_dishes,
		{**_RANGE_PROPS, "limit": {"type": "integer", "description": "How many dishes per list, 1 to 20. Default 5."}},
		("start_date", "end_date"),
	),
	_entry(get_order_type_and_payment_mix, _RANGE_PROPS, ("start_date", "end_date")),
	_entry(get_cancellations, _RANGE_PROPS, ("start_date", "end_date")),
	_entry(get_kitchen_speed, _RANGE_PROPS, ("start_date", "end_date")),
	_entry(get_ideas_context, _RANGE_PROPS, ("start_date", "end_date")),
]

TOOLS_BY_NAME = {t["name"]: t for t in TOOLS}

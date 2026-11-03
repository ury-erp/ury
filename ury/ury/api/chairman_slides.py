# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Chairman Brief P1 slide builders (plan slides 2, 3, 5, 7, 9). Read-only.
# Every builder returns the P0 slide dict shape plus a "status" key
# ("ok" | "unavailable") and is scoped by the caller's Company/Branch User
# Permissions through chairman._allowed (imported lazily: no import cycle with
# chairman.py, which will import this module). Role checks are the caller's job
# (get_brief). Pure helpers take plain values and are unit-testable without a site.
#
#   2 mtd_target      MTD net sales; target doctype does not exist -> status "unavailable"
#                     (MTD vs same days last month is still reported as the fallback)
#   3 branch_ranking  net sales per branch for day D, MTD alongside, ranked
#   5 top_bottom_items top 3 / bottom 3 items by net_amount, window D-6..D
#   7 leakage         cancellations (docstatus=2) + discounts, window D-6..D
#   8 kitchen         avg / p90 minutes per served KOT (production_time, stored in MILLISECONDS), day D
#   9 cashup          POS Closing Entry Detail rows with difference<>0, window D-6..D
#  10 covers          covers (no_of_pax) on Paid Dine In bills for day D + spend per cover

import calendar
from datetime import timedelta

import frappe
from frappe.utils import getdate

UNSPECIFIED = "Unspecified"
WINDOW_DAYS = 7
TOP_N = 3
LEAKAGE_BAD_RATIO = 0.05
SLIDE_IDS = ("mtd_target", "branch_ranking", "top_bottom_items", "leakage", "kitchen", "cashup", "covers")
MS_PER_MIN = 60000.0


# ---------------------------------------------------------------- pure helpers


def _drill():
	# None when Insights is not installed (no dead /insights link); see analytics_env.
	from ury.ury.api import analytics_env

	return analytics_env.dashboard_url("owner")


def _chairman():
	# Lazy: chairman.py wires this module in, so a top-level import would be circular.
	try:
		from ury.ury.api import chairman
	except ImportError:  # pure run from this directory
		import chairman
	return chairman


def money(value):
	return round(float(value or 0), 2)


def month_ranges(day):
	"""((mtd_start, day), (prev_start, prev_end)): MTD of `day` and the same number of days
	last month (clamped to the previous month's length, e.g. 31 Mar -> 28 Feb)."""
	mtd_start = day.replace(day=1)
	prev_last = mtd_start - timedelta(days=1)
	prev_start = prev_last.replace(day=1)
	prev_end = prev_start.replace(day=min(day.day, calendar.monthrange(prev_last.year, prev_last.month)[1]))
	return (mtd_start, day), (prev_start, prev_end)


def sum_range(per_day, start, end):
	"""Sum of per_day {date: amount} for start <= d <= end."""
	return money(sum(v for d, v in per_day.items() if start <= d <= end))


def rank_branches(rows, day):
	"""rows: [{posting_date, branch, total}] covering MTD. Returns
	[{label, value (day total), mtd}] ranked by day value desc, then mtd desc, then label.
	Branches with only MTD activity are kept (value 0). Blank branch -> 'Unspecified'."""
	acc = {}
	for r in rows:
		label = (r.get("branch") or "").strip() or UNSPECIFIED
		item = acc.setdefault(label, {"label": label, "value": 0.0, "mtd": 0.0})
		amount = float(r.get("total") or 0)
		item["mtd"] += amount
		if getdate(r["posting_date"]) == day:
			item["value"] += amount
	out = [{"label": i["label"], "value": money(i["value"]), "mtd": money(i["mtd"])} for i in acc.values()]
	return sorted(out, key=lambda i: (-i["value"], -i["mtd"], i["label"]))


def split_top_bottom(rows, n=TOP_N):
	"""rows: [{item_code, item_name, total, qty}] already restricted to sold lines (qty>0).
	Returns (top, bottom): top n by total desc; bottom n by total asc drawn from the items
	NOT in top (so a small catalogue never lists an item twice). Ties break on label."""
	items = [
		{
			"label": (r.get("item_name") or r.get("item_code") or UNSPECIFIED),
			"item_code": r.get("item_code"),
			"value": money(r.get("total")),
			"qty": float(r.get("qty") or 0),
		}
		for r in rows
	]
	desc = sorted(items, key=lambda i: (-i["value"], i["label"], i["item_code"] or ""))
	top = desc[:n]
	rest = desc[n:]
	bottom = sorted(rest, key=lambda i: (i["value"], i["label"], i["item_code"] or ""))[:n]
	return top, bottom


def items_headline(top, bottom):
	if not top:
		return frappe._("No items sold this week")
	chairman = _chairman()
	text = frappe._("Top seller {0} ({1})").format(top[0]["label"], chairman.format_inr_compact(top[0]["value"]))
	if bottom:
		text += frappe._(", weakest {0} ({1})").format(
			bottom[0]["label"], chairman.format_inr_compact(bottom[0]["value"])
		)
	return text


def mtd_headline(mtd, prev, delta):
	chairman = _chairman()
	head = frappe._("No monthly target set. ")
	if mtd == 0 and prev == 0:
		return head + frappe._("No sales this month yet")
	amount = chairman.format_inr_compact(mtd)
	if delta is None:
		return head + frappe._("Month to date {0}, no sales in the same days last month").format(amount)
	if chairman.tone_for(delta) == "neutral":
		return head + frappe._("Month to date {0}, flat vs same days last month").format(amount)
	word = frappe._("up") if delta > 0 else frappe._("down")
	return head + frappe._("Month to date {0}, {1} {2}% vs same days last month").format(
		amount, word, chairman.pct_text(delta)
	)


def branch_headline(ranked):
	chairman = _chairman()
	if not ranked or all(r["value"] == 0 for r in ranked):
		return frappe._("No sales recorded for any branch")
	top = ranked[0]
	if len(ranked) == 1:
		return frappe._("{0} sold {1}").format(top["label"], chairman.format_inr_compact(top["value"]))
	return frappe._("{0} led with {1} of {2} branches").format(
		top["label"], chairman.format_inr_compact(top["value"]), len(ranked)
	)


def leakage_tone(cancel_value, discount_value, net_sales):
	"""good: nothing leaked; bad: cancelled value >= 5% of net sales; else neutral."""
	if not cancel_value and not discount_value:
		return "good"
	if net_sales > 0 and cancel_value / net_sales >= LEAKAGE_BAD_RATIO:
		return "bad"
	return "neutral"


def top_reason(rows):
	"""rows: [{cancel_reason, n, total}] -> reason with most cancellations (value, label as ties), or None."""
	if not rows:
		return None
	best = sorted(
		rows,
		key=lambda r: (-int(r.get("n") or 0), -abs(float(r.get("total") or 0)), (r.get("cancel_reason") or "")),
	)[0]
	return (best.get("cancel_reason") or "").strip() or UNSPECIFIED


def leakage_headline(cancel_count, cancel_value, discount_value, reason):
	chairman = _chairman()
	if not cancel_count and not discount_value:
		return frappe._("No cancellations or discounts this week")
	parts = []
	if cancel_count:
		text = frappe._("{0} cancelled orders ({1})").format(cancel_count, chairman.format_inr_compact(cancel_value))
		if reason:
			text += frappe._(", mostly {0}").format(reason)
		parts.append(text)
	if discount_value:
		parts.append(frappe._("{0} in discounts").format(chairman.format_inr_compact(discount_value)))
	return frappe._(" and ").join(parts)


def cashup_summary(rows):
	"""rows: [{difference}] one per closing-entry detail. -> (entries, exceptions, abs_total, net_total)."""
	diffs = [float(r.get("difference") or 0) for r in rows]
	exc = [d for d in diffs if round(d, 2) != 0]
	return len(diffs), len(exc), money(sum(abs(d) for d in exc)), money(sum(exc))


def cashup_headline(entries, exceptions, abs_total):
	if not entries:
		return frappe._("No cash-ups recorded this week")
	if not exceptions:
		return frappe._("All tills balanced")
	return frappe._("{0} till counts off by {1} in total").format(
		exceptions, _chairman().format_inr_compact(abs_total)
	)


def cashup_tone(entries, exceptions):
	if not entries:
		return "neutral"
	return "bad" if exceptions else "good"


def ms_to_minutes(values):
	"""production_time text/number values in MILLISECONDS -> minutes. Blank, non-numeric,
	zero and negative values are dropped (an unfinished KOT has no duration)."""
	out = []
	for v in values:
		try:
			f = float(v)
		except (TypeError, ValueError):
			continue
		if f > 0 and f == f:
			out.append(f / MS_PER_MIN)
	return out


def percentile(values, pct):
	"""Linear-interpolated percentile (pct 0-100) of a list; None when empty."""
	if not values:
		return None
	xs = sorted(values)
	k = (len(xs) - 1) * pct / 100.0
	lo = int(k)
	hi = min(lo + 1, len(xs) - 1)
	return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def kitchen_summary(durations_ms):
	"""-> (count, avg_min, p90_min); avg/p90 are None when there is no usable duration."""
	mins = ms_to_minutes(durations_ms)
	if not mins:
		return 0, None, None
	return len(mins), round(sum(mins) / len(mins), 1), round(percentile(mins, 90), 1)


def kitchen_headline(count, avg, p90):
	if not count:
		return frappe._("No kitchen tickets completed")
	return frappe._("Kitchen averaged {0} min per ticket, slowest 10% took {1} min or more").format(avg, p90)


def kitchen_tone(count, p90):
	"""good: p90 within 15 min (default kitchen warning time); bad: p90 over 25 min; none: neutral."""
	if not count or p90 is None:
		return "neutral"
	if p90 <= 15:
		return "good"
	return "bad" if p90 > 25 else "neutral"


def covers_summary(rows):
	"""rows: [{pax, net_total}] Paid Dine In bills. Only bills with pax > 0 count (bills without
	covers would dilute spend per cover). -> (bills, covers, net_sales, spend_per_cover|None)."""
	bills = covers = 0
	net = 0.0
	for r in rows:
		try:
			pax = int(float(r.get("pax") or 0))
		except (TypeError, ValueError):
			pax = 0
		if pax <= 0:
			continue
		bills += 1
		covers += pax
		net += float(r.get("net_total") or 0)
	return bills, covers, money(net), (round(net / covers) if covers else None)


def covers_headline(covers, spend):
	if not covers:
		return frappe._("No covers recorded")
	return frappe._("{0} covers, {1} spend per cover").format(covers, _chairman().format_inr_compact(spend))


def _slide(sid, title, headline, **kw):
	slide = {
		"id": sid,
		"title": title,
		"headline": headline,
		"value": None,
		"compare": None,
		"delta_pct": None,
		"delta_label": None,
		"tone": "neutral",
		"chart": {"type": "bar", "series": []},
		"drill": _drill(),
		"basis": "net_sales",
		"status": "ok",
		"data_quality": "ok",
	}
	slide.update(kw)
	return slide


# ---------------------------------------------------------------- DB layer


def _scope(q, company_col, branch_col, never_col):
	"""Apply Company/Branch User Permission scope. A permitted-but-empty set yields no rows."""
	chairman = _chairman()
	for doctype, col in (("Company", company_col), ("Branch", branch_col)):
		allowed = chairman._allowed(doctype)
		if allowed is None:
			continue
		q = q.where(col.isin(allowed)) if allowed else q.where(never_col == -99)
	return q


def _pi_query(start, end, docstatus=1):
	pi = frappe.qb.DocType("POS Invoice")
	q = (
		frappe.qb.from_(pi)
		.where(pi.docstatus == docstatus)
		.where(pi.posting_date >= start)
		.where(pi.posting_date <= end)
	)
	return pi, _scope(q, pi.company, pi.branch, pi.docstatus)


def _daily_net(start, end):
	"""{date: SUM(net_total)} incl. returns (same basis as slide 1)."""
	from frappe.query_builder.functions import Sum

	pi, q = _pi_query(start, end)
	rows = q.select(pi.posting_date, Sum(pi.net_total).as_("total")).groupby(pi.posting_date).run(as_dict=True)
	return {getdate(r["posting_date"]): float(r["total"] or 0) for r in rows}


def slide_mtd_target(day):
	(mtd_start, mtd_end), (prev_start, prev_end) = month_ranges(day)
	per_day = _daily_net(prev_start, mtd_end)
	mtd = sum_range(per_day, mtd_start, mtd_end)
	prev = sum_range(per_day, prev_start, prev_end)
	chairman = _chairman()
	delta = chairman.compute_delta(mtd, prev)
	series = [
		{"label": frappe._("Last month"), "value": prev},
		{"label": frappe._("This month"), "value": mtd},
	]
	return _slide(
		"mtd_target",
		frappe._("Month to date"),
		mtd_headline(mtd, prev, delta),
		value=mtd,
		compare=prev,
		delta_pct=None if delta is None else round(delta, 4),
		delta_label=None if delta is None else chairman.pct_text(delta) + "%",
		tone=chairman.tone_for(delta),
		chart={"type": "bar", "series": series},
		status="unavailable",
		unavailable_reason="no_sales_target_doctype",
		compare_basis="same_days_last_month",
		data_quality="partial",
	)


def slide_branch_ranking(day):
	from frappe.query_builder.functions import Sum

	(mtd_start, _end), _prev = month_ranges(day)
	pi, q = _pi_query(mtd_start, day)
	rows = (
		q.select(pi.posting_date, pi.branch, Sum(pi.net_total).as_("total"))
		.groupby(pi.posting_date, pi.branch)
		.run(as_dict=True)
	)
	ranked = rank_branches(rows, day)
	return _slide(
		"branch_ranking",
		frappe._("Branch ranking"),
		branch_headline(ranked),
		value=money(sum(r["value"] for r in ranked)),
		chart={"type": "rank", "series": [{"label": r["label"], "value": r["value"]} for r in ranked]},
		branches=ranked,
		branch_count=len(ranked),
	)


def slide_top_bottom_items(day):
	from frappe.query_builder.functions import Sum

	start = day - timedelta(days=WINDOW_DAYS - 1)
	pi, q = _pi_query(start, day)
	pii = frappe.qb.DocType("POS Invoice Item")
	rows = (
		q.join(pii)
		.on(pii.parent == pi.name)
		.where(pii.parenttype == "POS Invoice")
		.where(pi.is_return == 0)
		.where(pii.qty > 0)
		.select(
			pii.item_code,
			pii.item_name,
			Sum(pii.net_amount).as_("total"),
			Sum(pii.qty).as_("qty"),
		)
		.groupby(pii.item_code, pii.item_name)
		.run(as_dict=True)
	)
	top, bottom = split_top_bottom(rows)
	return _slide(
		"top_bottom_items",
		frappe._("Top and bottom items (7 days)"),
		items_headline(top, bottom),
		value=money(sum(i["value"] for i in top)),
		chart={"type": "bar", "series": [{"label": i["label"], "value": i["value"]} for i in top + bottom]},
		top=top,
		bottom=bottom,
		item_count=len(rows),
	)


def slide_leakage(day):
	from frappe.query_builder.functions import Count, Sum

	start = day - timedelta(days=WINDOW_DAYS - 1)
	pi, cq = _pi_query(start, day, docstatus=2)
	cancelled = (
		cq.select(pi.cancel_reason, Count(pi.name).as_("n"), Sum(pi.net_total).as_("total"))
		.groupby(pi.cancel_reason)
		.run(as_dict=True)
	)
	cancel_count = sum(int(r["n"] or 0) for r in cancelled)
	cancel_value = money(sum(abs(float(r["total"] or 0)) for r in cancelled))

	pi2, dq = _pi_query(start, day)
	disc = (
		dq.where(pi2.is_return == 0)
		.select(
			Sum(pi2.discount_amount).as_("discount"),
			Sum(pi2.net_total).as_("net"),
		)
		.run(as_dict=True)
	)
	discount_value = money(disc[0]["discount"]) if disc else 0.0
	net_sales = money(disc[0]["net"]) if disc else 0.0
	reason = top_reason(cancelled)
	series = [
		{"label": (r["cancel_reason"] or "").strip() or UNSPECIFIED, "value": money(abs(float(r["total"] or 0)))}
		for r in sorted(cancelled, key=lambda r: (-abs(float(r["total"] or 0)), r["cancel_reason"] or ""))
	]
	if discount_value:
		series.append({"label": frappe._("Discounts"), "value": discount_value})
	return _slide(
		"leakage",
		frappe._("Cancellations and discounts (7 days)"),
		leakage_headline(cancel_count, cancel_value, discount_value, reason),
		value=money(cancel_value + discount_value),
		tone=leakage_tone(cancel_value, discount_value, net_sales),
		chart={"type": "bar", "series": series},
		cancellations={"count": cancel_count, "value": cancel_value, "top_reason": reason},
		discounts={"value": discount_value},
	)


def slide_kitchen(day):
	kot = frappe.qb.DocType("URY KOT")
	q = (
		frappe.qb.from_(kot)
		.where(kot.docstatus == 1)
		.where(kot.date == day)
		.where(kot.order_status == "Served")
	)
	chairman = _chairman()
	allowed = chairman._allowed("Branch")
	if allowed is not None:
		q = q.where(kot.branch.isin(allowed)) if allowed else q.where(kot.docstatus == -99)
	rows = q.select(kot.production_time).run(as_dict=True)
	count, avg, p90 = kitchen_summary([r["production_time"] for r in rows])
	return _slide(
		"kitchen",
		frappe._("Kitchen speed"),
		kitchen_headline(count, avg, p90),
		value=avg,
		value_text=None if avg is None else "{0} min".format(avg),
		tone=kitchen_tone(count, p90),
		chart={
			"type": "bar",
			"series": []
			if not count
			else [
				{"label": frappe._("Average"), "value": avg, "value_text": "{0} min".format(avg)},
				{"label": frappe._("Slowest 10%"), "value": p90, "value_text": "{0} min".format(p90)},
			],
		},
		basis="kot_minutes",
		tickets=count,
		avg_minutes=avg,
		p90_minutes=p90,
		data_quality="ok" if count else "partial",
	)


def slide_covers(day):
	pi, q = _pi_query(day, day)
	rows = (
		q.where(pi.is_return == 0)
		.where(pi.order_type == "Dine In")
		.where(pi.status != "Consolidated")
		.select(pi.no_of_pax.as_("pax"), pi.net_total)
		.run(as_dict=True)
	)
	bills, covers, net, spend = covers_summary(rows)
	return _slide(
		"covers",
		frappe._("Covers"),
		covers_headline(covers, spend),
		value=covers,
		value_text=str(covers),
		chart={
			"type": "bar",
			"series": []
			if not covers
			else [
				{"label": frappe._("Covers"), "value": covers, "value_text": str(covers)},
				{"label": frappe._("Spend per cover"), "value": spend, "value_text": _chairman().format_inr_compact(spend)},
			],
		},
		basis="covers",
		bills=bills,
		covers=covers,
		spend_per_cover=spend,
		data_quality="ok" if covers else "partial",
	)


def slide_cashup(day):
	from frappe.query_builder.functions import IfNull

	start = day - timedelta(days=WINDOW_DAYS - 1)
	pce = frappe.qb.DocType("POS Closing Entry")
	ped = frappe.qb.DocType("POS Closing Entry Detail")
	prof = frappe.qb.DocType("POS Profile")
	q = (
		frappe.qb.from_(pce)
		.left_join(prof)
		.on(prof.name == pce.pos_profile)
		.join(ped)
		.on(ped.parent == pce.name)
		.where(ped.parenttype == "POS Closing Entry")
		.where(pce.docstatus == 1)
		.where(pce.posting_date >= start)
		.where(pce.posting_date <= day)
	)
	# POS Closing Entry.branch is null on legacy rows: fall back to the POS Profile's branch.
	q = _scope(q, pce.company, IfNull(pce.branch, prof.branch), pce.docstatus)
	rows = q.select(ped.difference).run(as_dict=True)
	entries, exceptions, abs_total, net_total = cashup_summary(rows)
	return _slide(
		"cashup",
		frappe._("Cash-up (7 days)"),
		cashup_headline(entries, exceptions, abs_total),
		value=abs_total,
		tone=cashup_tone(entries, exceptions),
		chart={
			"type": "bar",
			"series": [
				{"label": frappe._("Balanced"), "value": entries - exceptions},
				{"label": frappe._("Off"), "value": exceptions},
			],
		},
		basis="cash_difference",
		entries=entries,
		exceptions=exceptions,
		net_difference=net_total,
		data_quality="ok" if entries else "partial",
	)


BUILDERS = {
	"mtd_target": slide_mtd_target,
	"branch_ranking": slide_branch_ranking,
	"top_bottom_items": slide_top_bottom_items,
	"leakage": slide_leakage,
	"kitchen": slide_kitchen,
	"cashup": slide_cashup,
	"covers": slide_covers,
}


def build_slides(day):
	"""All seven P1 slides for business day `day` (a date), in plan order 2, 3, 5, 7, 8, 9, 10."""
	return [BUILDERS[sid](day) for sid in SLIDE_IDS]

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
"""Chairman chat visual cards (schema v1): kpi, bar, line, table; plus v2 dashboard (panels of v1 cards).

Pure module: no frappe import, no DB. Builders turn the dict a chairman tool returned into a
card; validate_card() is the single gate that every card passes through before it leaves the
server. The LLM never writes card JSON.

Text is cleaned the same way as chairman_tools.clean_text (control characters stripped,
whitespace collapsed, truncated); HTML tags are additionally removed because cards are data
for a renderer, not markup.
"""

import math
import re

SCHEMA_VERSION = 1
CARD_TYPES = ("kpi", "bar", "line", "table")
FMTS = ("money", "int", "pct", "mins")
MAX_CARDS = 3
MAX_KPIS = 4
MAX_POINTS = 12
MAX_ROWS = 8
MAX_COLS = 4
LIMITS = {"title": 60, "subtitle": 80, "label": 24, "cell": 40, "col": 24, "link_label": 40}
NUM_MAX = 1e15
TRENDS = ("up", "down", "flat")
TONES = ("good", "bad", "neutral")
FLAT_BELOW = 0.005  # |delta| < 0.5% is flat
DASHBOARD_VERSION = 2
MIN_PANELS, MAX_PANELS, MAX_ROWS_DASH = 2, 6, 4
DASH_LIMITS = {"title": 60, "subtitle": 90, "subtext": 100, "footnote": 140, "caption": 120}
HALF_MAX_KPIS, HALF_MAX_POINTS = 2, 5

# Same character class as chairman_tools._CONTROL_CHARS.
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f-\x9f  ]+")
_TAGS = re.compile(r"<[^>]*>?")
LINK_PATTERN = re.compile(r"^(/insights/dashboards/[a-z0-9]+|/app/[a-z0-9][a-z0-9\-/]*)$")


def clean_text(value, limit=80):
	"""Same behaviour as chairman_tools.clean_text, plus tag and angle-bracket removal."""
	if value is None:
		return ""
	text = _CONTROL_CHARS.sub(" ", str(value))
	text = _TAGS.sub(" ", text).replace("<", " ").replace(">", " ")
	text = " ".join(text.split())
	return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _num(value):
	"""Finite float within bounds, else None. Booleans and strings are rejected."""
	if isinstance(value, bool) or not isinstance(value, (int, float)):
		return None
	v = float(value)
	if not math.isfinite(v) or abs(v) > NUM_MAX:
		return None
	return round(v, 4)


def _raw(v):
	"""Unwrap a tool amount {"value", "text"}."""
	if isinstance(v, dict):
		return v.get("value")
	return v


def _link(link):
	# Documented shape is {"label", "url"}; a bare url string (what analytics_env.dashboard_url
	# returns) is accepted and normalised to it. Anything else, or None, means no link.
	if isinstance(link, str):
		link = {"url": link}
	if not isinstance(link, dict):
		return None
	url = link.get("url")
	if not isinstance(url, str) or not LINK_PATTERN.match(url) or ".." in url:
		return None
	label = clean_text(link.get("label") or "Open dashboard", LIMITS["link_label"]) or "Open dashboard"
	return {"label": label, "url": url}


def trend_for(delta):
	"""'up'|'down'|'flat' from a delta fraction; None when there is no delta."""
	d = _num(delta)
	if d is None:
		return None
	return "flat" if abs(d) < FLAT_BELOW else ("up" if d > 0 else "down")


def tone_for(delta, lower_is_better=False):
	"""Server-side tone for a preset KPI: good/bad by metric polarity, neutral when flat or no delta."""
	trend = trend_for(delta)
	if trend in (None, "flat"):
		return "neutral"
	return "good" if (trend == "up") != bool(lower_is_better) else "bad"


def validate_card(card):
	"""Return a sanitised copy of the card, or None when it is invalid or empty.

	A v2 dashboard card is re-validated through validate_dashboard (its panels carry the v1 cards)."""
	if isinstance(card, dict) and card.get("type") == "dashboard":
		try:
			return validate_dashboard(card, None)
		except ValueError:
			return None
	if not isinstance(card, dict) or card.get("type") not in CARD_TYPES:
		return None
	ctype = card["type"]
	out = {
		"v": SCHEMA_VERSION,
		"type": ctype,
		"title": clean_text(card.get("title"), LIMITS["title"]),
		"subtitle": clean_text(card.get("subtitle"), LIMITS["subtitle"]),
		"link": _link(card.get("link")),
	}
	if card.get("ai_composed") is True:  # optional flag: card was composed by the agent, not a preset
		out["ai_composed"] = True
	if card.get("good_direction") in ("up", "down"):
		# optional: which direction of a line/bar is good ("up" is the renderer default). Colours the line's
		# peak/trough labels and (only when set explicitly) the best/worst bar. Set by preset builders for
		# lower-is-better metrics (cancellations, discounts, leakage, kitchen minutes).
		out["good_direction"] = card["good_direction"]
	if not out["title"]:
		return None
	if ctype == "kpi":
		kpis = []
		for k in (card.get("kpis") or [])[:MAX_KPIS]:
			if not isinstance(k, dict):
				continue
			value, label = _num(k.get("value")), clean_text(k.get("label"), LIMITS["label"])
			if value is None or not label:
				continue
			fmt = k.get("fmt") if k.get("fmt") in FMTS else "int"
			delta = _num(k.get("delta"))
			trend = trend_for(delta)
			tone = k.get("tone") if k.get("tone") in TONES else "neutral"
			if card.get("ai_composed") is True or trend is None:
				tone = "neutral"  # composed KPIs and KPIs without a delta are never coloured
			kpis.append({"label": label, "value": value, "fmt": fmt, "delta": delta, "trend": trend, "tone": tone})
		if not kpis:
			return None
		out["kpis"] = kpis
	elif ctype in ("bar", "line"):
		series = []
		for p in (card.get("series") or [])[:MAX_POINTS]:
			if not isinstance(p, dict):
				continue
			value, label = _num(p.get("value")), clean_text(p.get("label"), LIMITS["label"])
			if value is None or not label:
				continue
			series.append({"label": label, "value": value})
		if len(series) < (2 if ctype == "line" else 1):
			return None
		out["series"] = series
		if card.get("fmt") in FMTS:
			out["fmt"] = card["fmt"]
	else:
		cols = [clean_text(c, LIMITS["col"]) for c in (card.get("cols") or [])[:MAX_COLS]]
		rows = []
		for r in (card.get("rows") or [])[:MAX_ROWS]:
			if not isinstance(r, (list, tuple)):
				continue
			row = []
			for c in list(r)[: len(cols) or MAX_COLS]:
				if isinstance(c, (int, float)) and not isinstance(c, bool):
					n = _num(c)
					row.append(n if n is not None else "")
				else:
					row.append(clean_text(c, LIMITS["cell"]))
			if row:
				rows.append(row)
		if not rows:
			return None
		out["cols"] = cols
		out["rows"] = rows
	return out


def limit_cards(cards, limit=MAX_CARDS):
	"""Validate, drop invalid, dedupe by (type, title), keep at most `limit`."""
	seen, out = set(), []
	for c in cards or []:
		v = validate_card(c)
		if v is None:
			continue
		key = (v["type"], v["title"])
		if key in seen:
			continue
		seen.add(key)
		out.append(v)
		if len(out) >= limit:
			break
	return out


# ---------------------------------------------------------------- v2 dashboard


def assign_card_ids(cards):
	"""Stable short ids in order: {'c1': card, 'c2': card, ...}. Cards are not copied or changed."""
	return {"c%d" % i: c for i, c in enumerate(cards or [], 1)}


def _natural_span(card):
	if card["type"] == "kpi" and len(card["kpis"]) <= HALF_MAX_KPIS:
		return 1
	if card["type"] == "bar" and len(card["series"]) <= HALF_MAX_POINTS:
		return 1
	return 2


def _dash_text(spec, key):
	return clean_text(spec.get(key), DASH_LIMITS[key])


def validate_dashboard(card_or_spec, available_cards):
	"""Build one sanitised v2 dashboard card. Raises ValueError (never drops data silently).

	Input is either a spec {title, subtitle?, subtext?, footnote?, columns?: 1|2|'1'|'2',
	card_ids: [id], captions?: [str]} (or panels: [{id, span?, title?, subtitle?, caption?}]) resolved
	against `available_cards` ({id: card} or a list of cards, ids by assign_card_ids), or an existing
	v2 dashboard whose panels carry their cards (re-validation)."""
	if not isinstance(card_or_spec, dict):
		raise ValueError("dashboard must be an object")
	spec = card_or_spec
	if isinstance(available_cards, (list, tuple)):
		available_cards = assign_card_ids(available_cards)
	available = dict(available_cards or {})
	raw = spec.get("panels")
	if raw is None:
		ids, caps = spec.get("card_ids"), spec.get("captions")
		if not isinstance(ids, (list, tuple)):
			raise ValueError("card_ids must be a list")
		if caps is not None and (not isinstance(caps, (list, tuple)) or len(caps) != len(ids)):
			raise ValueError("captions must match card_ids")
		raw = [{"id": i, "caption": caps[n] if caps else None} for n, i in enumerate(ids)]
	elif not isinstance(raw, (list, tuple)):
		raise ValueError("panels must be a list")
	if not MIN_PANELS <= len(raw) <= MAX_PANELS:
		raise ValueError("a dashboard needs %d to %d panels" % (MIN_PANELS, MAX_PANELS))
	one_col = str(spec.get("columns")) == "1"

	panels, seen = [], set()
	for p in raw:
		p = p if isinstance(p, dict) else {"id": p}
		pid = p.get("id")
		if not isinstance(pid, str) or not pid:
			raise ValueError("panel id missing")
		if pid in seen:
			raise ValueError("duplicate card id %s" % pid)
		seen.add(pid)
		source = p.get("card") if isinstance(p.get("card"), dict) else available.get(pid)
		if source is None:
			raise ValueError("unknown card id %s" % pid)
		if isinstance(source, dict) and source.get("type") == "dashboard":
			raise ValueError("card %s is a dashboard; dashboards cannot be nested" % pid)
		inner = validate_card(source)
		if inner is None:
			raise ValueError("card %s is not a valid card" % pid)
		want = p.get("span")
		if want is None and str(spec.get("columns")) == "2":
			want = 1  # columns=2 pairs the panels that are small enough; the repair below widens unpaired ones
		span = 1 if (want == 1 and not one_col and _natural_span(inner) == 1) else 2
		panel = {"card": inner, "id": pid, "composed": inner.get("ai_composed") is True, "span": span}
		for key, lim in (("title", "title"), ("subtitle", "subtitle"), ("caption", "caption")):
			t = clean_text(p.get(key), DASH_LIMITS[lim])
			if t:
				panel[key] = t
		panels.append(panel)

	# Layout repair: pack in order; a lone half-width panel is widened. Row cap is an error.
	rows, i = 0, 0
	while i < len(panels):
		if panels[i]["span"] == 1 and i + 1 < len(panels) and panels[i + 1]["span"] == 1:
			i += 2
		else:
			panels[i]["span"] = 2
			i += 1
		rows += 1
	if rows > MAX_ROWS_DASH:
		raise ValueError("dashboard needs %d rows after packing; the maximum is %d" % (rows, MAX_ROWS_DASH))

	title = _dash_text(spec, "title")
	if not title:
		raise ValueError("title is required")
	return {
		"v": DASHBOARD_VERSION,
		"type": "dashboard",
		"title": title,
		"subtitle": _dash_text(spec, "subtitle"),
		"subtext": _dash_text(spec, "subtext"),
		"footnote": _dash_text(spec, "footnote"),
		"ai_composed": True,
		"panels": panels,
	}


# ---------------------------------------------------------------- builders


def _delta(pct):
	"""Percent (e.g. 12.5) -> fraction (0.125); None when not numeric."""
	n = _num(pct)
	return None if n is None else round(n / 100, 4)


def _item(label, value, fmt, delta=None, lower_is_better=False):
	"""KPI item with server-derived trend/tone. Polarity is decided here, in the preset builders only."""
	return {"label": label, "value": value, "fmt": fmt, "delta": delta,
		"trend": trend_for(delta), "tone": tone_for(delta, lower_is_better)}


def _kpi(title, kpis, subtitle="", link=None, good_direction=None):
	c = {"type": "kpi", "title": title, "subtitle": subtitle, "kpis": kpis, "link": link}
	if good_direction:
		c["good_direction"] = good_direction
	return c


def _bar(title, series, subtitle="", link=None, fmt="money", good_direction=None):
	c = {"type": "bar", "title": title, "subtitle": subtitle, "series": series, "link": link, "fmt": fmt}
	if good_direction:
		c["good_direction"] = good_direction
	return c


def _period(result):
	s, e = result.get("start_date"), result.get("end_date")
	if s and e:
		return s if s == e else "{0} to {1}".format(s, e)
	return result.get("date") or ""


def _ok(result):
	return isinstance(result, dict) and result.get("status", "ok") == "ok"


def card_for_get_day_summary(result, link=None):
	if not _ok(result):
		return []
	kpis = []
	if _num(_raw(result.get("value"))) is not None:
		kpis.append(_item("Net sales", _raw(result["value"]), "money", _delta(result.get("delta_pct"))))
	if _num(result.get("orders")) is not None:
		kpis.append({"label": "Orders", "value": result["orders"], "fmt": "int", "delta": None})
	if _num(_raw(result.get("compare"))) is not None:
		kpis.append({"label": result.get("compare_label") or "Compared", "value": _raw(result["compare"]), "fmt": "money", "delta": None})
	return [_kpi("Day sales", kpis, _period(result), link)] if kpis else []


def card_for_get_month_to_date(result, link=None):
	if not _ok(result):
		return []
	kpis = []
	if _num(_raw(result.get("value"))) is not None:
		kpis.append(_item("Month to date", _raw(result["value"]), "money", _delta(result.get("delta_pct"))))
	if _num(_raw(result.get("compare"))) is not None:
		kpis.append({"label": result.get("compare_label") or "Last month", "value": _raw(result["compare"]), "fmt": "money", "delta": None})
	return [_kpi("Month to date", kpis, _period(result), link)] if kpis else []


def card_for_get_branch_ranking(result, link=None):
	if not _ok(result):
		return []
	series = [{"label": b.get("branch"), "value": _raw(b.get("day"))} for b in result.get("branches") or []]
	return [_bar("Branches by sales", series, _period(result), link)] if series else []


def card_for_get_leakage_week(result, link=None):
	if not _ok(result):
		return []
	kpis = []
	c = result.get("cancellations") or {}
	if _num(c.get("count")) is not None:
		kpis.append(_item("Cancellations", c["count"], "int", lower_is_better=True))
	if _num(_raw(c.get("value"))) is not None:
		kpis.append(_item("Cancelled value", _raw(c["value"]), "money", lower_is_better=True))
	d = result.get("discounts") or {}
	if _num(_raw(d.get("value"))) is not None:
		kpis.append(_item("Discounts", _raw(d["value"]), "money", lower_is_better=True))
	return [_kpi("Leakage, last 7 days", kpis, _period(result), link, "down")] if kpis else []


def card_for_get_cashup_week(result, link=None):
	if not _ok(result):
		return []
	kpis = []
	for key, label in (("entries", "Closings"), ("exceptions", "Off")):
		if _num(result.get(key)) is not None:
			kpis.append({"label": label, "value": result[key], "fmt": "int", "delta": None})
	if _num(_raw(result.get("net_difference"))) is not None:
		kpis.append({"label": "Net difference", "value": _raw(result["net_difference"]), "fmt": "money", "delta": None})
	return [_kpi("Cash-up, last 7 days", kpis, _period(result), link)] if kpis else []


def card_for_get_sales_range(result, link=None):
	if not isinstance(result, dict):
		return []
	cards = []
	kpis = []
	if _num(_raw(result.get("net_sales"))) is not None:
		kpis.append({"label": "Net sales", "value": _raw(result["net_sales"]), "fmt": "money", "delta": None})
	if _num(result.get("orders")) is not None:
		kpis.append({"label": "Orders", "value": result["orders"], "fmt": "int", "delta": None})
	if _num(_raw(result.get("avg_order_value"))) is not None:
		kpis.append({"label": "Avg order", "value": _raw(result["avg_order_value"]), "fmt": "money", "delta": None})
	if kpis:
		cards.append(_kpi("Sales", kpis, _period(result), link))
	daily = result.get("daily") or []
	if len(daily) >= 2:
		series = [{"label": str(d.get("date"))[-5:], "value": d.get("net")} for d in daily]
		if len(series) > MAX_POINTS:  # keep the most recent points
			series = series[-MAX_POINTS:]
		cards.append({"type": "line", "title": "Daily net sales", "subtitle": _period(result), "series": series, "link": None, "fmt": "money"})
	return cards


def card_for_get_top_bottom_dishes(result, link=None):
	if not isinstance(result, dict):
		return []
	cards = []
	for key, title in (("top", "Top dishes"), ("bottom", "Weakest dishes")):
		rows = [[d.get("dish"), _raw(d.get("net_sales")), d.get("qty")] for d in result.get(key) or []]
		if rows:
			cards.append({"type": "table", "title": title, "subtitle": _period(result), "cols": ["Dish", "Sales", "Qty"], "rows": rows, "link": link if key == "top" else None})
	return cards


def _mix_bar(title, block, result, link=None):
	series = [{"label": s.get("label"), "value": s.get("value")} for s in (block or {}).get("series") or []]
	return _bar(title, series, _period(result), link) if series else None


def card_for_get_order_type_and_payment_mix(result, link=None):
	if not isinstance(result, dict):
		return []
	cards = [
		_mix_bar("Sales by order type", result.get("order_types"), result, link),
		_mix_bar("Payments received", result.get("payments"), result),
	]
	return [c for c in cards if c]


def card_for_get_cancellations(result, link=None):
	if not isinstance(result, dict):
		return []
	cards = []
	kpis = []
	if _num(result.get("count")) is not None:
		kpis.append(_item("Cancellations", result["count"], "int", lower_is_better=True))
	if _num(_raw(result.get("value"))) is not None:
		kpis.append(_item("Cancelled value", _raw(result["value"]), "money", lower_is_better=True))
	if kpis:
		cards.append(_kpi("Cancellations", kpis, _period(result), link, "down"))
	rows = [[r.get("label"), r.get("value"), r.get("count")] for r in result.get("by_reason") or []]
	if rows:
		cards.append({"type": "table", "title": "By reason", "subtitle": _period(result), "cols": ["Reason", "Value", "Count"], "rows": rows, "link": None})
	return cards


def card_for_get_kitchen_speed(result, link=None):
	if not isinstance(result, dict):
		return []
	kpis = []
	for key, label in (
		("avg_minutes_order_to_served", "Avg to served"),
		("median_minutes_order_to_served", "Median to served"),
		("slowest_minutes_order_to_served", "Slowest"),
		("avg_minutes_order_to_prep_start", "Avg to prep"),
	):
		if _num(result.get(key)) is not None:
			kpis.append(_item(label, result[key], "mins", lower_is_better=True))
	return [_kpi("Kitchen speed", kpis, _period(result), link, "down")] if kpis else []


def card_for_get_ideas_context(result, link=None):
	"""Facts only: a sales KPI card and the order-type mix."""
	if not isinstance(result, dict):
		return []
	kpis = []
	if _num(_raw(result.get("net_sales"))) is not None:
		kpis.append({"label": "Net sales", "value": _raw(result["net_sales"]), "fmt": "money", "delta": None})
	if _num(result.get("orders")) is not None:
		kpis.append({"label": "Orders", "value": result["orders"], "fmt": "int", "delta": None})
	if _num(_raw(result.get("avg_order_value"))) is not None:
		kpis.append({"label": "Avg order", "value": _raw(result["avg_order_value"]), "fmt": "money", "delta": None})
	cards = [_kpi("Sales snapshot", kpis, _period(result), link)] if kpis else []
	series = [{"label": s.get("label"), "value": s.get("value")} for s in result.get("order_types") or []]
	if series:
		cards.append(_bar("Sales by order type", series, _period(result)))
	return cards


BUILDERS = {
	"get_day_summary": card_for_get_day_summary,
	"get_month_to_date": card_for_get_month_to_date,
	"get_branch_ranking": card_for_get_branch_ranking,
	"get_leakage_week": card_for_get_leakage_week,
	"get_cashup_week": card_for_get_cashup_week,
	"get_sales_range": card_for_get_sales_range,
	"get_top_bottom_dishes": card_for_get_top_bottom_dishes,
	"get_order_type_and_payment_mix": card_for_get_order_type_and_payment_mix,
	"get_cancellations": card_for_get_cancellations,
	"get_kitchen_speed": card_for_get_kitchen_speed,
	"get_ideas_context": card_for_get_ideas_context,
}


def cards_for(tool_name, result, link=None, limit=MAX_CARDS):
	"""Validated cards (max `limit`) for a tool result. Never raises on odd shapes."""
	builder = BUILDERS.get(tool_name)
	if not builder:
		return []
	try:
		return limit_cards(builder(result, link=link), limit)
	except Exception:
		return []

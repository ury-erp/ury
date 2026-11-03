# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# Pure unit tests (no Frappe): python3 -m unittest test_chairman_cards  (from this directory)

import json
import math
import random
import unittest

try:
	from ury.ury.api import chairman_cards as cc
except ImportError:
	import chairman_cards as cc


def amt(v):
	return {"value": v, "text": str(v)}


class ValidateTests(unittest.TestCase):
	def test_html_stripped_and_truncated(self):
		c = cc.validate_card({"type": "kpi", "title": "<script>alert(1)</script>Sales\x00\n" + "x" * 200,
			"kpis": [{"label": "<b>Net</b>", "value": 1}]})
		self.assertNotIn("<", json.dumps(c))
		self.assertLessEqual(len(c["title"]), 60)
		self.assertEqual(c["kpis"][0]["label"], "Net")

	def test_rejects_nan_inf_bool_and_strings(self):
		for bad in (float("nan"), float("inf"), True, "12", None, 1e30):
			self.assertIsNone(cc.validate_card({"type": "kpi", "title": "t", "kpis": [{"label": "a", "value": bad}]}))

	def test_unknown_type_and_non_dict(self):
		for bad in (None, [], "x", {"type": "pie", "title": "t"}, {"title": "t"}):
			self.assertIsNone(cc.validate_card(bad))

	def test_caps(self):
		pts = [{"label": "p%d" % i, "value": i} for i in range(50)]
		self.assertEqual(len(cc.validate_card({"type": "bar", "title": "t", "series": pts})["series"]), 12)
		kp = [{"label": "k%d" % i, "value": i} for i in range(9)]
		self.assertEqual(len(cc.validate_card({"type": "kpi", "title": "t", "kpis": kp})["kpis"]), 4)
		rows = [["r", i] for i in range(30)]
		self.assertEqual(len(cc.validate_card({"type": "table", "title": "t", "cols": ["a", "b"], "rows": rows})["rows"]), 8)

	def test_links(self):
		ok = {"type": "bar", "title": "t", "series": [{"label": "a", "value": 1}]}
		good = cc.validate_card({**ok, "link": {"label": "Open", "url": "/insights/dashboards/58aq35af28"}})
		self.assertEqual(good["link"]["url"], "/insights/dashboards/58aq35af28")
		for url in ("https://evil.com/x", "//evil.com", "javascript:alert(1)", "/insights/dashboards/A B",
				"/insights/dashboards/x/../../y", "/insights/dashboards/", "/app/../etc", "data:text/html,x", None, 5):
			self.assertIsNone(cc.validate_card({**ok, "link": {"label": "x", "url": url}})["link"], url)
		self.assertEqual(cc.validate_card({**ok, "link": {"url": "/app/sales-invoice"}})["link"]["url"], "/app/sales-invoice")

	def test_good_direction_only_up_or_down(self):
		line = {"type": "line", "title": "t", "series": [{"label": "a", "value": 1}, {"label": "b", "value": 2}]}
		self.assertEqual(cc.validate_card({**line, "good_direction": "down"})["good_direction"], "down")
		self.assertEqual(cc.validate_card({**line, "good_direction": "up"})["good_direction"], "up")
		for bad in ("sideways", None, 1, ["up"]):
			self.assertNotIn("good_direction", cc.validate_card({**line, "good_direction": bad}))

	def test_line_needs_two_points(self):
		self.assertIsNone(cc.validate_card({"type": "line", "title": "t", "series": [{"label": "a", "value": 1}]}))

	def test_fuzz_hostile_never_raises_and_output_is_clean(self):
		rnd = random.Random(7)
		pool = ["<img src=x onerror=1>", " ", "\x1b[31m", "{{7*7}}", "'; DROP", "<", ">", "&lt;", "a" * 500, "", "؀ക"]
		vals = [float("nan"), float("-inf"), 1e99, -5, 0, 3.14159, True, None, "z", [], {}]
		for _ in range(300):
			card = {
				"type": rnd.choice(list(cc.CARD_TYPES) + ["x"]),
				"title": rnd.choice(pool), "subtitle": rnd.choice(pool),
				"kpis": [{"label": rnd.choice(pool), "value": rnd.choice(vals), "fmt": rnd.choice(pool)} for _ in range(6)],
				"series": [{"label": rnd.choice(pool), "value": rnd.choice(vals)} for _ in range(15)],
				"cols": [rnd.choice(pool) for _ in range(6)],
				"rows": [[rnd.choice(pool), rnd.choice(vals), rnd.choice(pool)] for _ in range(12)],
				"link": {"label": rnd.choice(pool), "url": rnd.choice(pool)},
			}
			v = cc.validate_card(card)
			if v is None:
				continue
			s = json.dumps(v, allow_nan=False)  # raises on NaN/inf
			self.assertNotIn("<", s)
			self.assertNotIn("\x1b", s)
			self.assertLessEqual(len(v["title"]), 60)

	def test_limit_cards_dedupes_and_caps(self):
		c = lambda t: {"type": "bar", "title": t, "series": [{"label": "a", "value": 1}]}
		out = cc.limit_cards([c("a"), c("a"), {"type": "bad"}, c("b"), c("c"), c("d")])
		self.assertEqual([x["title"] for x in out], ["a", "b", "c"])


class AiComposedTests(unittest.TestCase):
	base = {"type": "bar", "title": "T", "series": [{"label": "a", "value": 1}]}

	def test_flag_kept_only_when_true(self):
		self.assertIs(cc.validate_card({**self.base, "ai_composed": True})["ai_composed"], True)
		for v in (False, None, 1, "yes"):
			self.assertNotIn("ai_composed", cc.validate_card({**self.base, "ai_composed": v}))
		self.assertNotIn("ai_composed", cc.validate_card(self.base))

	def test_flag_survives_limit_cards(self):
		self.assertTrue(cc.limit_cards([{**self.base, "ai_composed": True}])[0]["ai_composed"])


class LinkShapeTests(unittest.TestCase):
	OK = {"type": "bar", "title": "t", "series": [{"label": "a", "value": 1}]}

	def test_bare_url_string_is_normalised(self):
		# regression: cards_for(..., link="/insights/dashboards/<id>") used to give link None
		cards = cc.cards_for("get_branch_ranking", {"branches": [{"branch": "A", "day": {"value": 5}}]},
			link="/insights/dashboards/58aq35af28")
		self.assertEqual(cards[0]["link"], {"label": "Open dashboard", "url": "/insights/dashboards/58aq35af28"})
		self.assertEqual(cc.validate_card({**self.OK, "link": "/app/sales-invoice"})["link"]["url"], "/app/sales-invoice")

	def test_bad_or_missing_links_are_null(self):
		for bad in (None, "", "https://evil.test/x", "/insights/dashboards/../x", 5, ["/app/x"]):
			self.assertIsNone(cc.validate_card({**self.OK, "link": bad})["link"], bad)


class BuilderTests(unittest.TestCase):
	LINK = {"label": "Open dashboard", "url": "/insights/dashboards/abc123"}

	def check(self, tool, result, types):
		cards = cc.cards_for(tool, result, link=self.LINK)
		self.assertEqual([c["type"] for c in cards], types)
		self.assertLessEqual(len(cards), 3)
		json.dumps(cards, allow_nan=False)
		return cards

	def test_day_summary(self):
		r = {"headline": "h", "status": "ok", "value": amt(1000), "compare": amt(900), "delta_pct": 11.1,
			"compare_label": "vs last Mon", "orders": 40, "date": "2026-11-02"}
		c = self.check("get_day_summary", r, ["kpi"])[0]
		self.assertEqual(c["kpis"][0]["delta"], 0.111)
		self.assertEqual(c["link"]["url"], self.LINK["url"])

	def test_unavailable_slide_gives_no_card(self):
		self.check("get_day_summary", {"status": "unavailable", "value": None}, [])

	def test_month_to_date(self):
		self.check("get_month_to_date", {"status": "ok", "value": amt(5), "compare": amt(4), "delta_pct": 25, "date": "2026-11-02"}, ["kpi"])

	def test_branch_ranking(self):
		r = {"status": "ok", "date": "2026-11-02", "branches": [{"branch": "A", "day": amt(10), "month_to_date": amt(100)}]}
		self.check("get_branch_ranking", r, ["bar"])

	def test_leakage(self):
		r = {"status": "ok", "cancellations": {"count": 3, "value": 400.0, "top_reason": "x"}, "discounts": {"value": 50}, "date": "2026-11-02"}
		c = self.check("get_leakage_week", r, ["kpi"])[0]
		self.assertEqual(len(c["kpis"]), 3)

	def test_cashup(self):
		self.check("get_cashup_week", {"status": "ok", "entries": 7, "exceptions": 1, "net_difference": amt(-20), "date": "2026-11-02"}, ["kpi"])

	def test_sales_range_kpi_and_line(self):
		daily = [{"date": "2026-10-%02d" % d, "net": d * 10.0, "orders": d} for d in range(1, 21)]
		r = {"start_date": "2026-10-01", "end_date": "2026-10-20", "net_sales": amt(100), "orders": 5, "avg_order_value": amt(20), "daily": daily}
		cards = self.check("get_sales_range", r, ["kpi", "line"])
		self.assertEqual(len(cards[1]["series"]), 12)
		self.assertEqual(cards[1]["series"][-1]["label"], "10-20")

	def test_dishes(self):
		r = {"start_date": "a", "end_date": "b", "top": [{"dish": "Biryani", "net_sales": amt(5), "qty": 2}], "bottom": [{"dish": "Soup", "net_sales": amt(1), "qty": 1}]}
		cards = self.check("get_top_bottom_dishes", r, ["table", "table"])
		self.assertEqual(cards[0]["rows"][0], ["Biryani", 5.0, 2.0])

	def test_mix(self):
		s = [{"label": "Cash", "value": 5.0, "value_text": "5", "share_pct": 100.0}]
		r = {"start_date": "a", "end_date": "a", "order_types": {"series": s}, "payments": {"series": s}}
		self.check("get_order_type_and_payment_mix", r, ["bar", "bar"])

	def test_cancellations(self):
		r = {"start_date": "a", "end_date": "b", "count": 2, "value": amt(10), "by_reason": [{"label": "<i>x</i>", "value": 10.0, "count": 2}]}
		cards = self.check("get_cancellations", r, ["kpi", "table"])
		self.assertEqual(cards[1]["rows"][0][0], "x")

	def test_kitchen(self):
		r = {"start_date": "a", "end_date": "b", "avg_minutes_order_to_served": 12.5, "median_minutes_order_to_served": None}
		self.check("get_kitchen_speed", r, ["kpi"])
		self.check("get_kitchen_speed", {"avg_minutes_order_to_served": None}, [])

	def test_ideas_context(self):
		r = {"start_date": "a", "end_date": "b", "net_sales": amt(9), "orders": 3, "avg_order_value": None,
			"order_types": [{"label": "Dine In", "value": 9.0}]}
		self.check("get_ideas_context", r, ["kpi", "bar"])

	def test_all_eleven_tools_covered_and_garbage_safe(self):
		self.assertEqual(len(cc.BUILDERS), 11)
		for name in cc.BUILDERS:
			for junk in (None, {}, [], "x", {"status": "ok", "branches": "bad", "daily": 5, "top": [None]}):
				self.assertIsInstance(cc.cards_for(name, junk), list)
		self.assertEqual(cc.cards_for("unknown_tool", {}), [])

	def test_nan_in_result_is_dropped(self):
		r = {"status": "ok", "value": amt(float("nan")), "orders": 2, "date": "d"}
		c = cc.cards_for("get_day_summary", r)
		self.assertEqual([k["label"] for k in c[0]["kpis"]], ["Orders"])


def _k(n=1, **kw):
	return {"type": "kpi", "title": "K", "kpis": [dict({"label": "a%d" % i, "value": i}, **kw) for i in range(n)]}


def _bar(n=3, title="B"):
	return {"type": "bar", "title": title, "series": [{"label": "p%d" % i, "value": i} for i in range(n)]}


class TrendToneTests(unittest.TestCase):
	def test_trend_threshold(self):
		self.assertEqual([cc.trend_for(x) for x in (0.1, -0.1, 0.004, -0.0049, 0.005, None)], ["up", "down", "flat", "flat", "up", None])

	def test_preset_tone_polarity(self):
		c = cc.cards_for("get_day_summary", {"status": "ok", "value": amt(10), "compare": amt(9), "delta_pct": 11, "date": "d"})
		k = c[0]["kpis"][0]
		self.assertEqual((k["trend"], k["tone"]), ("up", "good"))
		self.assertEqual(c[0]["kpis"][-1]["tone"], "neutral")
		down = cc.cards_for("get_day_summary", {"status": "ok", "value": amt(10), "delta_pct": -11, "date": "d"})[0]["kpis"][0]
		self.assertEqual((down["trend"], down["tone"]), ("down", "bad"))
		flat = cc.cards_for("get_day_summary", {"status": "ok", "value": amt(10), "delta_pct": 0.2, "date": "d"})[0]["kpis"][0]
		self.assertEqual((flat["trend"], flat["tone"]), ("flat", "neutral"))

	def test_lower_is_better(self):
		self.assertEqual(cc._item("x", 1, "int", 0.2, True)["tone"], "bad")
		self.assertEqual(cc._item("x", 1, "int", -0.2, True)["tone"], "good")
		self.assertEqual(cc._item("x", 1, "int", -0.2)["tone"], "bad")

	def test_validate_keeps_only_allowed_and_composed_is_neutral(self):
		v = cc.validate_card(_k(1, delta=0.2, tone="good"))
		self.assertEqual(v["kpis"][0]["tone"], "good")
		v = cc.validate_card(_k(1, delta=0.2, tone="<script>"))
		self.assertEqual(v["kpis"][0]["tone"], "neutral")
		c = _k(1, delta=0.2, tone="good")
		c["ai_composed"] = True
		self.assertEqual(cc.validate_card(c)["kpis"][0]["tone"], "neutral")
		self.assertEqual(cc.validate_card(_k(1, tone="good"))["kpis"][0]["tone"], "neutral")  # no delta


class DashboardTests(unittest.TestCase):
	def spec(self, **kw):
		return dict({"title": "T", "card_ids": ["c1", "c2"]}, **kw)

	def avail(self):
		return cc.assign_card_ids([_k(3), _bar(8), _k(1), _bar(3, "B2"), _k(2), _bar(2, "B3"), _k(4)])

	def test_assign_ids(self):
		self.assertEqual(list(cc.assign_card_ids([1, 2, 3])), ["c1", "c2", "c3"])

	def test_happy_path_schema(self):
		d = cc.validate_dashboard(self.spec(subtitle="s", subtext="x", footnote="f", captions=["a", ""]), self.avail())
		self.assertEqual((d["v"], d["type"], d["ai_composed"]), (2, "dashboard", True))
		self.assertEqual([p["id"] for p in d["panels"]], ["c1", "c2"])
		p = d["panels"][0]
		self.assertEqual(set(p), {"card", "id", "composed", "span", "caption"})
		self.assertEqual((p["card"]["v"], p["span"], p["composed"], p["caption"]), (1, 2, False, "a"))
		self.assertNotIn("caption", d["panels"][1])

	def test_errors(self):
		a = self.avail()
		for bad in (self.spec(card_ids=["c1"]), self.spec(card_ids=["c1", "c1"]), self.spec(card_ids=["c1", "zz"]),
				self.spec(card_ids=["c%d" % i for i in range(1, 8)]), self.spec(title=" "), self.spec(captions=["a"]), "x"):
			with self.assertRaises(ValueError):
				cc.validate_dashboard(bad, a)

	def test_no_nesting(self):
		a = self.avail()
		a["c9"] = cc.validate_dashboard(self.spec(), a)
		with self.assertRaises(ValueError):
			cc.validate_dashboard(self.spec(card_ids=["c1", "c9"]), a)

	def test_text_caps_and_sanitise(self):
		d = cc.validate_dashboard(self.spec(title="<b>" + "t" * 99, subtitle="s" * 200, subtext="u" * 200, footnote="f" * 300, captions=["c" * 300, "<i>x"]), self.avail())
		self.assertEqual([len(d[k]) for k in ("title", "subtitle", "subtext", "footnote")], [60, 90, 100, 140])
		self.assertEqual(len(d["panels"][0]["caption"]), 120)
		self.assertNotIn("<", json.dumps(d))

	def test_layout_repair(self):
		a = self.avail()  # c1 kpi3 (full), c2 bar8 (full), c3 kpi1, c4 bar3, c5 kpi2, c6 bar2, c7 kpi4
		def spans(ids, **kw):
			panels = [{"id": i, "span": 1} for i in ids]
			return [p["span"] for p in cc.validate_dashboard({"title": "t", "panels": panels, **kw}, a)["panels"]]
		self.assertEqual(spans(["c1", "c2"]), [2, 2])  # ineligible half -> full
		self.assertEqual(spans(["c3", "c4"]), [1, 1])
		self.assertEqual(spans(["c3", "c1"]), [2, 2])  # unpaired widened, order kept
		self.assertEqual(spans(["c3", "c4", "c5"]), [1, 1, 2])  # last unpaired widened
		self.assertEqual(spans(["c3", "c4"], columns="1"), [2, 2])
		default = cc.validate_dashboard(self.spec(card_ids=["c3", "c4"]), a)
		self.assertEqual([p["span"] for p in default["panels"]], [2, 2])  # full width by default

	def test_row_cap_is_error(self):
		a = self.avail()
		cc.validate_dashboard(self.spec(card_ids=["c1", "c2", "c7", "c1x"][:3]), a)
		with self.assertRaises(ValueError):
			cc.validate_dashboard({"title": "t", "panels": [{"id": "c%d" % i} for i in (1, 2, 7, 3, 4)]}, a)

	def test_per_panel_composed_flag(self):
		composed = dict(_k(1), ai_composed=True)
		d = cc.validate_dashboard(self.spec(), {"c1": composed, "c2": _bar(3)})
		self.assertEqual([p["composed"] for p in d["panels"]], [True, False])

	def test_validate_and_limit_cards_keep_dashboards(self):
		d = cc.validate_dashboard(self.spec(), self.avail())
		self.assertEqual(cc.validate_card(d), d)
		out = cc.limit_cards([d, d, _k(1), _bar(), _k(1, value=2)], limit=3)
		self.assertEqual([c["type"] for c in out], ["dashboard", "kpi", "bar"])
		self.assertEqual(len(out), 3)
		self.assertIsNone(cc.validate_card({"type": "dashboard", "title": "t", "panels": []}))


if __name__ == "__main__":
	unittest.main()


class ColumnsTwoPairsSmallPanelsTests(unittest.TestCase):
	def test_columns_two_pairs_small_kpi_and_bar(self):
		def kpi(t):
			return {"v": 1, "type": "kpi", "title": t, "kpis": [{"label": "a", "value": 1, "fmt": "int"}]}
		bar = {"v": 1, "type": "bar", "title": "B", "series": [{"label": "x", "value": 1}, {"label": "y", "value": 2}], "fmt": "int"}
		avail = {"c1": kpi("A"), "c2": kpi("B"), "c3": bar}
		d = cc.validate_dashboard({"title": "T", "card_ids": ["c1", "c2", "c3"], "columns": "2"}, avail)
		self.assertEqual([p["span"] for p in d["panels"]], [1, 1, 2])
		one = cc.validate_dashboard({"title": "T", "card_ids": ["c1", "c2", "c3"], "columns": "1"}, avail)
		self.assertEqual([p["span"] for p in one["panels"]], [2, 2, 2])

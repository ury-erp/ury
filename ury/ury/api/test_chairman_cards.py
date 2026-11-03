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


if __name__ == "__main__":
	unittest.main()

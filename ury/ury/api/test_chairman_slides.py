# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# PureTests: plain unittest, no Frappe site needed (frappe is stubbed if not
# importable). SiteTests: needs the seeded demo bench site (POS Invoice data up to
# 2026-10-21, POS Closing Entry data 2026-08-11..2026-08-17); run via
# bench --site <site> run-tests --module ury.ury.api.test_chairman_slides

import sys
import types
import unittest
from datetime import date
from unittest import mock


def _stub_frappe():
	try:
		import frappe  # noqa: F401

		return
	except ImportError:
		pass
	f = types.ModuleType("frappe")
	f._ = lambda s: s
	f.whitelist = lambda *a, **k: (lambda fn: fn)
	f.PermissionError = type("PermissionError", (Exception,), {})
	f.ValidationError = type("ValidationError", (Exception,), {})
	u = types.ModuleType("frappe.utils")
	u.getdate = lambda d: d
	u.now_datetime = lambda: None
	u.nowdate = lambda: date(2026, 11, 2)

	def _throw(msg, exc=Exception):
		raise exc(msg)

	f.throw = _throw
	f.utils = u
	sys.modules["frappe"] = f
	sys.modules["frappe.utils"] = u


_stub_frappe()

try:
	from frappe.tests import IntegrationTestCase
except ImportError:  # pure-only environment

	class IntegrationTestCase(unittest.TestCase):
		pass


try:
	from ury.ury.api import chairman_slides as s  # noqa: E402
except ImportError:
	import chairman_slides as s  # noqa: E402  (pure run from this dir)


class PureTests(unittest.TestCase):
	def test_month_ranges_mid_month(self):
		mtd, prev = s.month_ranges(date(2026, 10, 21))
		self.assertEqual(mtd, (date(2026, 10, 1), date(2026, 10, 21)))
		self.assertEqual(prev, (date(2026, 9, 1), date(2026, 9, 21)))

	def test_month_ranges_clamps_short_month(self):
		_mtd, prev = s.month_ranges(date(2026, 3, 31))
		self.assertEqual(prev, (date(2026, 2, 1), date(2026, 2, 28)))

	def test_month_ranges_january_rolls_year(self):
		_mtd, prev = s.month_ranges(date(2026, 1, 15))
		self.assertEqual(prev, (date(2025, 12, 1), date(2025, 12, 15)))

	def test_sum_range(self):
		per_day = {date(2026, 9, 1): 10.0, date(2026, 9, 2): 5.25, date(2026, 10, 1): 99.0}
		self.assertEqual(s.sum_range(per_day, date(2026, 9, 1), date(2026, 9, 30)), 15.25)

	def test_rank_branches(self):
		d = date(2026, 10, 21)
		rows = [
			{"posting_date": d, "branch": "B", "total": 50},
			{"posting_date": date(2026, 10, 20), "branch": "B", "total": 500},
			{"posting_date": d, "branch": "A", "total": 70},
			{"posting_date": d, "branch": None, "total": 5},
			{"posting_date": date(2026, 10, 2), "branch": "C", "total": 900},
		]
		r = s.rank_branches(rows, d)
		self.assertEqual([x["label"] for x in r], ["A", "B", "Unspecified", "C"])
		self.assertEqual(r[1], {"label": "B", "value": 50.0, "mtd": 550.0})
		self.assertEqual(r[3]["value"], 0.0)

	def test_split_top_bottom_no_overlap(self):
		rows = [{"item_code": c, "item_name": c, "total": t, "qty": 1} for c, t in
			(("a", 5), ("b", 9), ("c", 1), ("d", 7), ("e", 3))]
		top, bottom = s.split_top_bottom(rows)
		self.assertEqual([i["label"] for i in top], ["b", "d", "a"])
		self.assertEqual([i["label"] for i in bottom], ["c", "e"])  # only 2 left after top 3

	def test_split_top_bottom_tie_break_and_empty(self):
		rows = [{"item_code": c, "item_name": c, "total": 10, "qty": 1} for c in ("z", "m", "a")]
		top, _b = s.split_top_bottom(rows)
		self.assertEqual([i["label"] for i in top], ["a", "m", "z"])
		self.assertEqual(s.split_top_bottom([]), ([], []))
		self.assertEqual(s.items_headline([], []), "No items sold this week")

	def test_items_headline_uses_inr_compact(self):
		top = [{"label": "Pizza", "value": 125000.0}]
		bottom = [{"label": "Naan", "value": 75.0}]
		self.assertEqual(s.items_headline(top, bottom), "Top seller Pizza (₹1.3L), weakest Naan (₹75)")

	def test_mtd_headline(self):
		self.assertEqual(
			s.mtd_headline(618750.0, 313680.0, 0.9725),
			"No monthly target set. Month to date ₹6.2L, up 97% vs same days last month",
		)
		self.assertIn("no sales in the same days", s.mtd_headline(100.0, 0.0, None))
		self.assertIn("flat", s.mtd_headline(100.0, 100.0, 0.0))
		self.assertIn("No sales this month yet", s.mtd_headline(0.0, 0.0, None))

	def test_branch_headline(self):
		self.assertEqual(s.branch_headline([{"label": "X", "value": 18005.0}]), "X sold ₹18K")
		two = [{"label": "X", "value": 100.0}, {"label": "Y", "value": 50.0}]
		self.assertEqual(s.branch_headline(two), "X led with ₹100 of 2 branches")
		self.assertEqual(s.branch_headline([]), "No sales recorded for any branch")

	def test_leakage_tone(self):
		self.assertEqual(s.leakage_tone(0, 0, 1000), "good")
		self.assertEqual(s.leakage_tone(40, 0, 1000), "neutral")
		self.assertEqual(s.leakage_tone(50, 0, 1000), "bad")
		self.assertEqual(s.leakage_tone(10, 0, 0), "neutral")

	def test_top_reason(self):
		rows = [
			{"cancel_reason": "B", "n": 2, "total": 10},
			{"cancel_reason": "A", "n": 2, "total": 10},
			{"cancel_reason": "C", "n": 1, "total": 999},
		]
		self.assertEqual(s.top_reason(rows), "A")
		self.assertIsNone(s.top_reason([]))
		self.assertEqual(s.top_reason([{"cancel_reason": None, "n": 1, "total": 1}]), "Unspecified")

	def test_leakage_headline(self):
		self.assertEqual(s.leakage_headline(0, 0, 0, None), "No cancellations or discounts this week")
		self.assertEqual(
			s.leakage_headline(3, 5320.0, 0, "Order placed by mistake"),
			"3 cancelled orders (₹5.3K), mostly Order placed by mistake",
		)
		self.assertEqual(
			s.leakage_headline(0, 0, 1500.0, None), "₹1.5K in discounts"
		)

	def test_cashup(self):
		self.assertEqual(s.cashup_summary([]), (0, 0, 0.0, 0.0))
		rows = [{"difference": 0}, {"difference": -50.5}, {"difference": 20}, {"difference": 0.001}]
		entries, exc, abs_total, net = s.cashup_summary(rows)
		self.assertEqual((entries, exc, abs_total, net), (4, 2, 70.5, -30.5))
		self.assertEqual(s.cashup_headline(21, 0, 0), "All tills balanced")
		self.assertEqual(s.cashup_headline(0, 0, 0), "No cash-ups recorded this week")
		self.assertEqual(s.cashup_headline(21, 2, 70.5), "2 till counts off by ₹71 in total")
		self.assertEqual(s.cashup_tone(0, 0), "neutral")
		self.assertEqual(s.cashup_tone(5, 0), "good")
		self.assertEqual(s.cashup_tone(5, 1), "bad")


def _sql(query, values=()):
	import frappe

	return frappe.db.sql(query, values)


class SiteTests(IntegrationTestCase):
	"""NEEDS A BENCH SITE with seeded demo data. Each test compares a builder with a raw SQL truth query."""

	PINNED = "2026-10-21"
	CASHUP_DAY = "2026-08-17"

	def _day(self, text=None):
		import frappe

		return frappe.utils.getdate(text or self.PINNED)

	def _window(self, day):
		import frappe

		return frappe.utils.add_days(day, -6), day

	def test_ids_and_shape(self):
		day = self._day()
		slides = s.build_slides(day)
		self.assertEqual([x["id"] for x in slides], list(s.SLIDE_IDS))
		for sl in slides:
			for k in ("title", "headline", "value", "compare", "delta_pct", "tone", "chart", "drill", "data_quality", "status"):
				self.assertIn(k, sl)
			self.assertIn(sl["tone"], ("good", "bad", "neutral"))
			self.assertIn(sl["status"], ("ok", "unavailable"))
			self.assertIn("series", sl["chart"])

	def test_mtd_matches_sql_and_target_unavailable(self):
		day = self._day()
		(m0, m1), (p0, p1) = s.month_ranges(day)
		sql = "SELECT COALESCE(SUM(net_total),0) FROM `tabPOS Invoice` WHERE docstatus=1 AND posting_date BETWEEN %s AND %s"
		mtd = float(_sql(sql, (m0, m1))[0][0])
		prev = float(_sql(sql, (p0, p1))[0][0])
		sl = s.slide_mtd_target(day)
		self.assertEqual(sl["status"], "unavailable")
		self.assertEqual(sl["unavailable_reason"], "no_sales_target_doctype")
		self.assertAlmostEqual(sl["value"], mtd, places=2)
		self.assertAlmostEqual(sl["compare"], prev, places=2)
		if prev:
			self.assertAlmostEqual(sl["delta_pct"], round((mtd - prev) / prev, 4), places=4)

	def test_branch_ranking_matches_sql(self):
		day = self._day()
		(m0, m1), _prev = s.month_ranges(day)
		rows = _sql(
			"SELECT COALESCE(NULLIF(branch,''),'Unspecified'), "
			"SUM(CASE WHEN posting_date=%s THEN net_total ELSE 0 END), SUM(net_total) "
			"FROM `tabPOS Invoice` WHERE docstatus=1 AND posting_date BETWEEN %s AND %s GROUP BY 1",
			(day, m0, m1),
		)
		truth = {r[0]: (round(float(r[1]), 2), round(float(r[2]), 2)) for r in rows}
		sl = s.slide_branch_ranking(day)
		got = {b["label"]: (b["value"], b["mtd"]) for b in sl["branches"]}
		self.assertEqual(got, truth)
		self.assertEqual(sl["branch_count"], len(truth))
		values = [b["value"] for b in sl["branches"]]
		self.assertEqual(values, sorted(values, reverse=True))
		self.assertAlmostEqual(sl["value"], sum(v[0] for v in truth.values()), places=2)

	def test_top_bottom_items_match_sql(self):
		day = self._day()
		start, end = self._window(day)
		rows = _sql(
			"SELECT i.item_code, i.item_name, SUM(i.net_amount) t, SUM(i.qty) q FROM `tabPOS Invoice Item` i "
			"JOIN `tabPOS Invoice` p ON i.parent=p.name WHERE i.parenttype='POS Invoice' AND p.docstatus=1 "
			"AND p.is_return=0 AND i.qty>0 AND p.posting_date BETWEEN %s AND %s GROUP BY i.item_code, i.item_name",
			(start, end),
		)
		ordered = sorted(rows, key=lambda r: (-float(r[2]), r[1] or "", r[0] or ""))
		top3 = [(r[1], round(float(r[2]), 2)) for r in ordered[:3]]
		rest = sorted(ordered[3:], key=lambda r: (float(r[2]), r[1] or "", r[0] or ""))
		bottom3 = [(r[1], round(float(r[2]), 2)) for r in rest[:3]]
		sl = s.slide_top_bottom_items(day)
		self.assertEqual([(i["label"], i["value"]) for i in sl["top"]], top3)
		self.assertEqual([(i["label"], i["value"]) for i in sl["bottom"]], bottom3)
		self.assertEqual(sl["item_count"], len(rows))
		self.assertEqual(len(sl["chart"]["series"]), len(top3) + len(bottom3))

	def test_leakage_matches_sql(self):
		day = self._day()
		start, end = self._window(day)
		canc = _sql(
			"SELECT COUNT(*), COALESCE(SUM(ABS(net_total)),0) FROM `tabPOS Invoice` "
			"WHERE docstatus=2 AND posting_date BETWEEN %s AND %s",
			(start, end),
		)[0]
		disc = _sql(
			"SELECT COALESCE(SUM(discount_amount),0) FROM `tabPOS Invoice` "
			"WHERE docstatus=1 AND is_return=0 AND posting_date BETWEEN %s AND %s",
			(start, end),
		)[0][0]
		reason = _sql(
			"SELECT cancel_reason FROM `tabPOS Invoice` WHERE docstatus=2 AND posting_date BETWEEN %s AND %s "
			"GROUP BY cancel_reason ORDER BY COUNT(*) DESC, SUM(ABS(net_total)) DESC, cancel_reason ASC LIMIT 1",
			(start, end),
		)
		sl = s.slide_leakage(day)
		self.assertEqual(sl["cancellations"]["count"], int(canc[0]))
		self.assertAlmostEqual(sl["cancellations"]["value"], float(canc[1]), places=2)
		self.assertAlmostEqual(sl["discounts"]["value"], float(disc), places=2)
		self.assertEqual(sl["cancellations"]["top_reason"], reason[0][0] if reason else None)
		self.assertAlmostEqual(sl["value"], float(canc[1]) + float(disc), places=2)
		self.assertGreater(sl["cancellations"]["count"], 0)  # seeded: 3 cancels in 2026-10-15..21

	def test_cashup_matches_sql(self):
		day = self._day(self.CASHUP_DAY)
		start, end = self._window(day)
		rows = _sql(
			"SELECT COUNT(*), COALESCE(SUM(CASE WHEN ROUND(d.difference,2)<>0 THEN 1 ELSE 0 END),0), "
			"COALESCE(SUM(CASE WHEN ROUND(d.difference,2)<>0 THEN ABS(d.difference) ELSE 0 END),0) "
			"FROM `tabPOS Closing Entry Detail` d JOIN `tabPOS Closing Entry` c ON d.parent=c.name "
			"WHERE d.parenttype='POS Closing Entry' AND c.docstatus=1 AND c.posting_date BETWEEN %s AND %s",
			(start, end),
		)[0]
		sl = s.slide_cashup(day)
		self.assertEqual(sl["entries"], int(rows[0]))
		self.assertEqual(sl["exceptions"], int(rows[1]))
		self.assertAlmostEqual(sl["value"], float(rows[2]), places=2)
		self.assertGreater(sl["entries"], 0)  # seeded: 21 detail rows in 2026-08-11..17
		if not sl["exceptions"]:
			self.assertEqual(sl["headline"], "All tills balanced")
			self.assertEqual(sl["tone"], "good")

	def test_cashup_no_entries_window_is_neutral(self):
		sl = s.slide_cashup(self._day())  # no closing entries in Oct 2026 on the demo data
		if sl["entries"] == 0:
			self.assertEqual(sl["tone"], "neutral")
			self.assertEqual(sl["data_quality"], "partial")

	def test_branch_scope_isolation(self):
		"""A user permitted only for another branch sees nothing; permitted for the data's branch sees the same as unrestricted."""
		day = self._day()
		cday = self._day(self.CASHUP_DAY)
		branch = _sql("SELECT branch FROM `tabPOS Invoice` WHERE docstatus=1 AND branch IS NOT NULL LIMIT 1")[0][0]
		base = {x["id"]: x for x in s.build_slides(day)}
		base_cash = s.slide_cashup(cday)

		with mock.patch("frappe.permissions.get_user_permissions", return_value={"Branch": [{"doc": "No Such Branch"}]}):
			slides = {x["id"]: x for x in s.build_slides(day)}
			cash = s.slide_cashup(cday)
		self.assertEqual(slides["mtd_target"]["value"], 0)
		self.assertEqual(slides["branch_ranking"]["branches"], [])
		self.assertEqual(slides["top_bottom_items"]["top"], [])
		self.assertEqual(slides["leakage"]["cancellations"]["count"], 0)
		self.assertEqual(cash["entries"], 0)

		with mock.patch("frappe.permissions.get_user_permissions", return_value={"Branch": [{"doc": branch}]}):
			slides = {x["id"]: x for x in s.build_slides(day)}
			cash = s.slide_cashup(cday)
		self.assertEqual(slides["mtd_target"]["value"], base["mtd_target"]["value"])
		self.assertEqual(slides["branch_ranking"]["branches"], base["branch_ranking"]["branches"])
		self.assertEqual(slides["leakage"]["cancellations"], base["leakage"]["cancellations"])
		# closing entries have branch NULL: scope resolves through POS Profile.branch
		self.assertEqual(cash["entries"], base_cash["entries"])


if __name__ == "__main__":
	unittest.main()

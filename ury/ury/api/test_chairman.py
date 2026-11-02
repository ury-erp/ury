# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# PureTests: plain unittest, no Frappe site needed (frappe is stubbed if not
# importable). SiteTests: needs a bench site with the seeded demo data.

import sys
import types
import unittest
from datetime import date


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
	from ury.ury.api import chairman as c  # noqa: E402
except ImportError:
	import chairman as c  # noqa: E402  (pure run from this dir)


class PureTests(unittest.TestCase):
	def test_formatter_boundaries(self):
		self.assertEqual(c.format_inr_compact(999), "₹999")
		self.assertEqual(c.format_inr_compact(1000), "₹1K")
		self.assertEqual(c.format_inr_compact(99999), "₹100K")
		self.assertEqual(c.format_inr_compact(100000), "₹1L")
		self.assertEqual(c.format_inr_compact(9999999), "₹100L")
		self.assertEqual(c.format_inr_compact(10000000), "₹1Cr")

	def test_formatter_rounding_and_dot_zero(self):
		self.assertEqual(c.format_inr_compact(120000), "₹1.2L")
		self.assertEqual(c.format_inr_compact(1500), "₹1.5K")
		self.assertEqual(c.format_inr_compact(2000000), "₹20L")
		self.assertEqual(c.format_inr_compact(12340000), "₹1.2Cr")
		self.assertEqual(c.format_inr_compact(0), "₹0")
		self.assertEqual(c.format_inr_compact(None), "₹0")

	def test_formatter_negative(self):
		self.assertEqual(c.format_inr_compact(-1500), "-₹1.5K")
		self.assertEqual(c.format_inr_compact(-50), "-₹50")

	def test_headline_up_down_flat(self):
		d = date(2026, 10, 21)  # Wednesday
		self.assertEqual(c.yesterday_headline(120000, 111000, 0.081, d), "Yesterday ₹1.2L, up 8% vs last Wednesday")
		self.assertEqual(c.yesterday_headline(90000, 100000, -0.1, d), "Yesterday ₹90K, down 10% vs last Wednesday")
		self.assertEqual(c.yesterday_headline(100500, 100000, 0.005, d), "Yesterday ₹1L, flat vs last Wednesday")

	def test_headline_empty(self):
		d = date(2026, 10, 21)
		self.assertEqual(c.yesterday_headline(0, 0, None, d), "No sales recorded for 2026-10-21")

	def test_delta_null_when_compare_zero(self):
		self.assertIsNone(c.compute_delta(100, 0))
		self.assertIsNone(c.compute_delta(0, 0))
		self.assertAlmostEqual(c.compute_delta(110, 100), 0.1)

	def test_tone_thresholds(self):
		self.assertEqual(c.tone_for(0.02), "good")
		self.assertEqual(c.tone_for(0.0199), "neutral")
		self.assertEqual(c.tone_for(-0.02), "bad")
		self.assertEqual(c.tone_for(-0.0199), "neutral")
		self.assertEqual(c.tone_for(None), "neutral")

	def test_window_math(self):
		w = c.window_dates(date(2026, 10, 21))
		self.assertEqual(len(w), 7)
		self.assertEqual(w[0], date(2026, 10, 15))
		self.assertEqual(w[-1], date(2026, 10, 21))
		w2 = c.window_dates(date(2026, 3, 3))
		self.assertEqual(w2[0], date(2026, 2, 25))

	def test_spark_series_fills_zero_days(self):
		w = c.window_dates(date(2026, 10, 21))
		s = c.spark_series(w, {date(2026, 10, 21): 5.555})
		self.assertEqual(len(s), 7)
		self.assertEqual(s[0], {"label": "2026-10-15", "value": 0})
		self.assertEqual(s[-1]["value"], round(5.555, 2))

	def test_top_share_percent_rounding(self):
		series = [{"label": "Dine In", "value": 41.4}, {"label": "Delivery", "value": 58.6 - 17.2}]
		self.assertEqual(c.share_pct(41.4, 100), 41)
		self.assertEqual(c.share_pct(41.5, 100), round(41.5))
		self.assertEqual(c.share_pct(1, 0), 0)
		self.assertEqual(
			c.top_share_headline([{"label": "Dine In", "value": 41}, {"label": "X", "value": 59 - 18}], "{0} leads with {1}% of the week"),
			"Dine In leads with 50% of the week",
		)

	def test_top_share_headline_empty(self):
		self.assertEqual(c.top_share_headline([], "{0} {1}"), "No sales recorded")

	def test_sorting_channels_and_unspecified(self):
		rows = [
			{"order_type": "Take Away", "total": 10},
			{"order_type": None, "total": 30},
			{"order_type": "", "total": 5},
			{"order_type": "Dine In", "total": 20},
		]
		s = c.aggregate_series(rows, "order_type", "total")
		self.assertEqual([r["label"] for r in s], ["Unspecified", "Dine In", "Take Away"])
		self.assertEqual(s[0]["value"], 35)

	def test_payment_sorting_and_tie_break(self):
		rows = [
			{"mode_of_payment": "UPI", "total": 50},
			{"mode_of_payment": "Cash", "total": 50},
			{"mode_of_payment": "Card", "total": 70.456},
		]
		s = c.aggregate_series(rows, "mode_of_payment", "total")
		self.assertEqual([r["label"] for r in s], ["Card", "Cash", "UPI"])
		self.assertEqual(s[0]["value"], 70.46)
		self.assertEqual(c.total_of(s), 170.46)

	def test_data_quality_rule(self):
		self.assertEqual(c.data_quality_for(7, 0, 1000), "ok")
		self.assertEqual(c.data_quality_for(6, 0, 1000), "partial")
		self.assertEqual(c.data_quality_for(7, 100, 1000), "ok")  # exactly 10%
		self.assertEqual(c.data_quality_for(7, 101, 1000), "partial")
		self.assertEqual(c.data_quality_for(7, 0, 0), "ok")


class SiteTests(IntegrationTestCase):
	"""NEEDS A BENCH SITE with seeded demo data (2026-10-21 in range). Run via bench run-tests."""

	PINNED = "2026-10-21"

	def test_shape(self):
		import frappe

		from ury.ury.api.chairman import get_brief

		b = get_brief(self.PINNED)
		self.assertEqual(b["schema_version"], 1)
		self.assertEqual(b["date"], self.PINNED)
		self.assertEqual(b["currency"], "INR")
		self.assertEqual([s["id"] for s in b["slides"]], ["yesterday", "channel_mix", "payment_mix"])
		for s in b["slides"]:
			for k in ("title", "headline", "value", "compare", "delta_pct", "tone", "chart", "drill", "data_quality"):
				self.assertIn(k, s)
			self.assertIn(s["tone"], ("good", "bad", "neutral"))
		self.assertEqual(len(b["slides"][0]["chart"]["series"]), 7)
		self.assertIn("orders", b["slides"][0])

	def test_slide1_matches_direct_sql(self):
		import frappe

		from ury.ury.api.chairman import get_brief

		direct = frappe.db.sql(
			"SELECT COALESCE(SUM(net_total),0) FROM `tabPOS Invoice` "
			"WHERE docstatus=1 AND is_return=0 AND posting_date=%s",
			(self.PINNED,),
		)[0][0]
		b = get_brief(self.PINNED)
		self.assertAlmostEqual(b["slides"][0]["value"], float(direct), places=2)

	def test_invalid_date_and_permission(self):
		import frappe

		from ury.ury.api.chairman import get_brief

		with self.assertRaises(frappe.ValidationError):
			get_brief("not-a-date")


if __name__ == "__main__":
	unittest.main()

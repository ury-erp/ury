"""Pure (database-free) tests for ury.ury.dev_seed.gap_data_seed planners.

    bench --site <site> run-tests --module ury.ury.dev_seed.test_gap_data_seed
"""

import random
import unittest
from datetime import date, datetime, timedelta

from ury.ury.dev_seed import gap_data_seed as g

TODAY = date(2026, 11, 3)


class TestInvoicePlan(unittest.TestCase):
	def setUp(self):
		self.plans = g.build_invoice_plan(TODAY, 4, 4)

	def test_deterministic(self):
		self.assertEqual(self.plans, g.build_invoice_plan(TODAY, 4, 4))

	def test_keys_unique_and_date_based(self):
		keys = [p["key"] for p in self.plans]
		self.assertEqual(len(keys), len(set(keys)))
		self.assertTrue(all(k.startswith("inv-20") for k in keys))

	def test_window_and_recent_density(self):
		self.assertEqual(min(p["date"] for p in self.plans), TODAY - timedelta(days=g.WINDOW_DAYS - 1))
		self.assertEqual(max(p["date"] for p in self.plans), TODAY)
		recent = [p for p in self.plans if p["offset"] < g.RECENT_DAYS]
		self.assertEqual(len(recent), 3 * g.RECENT_DAYS)
		self.assertTrue(any(p["date"] == date(2026, 10, 21) for p in recent))

	def test_plan_for_a_day_stable_when_run_later(self):
		later = g.build_invoice_plan(TODAY + timedelta(days=3), 4, 4)
		by_key = {p["key"]: p for p in later}
		for p in self.plans:
			if p["key"] in by_key and p["offset"] > 0:
				a, b = dict(p), dict(by_key[p["key"]])
				a.pop("offset"), b.pop("offset")
				self.assertEqual(a, b)

	def test_features_present(self):
		self.assertTrue(any(p["discount_pct"] for p in self.plans))
		self.assertTrue(any(p["service_rate"] for p in self.plans))
		self.assertTrue(any(p["self_order"] for p in self.plans))
		recent = [p for p in self.plans if p["offset"] < g.RECENT_DAYS]
		self.assertTrue(any(p["discount_pct"] for p in recent))
		self.assertTrue(all(p["order_type"] == "Take Away" for p in self.plans if p["offset"] == 0))
		self.assertTrue(all(p["service_rate"] is None for p in self.plans if p["order_type"] == "Take Away"))

	def test_indices_within_bounds(self):
		for p in self.plans:
			self.assertLess(p["cashier_idx"], 4)
			self.assertLess(p["waiter_idx"], 4)
			self.assertTrue(12 <= p["hour"] <= 21)


class TestTiming(unittest.TestCase):
	def test_kot_timing_ranges(self):
		rng = random.Random(1)
		for _ in range(200):
			q, prep, pas = g.kot_timing(rng, 1.0, 1.0)
			self.assertTrue(20 <= q <= 240)
			self.assertTrue(120 <= prep <= 2400)
			self.assertTrue(45 <= pas <= 240)

	def test_cook_factor_orders_speed(self):
		fast = sum(g.kot_timing(random.Random(i), 0.8)[1] for i in range(300))
		slow = sum(g.kot_timing(random.Random(i), 1.6)[1] for i in range(300))
		self.assertGreater(slow, fast)

	def test_stamps_are_seconds_not_milliseconds(self):
		fired = datetime(2026, 11, 1, 13, 0, 0)
		s, r, v = g.exec_stamps(fired, 60, 600, 90)
		self.assertEqual((s - fired).total_seconds(), 60)
		self.assertEqual((r - s).total_seconds(), 600)
		self.assertEqual((v - r).total_seconds(), 90)

	def test_item_stamps_inside_window(self):
		s = datetime(2026, 11, 1, 13, 1)
		r = s + timedelta(minutes=10)
		for i in range(50):
			a, b = g.item_stamps(s, r, random.Random(i))
			self.assertTrue(s <= a < b)
			self.assertTrue(b <= r + timedelta(seconds=60))


class TestOtherPlans(unittest.TestCase):
	def test_wastage_plan(self):
		rows = g.plan_wastage(TODAY, 45, g.rng_for("wastage"))
		self.assertEqual(len(rows), 45)
		self.assertEqual(rows, g.plan_wastage(TODAY, 45, g.rng_for("wastage")))
		self.assertEqual(len({r["key"] for r in rows}), 45)
		self.assertTrue(any(r["date"] >= TODAY - timedelta(days=13) for r in rows))
		self.assertTrue(all(r["date"] > TODAY - timedelta(days=g.WINDOW_DAYS) for r in rows))
		self.assertTrue(all(r["reason"] in g.WASTAGE_REASONS for r in rows))
		self.assertTrue(any(r["authorized"] for r in rows))

	def test_yield_actual_bounded(self):
		rng = random.Random(3)
		vals = [g.plan_yield_actual(92, rng) for _ in range(500)]
		self.assertTrue(all(60 <= v <= 105 for v in vals))
		self.assertTrue(any(v < 92 - 3 for v in vals))
		self.assertTrue(any(v > 92 for v in vals))

	def test_bulk_plan(self):
		runs = g.plan_bulk_runs(TODAY, 14, g.rng_for("bulk"))
		self.assertEqual(len(runs), 14)
		self.assertTrue(all(1 <= r["lines"] <= 3 for r in runs))
		self.assertTrue(any(r["date"] >= TODAY - timedelta(days=13) for r in runs))

	def test_parts_from_arg(self):
		self.assertEqual(g.parts_from_arg(None), g.PARTS)
		self.assertEqual(g.parts_from_arg("yield, wastage"), ("yield", "wastage"))
		with self.assertRaises(ValueError):
			g.parts_from_arg("nope")

	def test_stable_index_and_marker(self):
		self.assertEqual(g.stable_index("abc", 7), g.stable_index("abc", 7))
		self.assertEqual(g.stable_index("abc", 0), 0)
		self.assertEqual(g.marker("k"), "[gap-seed:k]")

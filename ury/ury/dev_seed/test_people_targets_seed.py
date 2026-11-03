"""Pure tests for people_targets_seed helpers (no database needed).

    python -m unittest ury.ury.dev_seed.test_people_targets_seed
"""

import random
import unittest
from datetime import date

from ury.ury.dev_seed import people_targets_seed as pts


class TestPeopleTargetsSeedHelpers(unittest.TestCase):
	def test_month_periods_span_seven_months(self):
		p = pts.month_periods(date(2026, 11, 3))
		self.assertEqual(len(p), 7)
		self.assertEqual(p[0], (date(2026, 5, 1), date(2026, 5, 31)))
		self.assertEqual(p[-1], (date(2026, 11, 1), date(2026, 11, 30)))

	def test_month_periods_year_wrap_and_leap(self):
		p = pts.month_periods(date(2028, 2, 10))
		self.assertEqual(p[0], (date(2027, 8, 1), date(2027, 8, 31)))
		self.assertEqual(p[-1], (date(2028, 2, 1), date(2028, 2, 29)))

	def test_target_amount_deterministic_and_rounded(self):
		a = pts.target_amount_for(date(2026, 10, 1), date(2026, 10, 31), 21000)
		b = pts.target_amount_for(date(2026, 10, 1), date(2026, 10, 31), 21000)
		self.assertEqual(a, b)
		self.assertEqual(a % 5000, 0)
		self.assertTrue(21000 * 31 * 0.9 <= a <= 21000 * 31 * 1.15)

	def test_tip_deterministic_and_bounded(self):
		self.assertEqual(pts.tip_for("INV-1", 1000), pts.tip_for("INV-1", 1000))
		self.assertEqual(pts.tip_for("INV-1", 0), 0.0)
		tips = [pts.tip_for(f"INV-{i}", 1000) for i in range(300)]
		self.assertTrue(all(0 <= t <= 120 for t in tips))
		self.assertTrue(0.3 < sum(1 for t in tips if t == 0) / 300 < 0.5)

	def test_dwell_range_and_format(self):
		for i in range(100):
			s = pts.dwell_seconds_for(f"X{i}")
			self.assertTrue(30 * 60 <= s <= 110 * 60)
		self.assertEqual(pts.format_hms(3725), "01:02:05")

	def test_works_on_has_weekly_off(self):
		days = [date(2026, 10, 5 + i) for i in range(7)]  # Mon..Sun
		off = [d for d in days if d.weekday() == 3 % 7]
		self.assertFalse(pts.works_on(3, off[0]))
		worked = sum(pts.works_on(3, d) for d in days)
		self.assertTrue(4 <= worked <= 6)

	def test_shift_plan_hours_match_times(self):
		shift, a, b, hours = pts.shift_plan(1, date(2026, 10, 10), "Cashier")
		self.assertEqual(shift, pts.SHIFT_EVENING)
		self.assertAlmostEqual((b - a).total_seconds() / 3600, hours, places=1)
		self.assertTrue(8 <= hours <= 10)

	def test_week_start_is_monday(self):
		self.assertEqual(pts.week_start(date(2026, 11, 3)), date(2026, 11, 2))

	def test_invoice_offsets_cover_days(self):
		offs = pts.invoice_offsets(60, 14, random.Random(1))
		self.assertEqual(len(offs), 60)
		self.assertEqual(set(offs), set(range(1, 15)))


if __name__ == "__main__":
	unittest.main()

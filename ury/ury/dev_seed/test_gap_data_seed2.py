"""Pure tests: cd dev_seed && python3 -m unittest test_gap_data_seed2 (stubs frappe if absent)."""

import sys
import types
import unittest
from datetime import date, datetime, timedelta

if "frappe" not in sys.modules:
	try:
		import frappe  # noqa: F401
	except ImportError:
		fr = types.ModuleType("frappe")
		fu = types.ModuleType("frappe.utils")
		for n in ("add_days", "flt", "get_datetime", "now_datetime", "today"):
			setattr(fu, n, lambda *a, **k: None)
		fu.flt = lambda v, *a: float(v or 0)
		fr.utils = fu
		sys.modules["frappe"], sys.modules["frappe.utils"] = fr, fu

try:
	from ury.ury.dev_seed import gap_data_seed2 as g
except ImportError:  # run from this directory without a bench: import the file directly
	import gap_data_seed2 as g


class TestStageTimes(unittest.TestCase):
	def test_ranges_and_outliers(self):
		rng = g.rng_for("t")
		totals = []
		for i in range(2000):
			q, p, s = g.stage_times(rng, 0.8 + (i % 5) * 0.2)
			self.assertTrue(60 <= q <= 360 or q >= 60)
			self.assertTrue(360 <= p <= 18 * 60)
			self.assertGreaterEqual(s, 60)
			totals.append(q + p + s)
		normal = [t for t in totals if t < 35 * 60]
		slow = [t for t in totals if t >= 35 * 60]
		self.assertTrue(all(12 * 60 <= t <= 30 * 60 for t in normal))
		self.assertTrue(all(35 * 60 <= t <= 50 * 60 for t in slow))
		self.assertTrue(0.03 < len(slow) / len(totals) < 0.12)

	def test_deterministic(self):
		self.assertEqual(g.stage_times(g.rng_for("x")), g.stage_times(g.rng_for("x")))


class TestCandidates(unittest.TestCase):
	T = datetime(2026, 11, 1, 12, 0)

	def row(self, by, mins, mod, key=None):
		return {"ready_by": by, "started_at": self.T, "ready_at": self.T + timedelta(minutes=mins),
			"modified": mod, "idempotency_key": key}

	def test_selection(self):
		kots = [{"name": f"K{i}"} for i in range(5)]
		m = self.T
		execs = {
			"K0": [self.row("Administrator", 0.01, m)],
			"K1": [self.row("a@x", 9, m)],
			"K2": [self.row("a@x", 9, m), self.row("Administrator", 0, m + timedelta(1))],
			"K3": [self.row("a@x", 9, m, "gap-seed2-K3")],
		}
		got = [k["name"] for k in g.pick_exec_candidates(kots, execs, 10)]
		self.assertEqual(got, ["K0", "K2", "K4"])
		self.assertEqual(len(g.pick_exec_candidates(kots, execs, 2)), 2)


class TestPlans(unittest.TestCase):
	def test_cash(self):
		names = [f"D{i}" for i in range(30)]
		p = g.plan_cash_differences(names, 8, 0)
		self.assertEqual(len(p), 8)
		self.assertTrue(all(d != 0 and abs(d) <= 100 for _, d in p))
		self.assertEqual(p, g.plan_cash_differences(names, 8, 0))
		self.assertEqual(len(g.plan_cash_differences(names, 8, 3)), 5)
		self.assertEqual(g.plan_cash_differences(names, 8, 8), [])

	def test_dispositions(self):
		items = [(f"I{i}", 1 + i % 3) for i in range(100)] + [("Z", 0)]
		p = g.plan_dispositions(items, 40)
		self.assertEqual(len(p), 40)
		q = dict(items)
		for n, c, d in p:
			self.assertIn(d, g.DISPOSITIONS)
			self.assertTrue(0 < float(c) <= q[n])
		self.assertGreaterEqual(len({d for _, _, d in p}), 3)
		self.assertEqual(p, g.plan_dispositions(items, 40))
		self.assertEqual(g.plan_dispositions(items, 40, 40), [])

	def test_commit(self):
		rng = g.rng_for("c")
		for qty, ful in [(10, 0), (10, 9), (1, 0), (0, 0)]:
			c = g.plan_commit_qty(qty, ful, rng)
			self.assertGreaterEqual(c, ful)
			self.assertGreaterEqual(c, 0)

	def test_reservations(self):
		p = g.plan_reservations(date(2026, 11, 3), 30, 12)
		self.assertEqual(len({x["key"] for x in p}), 30)
		self.assertTrue(all(0 <= x["offset"] < 30 and 0 <= x["item_index"] < 12 for x in p))
		self.assertTrue(all(x["offset"] <= 1 for x in p if x["status"] == "Reserved"))

	def test_parts(self):
		self.assertEqual(g.parts_from_arg("kot_exec, commitments"), ["kot_exec", "commitments"])
		with self.assertRaises(ValueError):
			g.parts_from_arg("nope")

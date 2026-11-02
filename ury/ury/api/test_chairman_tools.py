# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# PureTests: plain unittest, no Frappe site needed (frappe is stubbed if not importable).
# SiteTests: need the seeded demo bench site; run via
#   bench --site <site> run-tests --module ury.ury.api.test_chairman_tools

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
	import importlib.machinery as _m

	f = types.ModuleType("frappe")
	f.__spec__ = _m.ModuleSpec("frappe", None)
	f.__path__ = []
	f._ = lambda s: s
	f.whitelist = lambda *a, **k: (lambda fn: fn)
	f.PermissionError = type("PermissionError", (Exception,), {})
	f.ValidationError = type("ValidationError", (Exception,), {})
	u = types.ModuleType("frappe.utils")
	u.getdate = lambda d: d if isinstance(d, date) else date.fromisoformat(str(d))
	u.now_datetime = lambda: None
	u.nowdate = lambda: date(2026, 11, 2)

	def _throw(msg, exc=Exception):
		raise exc(msg)

	f.throw = _throw
	qb = types.ModuleType("frappe.query_builder")
	qb.__path__ = []
	qf = types.ModuleType("frappe.query_builder.functions")
	qf.Sum = qf.Count = lambda *a, **k: mock.MagicMock()
	sys.modules["frappe.query_builder"] = qb
	sys.modules["frappe.query_builder.functions"] = qf
	f.utils = u
	sys.modules["frappe"] = f
	sys.modules["frappe.utils"] = u


_stub_frappe()

import frappe  # noqa: E402

try:
	from frappe.tests import IntegrationTestCase
except ImportError:

	class IntegrationTestCase(unittest.TestCase):
		pass


try:
	from ury.ury.api import chairman_tools as t  # noqa: E402
except ImportError:
	import chairman_tools as t  # noqa: E402

TODAY = date(2026, 11, 2)


class FakeChairman:
	"""Stands in for chairman.py: role check, today, formatting."""

	def __init__(self, permitted=True):
		self.permitted = permitted
		self.daily_calls = []

	def _check_role(self):
		if not self.permitted:
			frappe.throw("Not permitted", frappe.PermissionError)

	def _today(self):
		return TODAY

	def format_inr_compact(self, v):
		return f"INR{v:g}"

	def _daily_rows(self, s, e):
		self.daily_calls.append((s, e))
		return [
			{"posting_date": date(2026, 10, 1), "total": 1000, "orders": 4},
			{"posting_date": date(2026, 10, 2), "total": 3000, "orders": 6},
		]

	def _per_day(self, rows):
		return {r["posting_date"]: float(r["total"]) for r in rows}


class _Col:
	def __getattr__(self, name):
		return mock.MagicMock()

	__ge__ = __le__ = __lt__ = __gt__ = __eq__ = __ne__ = lambda self, o: mock.MagicMock()
	__hash__ = object.__hash__


class _Table:
	def __getattr__(self, name):
		return _Col()


class PureTests(unittest.TestCase):
	def test_validate_range_ok(self):
		s, e = t.validate_range("2026-10-01", "2026-10-31", TODAY)
		self.assertEqual((s, e), (date(2026, 10, 1), date(2026, 10, 31)))

	def test_validate_range_rejects(self):
		for a, b in [
			("2026-10-31", "2026-10-01"),  # reversed
			("2026-10-01", "2026-11-03"),  # future
			("2025-01-01", "2026-11-02"),  # > 366 days
			("garbage", "2026-10-01"),
		]:
			with self.assertRaises(ValueError):
				t.validate_range(a, b, TODAY)

	def test_validate_range_366_boundary(self):
		t.validate_range("2025-11-02", "2026-11-02", TODAY)  # exactly 366 days incl.
		with self.assertRaises(ValueError):
			t.validate_range("2025-11-01", "2026-11-02", TODAY)  # 367

	def test_clamp_limit(self):
		self.assertEqual(t.clamp_limit(None), 5)
		self.assertEqual(t.clamp_limit(99), 20)
		with self.assertRaises(ValueError):
			t.clamp_limit(0)
		with self.assertRaises(ValueError):
			t.clamp_limit("x")

	def test_mix_series_shares_and_unspecified(self):
		with mock.patch.object(t, "_chairman", return_value=FakeChairman()):
			out, total = t.mix_series(
				[{"k": "A", "v": 75}, {"k": "", "v": 25}, {"k": None, "v": 0}], "k", "v"
			)
		self.assertEqual(total, 100.0)
		self.assertEqual([o["label"] for o in out], ["A", "Unspecified"])
		self.assertEqual(out[0]["share_pct"], 75.0)

	def test_kitchen_speed_summary(self):
		from datetime import timedelta as td

		rows = [
			{"time": td(hours=12), "start_time_prep": td(hours=12, minutes=2), "start_time_serv": td(hours=12, minutes=10)},
			{"time": "13:00:00", "start_time_prep": "13:04:00", "start_time_serv": "13:20:00"},
			{"time": td(hours=14), "start_time_prep": None, "start_time_serv": None},
			{"time": td(hours=23, minutes=59), "start_time_prep": None, "start_time_serv": td(minutes=5)},  # midnight: skipped
		]
		out = t.kitchen_speed_summary(rows)
		self.assertEqual(out["tickets"], 4)
		self.assertEqual(out["tickets_with_served_time"], 2)
		self.assertEqual(out["avg_minutes_order_to_served"], 15.0)
		self.assertEqual(out["median_minutes_order_to_served"], 15.0)
		self.assertEqual(out["slowest_minutes_order_to_served"], 20.0)
		self.assertEqual(out["avg_minutes_order_to_prep_start"], 3.0)

	def test_kitchen_speed_empty(self):
		out = t.kitchen_speed_summary([])
		self.assertIsNone(out["avg_minutes_order_to_served"])

	def test_weekday_profile(self):
		out = t.weekday_profile({date(2026, 10, 5): 100.0, date(2026, 10, 12): 200.0, date(2026, 10, 6): 50.0})
		self.assertEqual(out[0], {"weekday": "Monday", "days": 2, "avg": 150.0})
		self.assertEqual(out[1]["weekday"], "Tuesday")

	# ---- role refusal: every registered tool
	def test_every_tool_refuses_without_role(self):
		fake = FakeChairman(permitted=False)
		with mock.patch.object(t, "_chairman", return_value=fake):
			for tool in t.TOOLS:
				args = {"start_date": "2026-10-01", "end_date": "2026-10-02"} if "start_date" in tool["parameters"]["properties"] else {}
				with self.assertRaises(frappe.PermissionError, msg=tool["name"]):
					tool["func"](**args)
		self.assertEqual(fake.daily_calls, [])  # nothing queried before the refusal

	# ---- shape and range validation through a tool
	def test_get_sales_range_shape(self):
		fake = FakeChairman()
		with mock.patch.object(t, "_chairman", return_value=fake):
			out = t.get_sales_range("2026-10-01", "2026-10-03")
		self.assertEqual(out["net_sales"], {"value": 4000.0, "text": "INR4000"})
		self.assertEqual(out["orders"], 10)
		self.assertEqual(out["days_in_range"], 3)
		self.assertEqual(out["days_with_sales"], 2)
		self.assertEqual(out["best_day"]["date"], "2026-10-02")
		self.assertEqual(out["worst_day"]["date"], "2026-10-01")
		self.assertEqual(out["avg_order_value"]["value"], 400.0)
		self.assertEqual(len(out["daily"]), 3)
		self.assertEqual(fake.daily_calls, [(date(2026, 10, 1), date(2026, 10, 3))])

	def test_tool_range_validation_error(self):
		with mock.patch.object(t, "_chairman", return_value=FakeChairman()):
			with self.assertRaises(frappe.ValidationError):
				t.get_sales_range("2025-01-01", "2026-11-02")
			with self.assertRaises(frappe.ValidationError):
				t.get_sales_range("2026-10-05", "2026-10-01")

	# ---- scoping: new SQL goes only through the scoped choke points
	def test_new_sql_uses_scoped_query_helpers(self):
		sentinel = RuntimeError("stop-after-scope")
		fake = FakeChairman()
		fake._base_query = mock.Mock(side_effect=sentinel)
		slides = types.SimpleNamespace(_pi_query=mock.Mock(side_effect=sentinel))
		with mock.patch.object(t, "_chairman", return_value=fake), mock.patch.object(t, "_slides", return_value=slides):
			for fn in (t.get_order_type_and_payment_mix,):
				with self.assertRaises(RuntimeError):
					fn("2026-10-01", "2026-10-02")
			for fn in (t.get_cancellations, t.get_top_bottom_dishes):
				with self.assertRaises(RuntimeError):
					fn("2026-10-01", "2026-10-02")
		fake._base_query.assert_called()
		slides._pi_query.assert_called()

	def test_kitchen_speed_applies_branch_scope(self):
		fake = FakeChairman()
		fake._allowed = mock.Mock(side_effect=RuntimeError("scoped"))
		fake_frappe = types.SimpleNamespace(
			qb=types.SimpleNamespace(DocType=lambda name: _Table(), from_=mock.MagicMock()),
			throw=frappe.throw,
			ValidationError=frappe.ValidationError,
			PermissionError=frappe.PermissionError,
		)
		with mock.patch.object(t, "_chairman", return_value=fake), mock.patch.object(t, "frappe", fake_frappe):
			with self.assertRaises(RuntimeError):
				t.get_kitchen_speed("2026-10-01", "2026-10-02")
		fake._allowed.assert_called_with("Branch")

	# ---- registry
	def test_registry_shape(self):
		names = [x["name"] for x in t.TOOLS]
		self.assertEqual(len(names), len(set(names)))
		self.assertGreaterEqual(len(names), 11)
		for x in t.TOOLS:
			self.assertEqual(set(x), {"name", "description", "parameters", "func"})
			self.assertTrue(callable(x["func"]))
			self.assertEqual(x["func"].__name__, x["name"])
			self.assertGreater(len(x["description"]), 20)
			self.assertEqual(x["parameters"]["type"], "object")
			for r in x["parameters"]["required"]:
				self.assertIn(r, x["parameters"]["properties"])
		self.assertFalse([n for n in names if "sql" in n or "list" in n])

	def test_registry_covers_required_topics(self):
		names = {x["name"] for x in t.TOOLS}
		for n in (
			"get_sales_range",
			"get_top_bottom_dishes",
			"get_order_type_and_payment_mix",
			"get_cancellations",
			"get_kitchen_speed",
			"get_ideas_context",
		):
			self.assertIn(n, names)


@unittest.skipUnless(hasattr(frappe, "set_user"), "needs a bench site")
class SiteTests(IntegrationTestCase):
	"""Run in the bench (seeded demo data). Verifies role refusal and scoping for real."""

	def test_refuses_user_without_role(self):
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.PermissionError):
				t.get_sales_range("2026-10-01", "2026-10-07")
		finally:
			frappe.set_user("Administrator")

	def test_sales_range_matches_sql_truth(self):
		from ury.ury.api import chairman

		chairman.ALLOW_ADMINISTRATOR_FOR_TESTS = True
		try:
			out = t.get_sales_range("2026-10-01", "2026-10-07")
			truth = frappe.db.sql(
				"select coalesce(sum(net_total),0) from `tabPOS Invoice` where docstatus=1 and posting_date between %s and %s",
				("2026-10-01", "2026-10-07"),
			)[0][0]
			self.assertAlmostEqual(out["net_sales"]["value"], float(truth), places=2)
		finally:
			chairman.ALLOW_ADMINISTRATOR_FOR_TESTS = False


if __name__ == "__main__":
	unittest.main()

"""The warehouses dashboard: stock health, staleness, group views and the movement buckets."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, getdate, nowdate

from ury.ury.api import inventory

MOD = "ury.ury.api.inventory"


class TestStockStatus(FrappeTestCase):

	def test_below_zero_is_a_booking_mistake_not_stock(self):
		self.assertEqual(inventory._status(-1, 10), "negative")

	def test_nothing_left_is_out(self):
		self.assertEqual(inventory._status(0, 0), "out")

	def test_at_or_below_the_reorder_level_is_low(self):
		self.assertEqual(inventory._status(5, 5), "low")
		self.assertEqual(inventory._status(4, 5), "low")
		self.assertEqual(inventory._status(6, 5), "ok")

	def test_without_a_reorder_level_nothing_is_ever_low(self):
		self.assertEqual(inventory._status(1, 0), "ok")


class TestBinRows(FrappeTestCase):

	def _rows(self, bins, reorder=(), history=None):
		levels = {(r["parent"], r["warehouse"]): r["warehouse_reorder_level"] for r in reorder}
		with patch(f"{MOD}._fetch_bins", return_value=[frappe._dict(b) for b in bins]), \
			 patch(f"{MOD}._reorder_levels", return_value=levels), \
			 patch(f"{MOD}._ledger_history", return_value=history or {}):
			return inventory._bin_rows(["W1"])

	def _bin(self, **kw):
		base = dict(item_code="I1", warehouse="W1", actual_qty=10, stock_value=100, safety_stock=0)
		base.update(kw)
		return base

	def test_a_warehouse_reorder_level_wins_over_safety_stock(self):
		rows = self._rows(
			[self._bin(actual_qty=8, safety_stock=2)],
			reorder=[{"parent": "I1", "warehouse": "W1", "warehouse_reorder_level": 10}],
		)
		self.assertEqual(rows[0].reorder_level, 10)
		self.assertEqual(rows[0].status, "low")

	def test_safety_stock_is_the_fallback_level(self):
		rows = self._rows([self._bin(actual_qty=2, safety_stock=3)])
		self.assertEqual(rows[0].status, "low")

	def test_old_stock_that_never_left_is_stagnant(self):
		old = getdate(add_days(nowdate(), -200))
		rows = self._rows([self._bin()], history={("I1", "W1"): (old, None)})
		self.assertTrue(rows[0].stagnant)

	def test_old_stock_that_left_recently_is_not(self):
		old = getdate(add_days(nowdate(), -200))
		recent = getdate(add_days(nowdate(), -5))
		rows = self._rows([self._bin()], history={("I1", "W1"): (old, recent)})
		self.assertFalse(rows[0].stagnant)

	def test_a_fresh_arrival_is_not_stagnant(self):
		rows = self._rows([self._bin()], history={("I1", "W1"): (getdate(add_days(nowdate(), -3)), None)})
		self.assertFalse(rows[0].stagnant)

	def test_an_empty_shelf_is_never_stagnant(self):
		old = getdate(add_days(nowdate(), -200))
		rows = self._rows([self._bin(actual_qty=0)], history={("I1", "W1"): (old, None)})
		self.assertFalse(rows[0].stagnant)
		self.assertEqual(rows[0].status, "out")


class TestGroupView(FrappeTestCase):

	def test_an_item_out_in_one_child_but_held_in_another_is_in_stock(self):
		rows = [
			frappe._dict(item_code="I1", warehouse="A", actual_qty=0, reserved_qty=0, projected_qty=0, ordered_qty=0,
						 stock_value=0, reorder_level=0, valuation_rate=0, status="out", stagnant=False, last_out=None),
			frappe._dict(item_code="I1", warehouse="B", actual_qty=4, reserved_qty=0, projected_qty=4, ordered_qty=0,
						 stock_value=40, reorder_level=0, valuation_rate=10, status="ok", stagnant=False, last_out=None),
		]
		merged = inventory._merge_by_item(rows)
		self.assertEqual(len(merged), 1)
		self.assertEqual(merged[0].actual_qty, 4)
		self.assertEqual(merged[0].status, "ok")
		self.assertEqual(merged[0].valuation_rate, 10)


class TestMovement(FrappeTestCase):

	def test_every_day_of_the_period_has_a_point_even_without_movements(self):
		with patch(f"{MOD}.frappe.db.sql", return_value=[]):
			result = inventory._movement(["W1"], 30)
		self.assertEqual(result["granularity"], "day")
		self.assertEqual(len(result["points"]), 30)
		self.assertEqual(result["points"][-1]["date"], str(getdate(nowdate())))

	def test_past_a_month_points_are_weekly(self):
		with patch(f"{MOD}.frappe.db.sql", return_value=[]):
			result = inventory._movement(["W1"], 90)
		self.assertEqual(result["granularity"], "week")
		self.assertLessEqual(len(result["points"]), 14)

	def test_values_land_in_their_day(self):
		today = getdate(nowdate())
		with patch(f"{MOD}.frappe.db.sql", return_value=[
			frappe._dict(posting_date=today, in_value=500, out_value=200, in_count=1, out_count=3)
		]):
			points = inventory._movement(["W1"], 7)["points"]
		self.assertEqual(points[-1]["in_value"], 500)
		self.assertEqual(points[-1]["out_value"], 200)

	def test_the_period_is_clamped(self):
		with patch(f"{MOD}._check_access"), \
			 patch(f"{MOD}._company_and_warehouse", return_value=("C1", None)), \
			 patch(f"{MOD}.frappe.db.get_single_value", return_value=None), \
			 patch(f"{MOD}.frappe.get_list", return_value=[]), \
			 patch(f"{MOD}.frappe.get_cached_value", return_value="IQD"):
			self.assertEqual(inventory.get_inventory_overview(days=5000)["days"], 365)
			self.assertEqual(inventory.get_inventory_overview(days=1)["days"], 7)


class TestAccess(FrappeTestCase):

	def test_an_unknown_warehouse_is_a_clear_error(self):
		with patch(f"{MOD}._check_access"):
			with self.assertRaises(frappe.DoesNotExistError):
				inventory.get_warehouse_stock("No Such Warehouse")

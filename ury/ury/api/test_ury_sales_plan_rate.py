import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from ury.ury.api import ury_sales_plan_rate as rate_mod


class _Row(frappe._dict):
	def precision(self, fieldname):
		return 2


class _Doc(frappe._dict):
	def precision(self, fieldname):
		return 2


def _fake_get_all_factory(menu_price_lists, item_prices):
	"""menu_price_lists: [price_list,...]; item_prices: {price_list: {item: rate}}."""

	def fake_get_all(doctype, filters=None, **kwargs):
		if doctype == "URY Menu":
			return list(menu_price_lists)
		if doctype == "Item Price":
			prices = item_prices.get(filters["price_list"], {})
			return [
				{"item_code": c, "price_list_rate": prices[c]}
				for c in filters["item_code"][1]
				if c in prices
			]
		return []

	return fake_get_all


class TestResolveItemRates(unittest.TestCase):
	def _resolve(self, items, menu_pls, prices, active_menu="Main", default_pl="PL-Main"):
		def fake_get_value(doctype, filters, fieldname=None, *a, **k):
			if doctype == "URY Restaurant":
				return active_menu
			if doctype == "URY Menu":
				return default_pl
			return None

		with patch.object(frappe, "get_all", _fake_get_all_factory(menu_pls, prices)), patch.object(
			frappe, "db", SimpleNamespace(get_value=fake_get_value)
		):
			return rate_mod.resolve_item_rates(items, "Branch-1")

	def test_default_menu_price_list_wins(self):
		prices = {"PL-Main": {"A": 100}, "PL-Other": {"A": 90}}
		rates = self._resolve(["A"], ["PL-Main", "PL-Other"], prices)
		self.assertEqual(rates["A"], 100)

	def test_falls_back_to_other_menu_price_list(self):
		prices = {"PL-Main": {}, "PL-Other": {"B": 55}}
		rates = self._resolve(["B"], ["PL-Main", "PL-Other"], prices)
		self.assertEqual(rates["B"], 55)

	def test_unpriced_item_is_zero(self):
		rates = self._resolve(["C"], ["PL-Main"], {"PL-Main": {}})
		self.assertEqual(rates, {"C": 0.0})

	def test_no_restaurant_or_menu_returns_zero(self):
		rates = self._resolve(["A"], [], {}, active_menu=None)
		self.assertEqual(rates, {"A": 0.0})

	def test_empty_input(self):
		self.assertEqual(rate_mod.resolve_item_rates([], "Branch-1"), {})


def _flt(value, precision=None):
	# frappe's flt needs a live site for precision rounding; stub it here.
	value = float(value or 0)
	return round(value, precision) if precision is not None else value


class TestCalculateTotals(unittest.TestCase):
	def setUp(self):
		patcher = patch.object(rate_mod, "flt", _flt)
		patcher.start()
		self.addCleanup(patcher.stop)

	def test_amount_and_total(self):
		doc = _Doc(items=[_Row(qty=3, rate=10.5), _Row(qty=0, rate=99), _Row(qty=2, rate=0)])
		rate_mod.calculate_totals(doc)
		self.assertEqual([r.amount for r in doc["items"]], [31.5, 0, 0])
		self.assertEqual(doc.expected_sales_amount, 31.5)

	def test_total_updates_after_row_removed(self):
		doc = _Doc(items=[_Row(qty=1, rate=10), _Row(qty=2, rate=5)])
		rate_mod.calculate_totals(doc)
		self.assertEqual(doc.expected_sales_amount, 20)
		doc["items"].pop()
		rate_mod.calculate_totals(doc)
		self.assertEqual(doc.expected_sales_amount, 10)

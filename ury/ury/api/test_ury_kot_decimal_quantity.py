# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Tests for decimal KOT quantities: compare_two_array, cancelled_qty on
cancel KOTs, and the waiter slip quantity normalisation.

Mock-based, no database. The Float precision is read through
frappe.get_precision, which is mocked to 3 (the Frappe default when the site
"float_precision" setting is blank).
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe

from ury.ury.api import ury_waiter_print
from ury.ury.api.ury_kot_generate import compare_two_array, create_cancel_kot_doc
from ury.ury.api.ury_waiter_print import (
	_aggregate_kot_items,
	_enrich_item_display_fields,
	_normalize_qty,
)

GENERATE = "ury.ury.api.ury_kot_generate"
PRINT = "ury.ury.api.ury_waiter_print"


class TestCompareTwoArrayDecimal(unittest.TestCase):
	def test_equal_decimals_are_identical(self):
		a = [{"item_code": "I1", "qty": 1.5}]
		b = [{"item_code": "I1", "qty": 1.5}]
		self.assertEqual(compare_two_array(a, b), [])

	def test_equal_values_with_different_types_are_identical(self):
		a = [{"item_code": "I1", "qty": "1.5"}]
		b = [{"item_code": "I1", "qty": 1.5}]
		self.assertEqual(compare_two_array(a, b), [])
		self.assertEqual(compare_two_array([{"item_code": "I1", "qty": "2"}], [{"item_code": "I1", "qty": 2.0}]), [])

	def test_decimal_increase_returns_delta(self):
		a = [{"item_code": "I1", "qty": 2.5}]
		b = [{"item_code": "I1", "qty": 1.0}]
		result = compare_two_array(a, b)
		self.assertEqual(len(result), 1)
		self.assertAlmostEqual(result[0]["qty"], 1.5)

	def test_decimal_decrease_returns_negative_delta(self):
		a = [{"item_code": "I1", "qty": 0.5}]
		b = [{"item_code": "I1", "qty": 2.0}]
		result = compare_two_array(a, b)
		self.assertAlmostEqual(result[0]["qty"], -1.5)

	def test_string_quantities_subtract_numerically(self):
		a = [{"item_code": "I1", "qty": "3"}]
		b = [{"item_code": "I1", "qty": "1.25"}]
		self.assertAlmostEqual(compare_two_array(a, b)[0]["qty"], 1.75)

	def test_integer_behaviour_preserved(self):
		a = [{"item_code": "I1", "qty": 3}, {"item_code": "I2", "qty": 1}]
		b = [{"item_code": "I1", "qty": 1}]
		result = compare_two_array(a, b)
		self.assertEqual([r["item_code"] for r in result], ["I1", "I2"])
		self.assertEqual(result[0]["qty"], 2)
		self.assertEqual(result[1]["qty"], 1)

	def test_empty_qty_is_treated_as_zero(self):
		a = [{"item_code": "I1", "qty": "2"}]
		b = [{"item_code": "I1", "qty": ""}]
		self.assertEqual(compare_two_array(a, b)[0]["qty"], 2)


class TestCreateCancelKotDocDecimal(unittest.TestCase):
	def _run(self, cancel_qty, invoice_qty=3):
		pos_invoice = frappe._dict(
			{"custom_ury_order_number": "ORD-1", "order_type": "Dine In", "custom_aggregator_id": None}
		)
		original_kot_doc = MagicMock()
		original_kot_doc.name = "KOT-001"
		original_kot_doc.kot_items = [frappe._dict({"item": "I1", "reservation_line_key": None})]
		kot_ref = MagicMock()
		kot_ref.name = "KOT-001"
		cancel_doc = MagicMock()
		cancel_doc.name = "CNCL-1"

		with patch(f"{GENERATE}.frappe.get_doc", side_effect=[pos_invoice, original_kot_doc, cancel_doc]), \
			patch(f"{GENERATE}.frappe.db.get_list", return_value=[kot_ref]), \
			patch(f"{GENERATE}.frappe.db.get_value", side_effect=["Room-1", "Rest-1", "MENU-1", "Course"]):
			create_cancel_kot_doc(
				"INV-1",
				"TABLE-1",
				[{"item_code": "I1", "item_name": "Item", "qty": cancel_qty, "comments": ""}],
				"Partially cancelled",
				"John",
				"",
				"PROF-1",
				"CNCL-",
				[{"item_code": "I1", "qty": invoice_qty}],
				"UNIT-1",
			)
		return cancel_doc.append.call_args[0][1]

	def test_decimal_cancel_is_not_truncated(self):
		row = self._run(-1.5)
		self.assertEqual(row["cancelled_qty"], 1.5)

	def test_small_fraction_is_not_truncated_to_zero(self):
		row = self._run(-0.25)
		self.assertEqual(row["cancelled_qty"], 0.25)

	def test_integer_cancel_unchanged(self):
		row = self._run(-2)
		self.assertEqual(row["cancelled_qty"], 2)

	def test_string_quantity_is_parsed(self):
		row = self._run("-1.5")
		self.assertEqual(row["cancelled_qty"], 1.5)

	def test_original_quantity_passes_through(self):
		row = self._run(-1.5, invoice_qty=2.5)
		self.assertEqual(row["quantity"], 2.5)


class TestWaiterPrintQuantities(unittest.TestCase):
	def setUp(self):
		patcher = patch(f"{PRINT}.frappe.get_precision", return_value=3)
		patcher.start()
		self.addCleanup(patcher.stop)

	def test_whole_quantities_stay_integers(self):
		for value in (2, 2.0, "2", "2.000", None, ""):
			result = _normalize_qty(value)
			self.assertIsInstance(result, int, repr(value))
		self.assertEqual(_normalize_qty(2.0), 2)
		self.assertEqual(_normalize_qty(None), 0)

	def test_decimals_are_kept(self):
		self.assertEqual(_normalize_qty(1.5), 1.5)
		self.assertEqual(_normalize_qty("0.25"), 0.25)

	def test_float_residue_is_rounded_to_site_precision(self):
		self.assertEqual(_normalize_qty(0.3 - 0.1 - 0.2), 0)
		self.assertEqual(_normalize_qty(0.1 + 0.2), 0.3)

	def test_precision_comes_from_frappe_not_a_literal(self):
		with patch(f"{PRINT}.frappe.get_precision", return_value=2) as mock_precision:
			self.assertEqual(_normalize_qty(1.2345), 1.23)
		mock_precision.assert_called_with("URY KOT Items", "quantity")

	def _kot(self, kot_type, rows):
		return SimpleNamespace(type=kot_type, kot_items=[SimpleNamespace(**row) for row in rows])

	def _row(self, **kwargs):
		base = {"item": "I1", "item_name": "Item", "comments": "", "course": None,
			"quantity": 1, "cancelled_qty": 0}
		base.update(kwargs)
		return base

	def test_aggregate_add_rows_sums_decimals(self):
		kots = [
			self._kot("New Order", [self._row(quantity=0.5)]),
			self._kot("Order Modified", [self._row(quantity=1.25)]),
		]
		items = _aggregate_kot_items(kots)
		self.assertEqual(len(items), 1)
		self.assertEqual(items[0]["quantity"], 1.75)

	def test_aggregate_add_rows_sum_of_wholes_is_int(self):
		kots = [
			self._kot("New Order", [self._row(quantity="1.0")]),
			self._kot("Order Modified", [self._row(quantity=1.0)]),
		]
		items = _aggregate_kot_items(kots)
		self.assertEqual(items[0]["quantity"], 2)
		self.assertIsInstance(items[0]["quantity"], int)

	def test_aggregate_cancel_rows(self):
		kots = [self._kot("Partially cancelled", [self._row(quantity=3.5, cancelled_qty=1.5)])]
		items = _aggregate_kot_items(kots)
		self.assertEqual(items[0]["quantity"], 3.5)
		self.assertEqual(items[0]["cancelled_qty"], 1.5)

	def test_enrich_cancel_old_new(self):
		with patch(f"{PRINT}._get_invoice_item_qty_map", return_value={}):
			result = _enrich_item_display_fields(
				[{"item": "I1", "quantity": 3.5, "cancelled_qty": 1.5}], "INV"
			)
		self.assertEqual(result[0]["display_mode"], "old_new")
		self.assertEqual(result[0]["old_qty"], 3.5)
		self.assertEqual(result[0]["new_qty"], 2)
		self.assertIsInstance(result[0]["new_qty"], int)

	def test_enrich_full_cancel_clamps_at_zero(self):
		with patch(f"{PRINT}._get_invoice_item_qty_map", return_value={}):
			result = _enrich_item_display_fields(
				[{"item": "I1", "quantity": 1.5, "cancelled_qty": 2.0}], "INV"
			)
		self.assertEqual(result[0]["new_qty"], 0)

	def test_enrich_increase_of_decimal_quantity(self):
		qty_map = {("I1", ""): 2.5}
		with patch(f"{PRINT}._get_invoice_item_qty_map", return_value=qty_map):
			result = _enrich_item_display_fields([{"item": "I1", "quantity": 1.5}], "INV")
		self.assertEqual(result[0]["display_mode"], "old_new")
		self.assertEqual(result[0]["old_qty"], 1)
		self.assertEqual(result[0]["new_qty"], 2.5)

	def test_enrich_first_order_is_single_qty(self):
		qty_map = {("I1", ""): 0.5}
		with patch(f"{PRINT}._get_invoice_item_qty_map", return_value=qty_map):
			result = _enrich_item_display_fields([{"item": "I1", "quantity": 0.5}], "INV")
		self.assertEqual(result[0]["display_mode"], "single_qty")
		self.assertEqual(result[0]["old_qty"], 0)
		self.assertEqual(result[0]["new_qty"], 0.5)

	def test_enrich_float_residue_does_not_leak_into_old_qty(self):
		qty_map = {("I1", ""): 0.3}
		with patch(f"{PRINT}._get_invoice_item_qty_map", return_value=qty_map):
			result = _enrich_item_display_fields([{"item": "I1", "quantity": 0.1 + 0.2}], "INV")
		# 0.3 - 0.30000000000000004 is a negative residue; it must read as a first order.
		self.assertEqual(result[0]["display_mode"], "single_qty")

	def test_invoice_qty_map_keeps_decimals(self):
		rows = [{"item_code": "I1", "qty": 1.5, "comment": "x"}, {"item_code": "I2", "qty": 2.0, "comment": None}]
		with patch(f"{PRINT}.frappe.get_all", return_value=rows):
			qty_map = ury_waiter_print._get_invoice_item_qty_map("INV")
		self.assertEqual(qty_map[("I1", "x")], 1.5)
		self.assertEqual(qty_map[("I2", "")], 2)


if __name__ == "__main__":
	unittest.main()

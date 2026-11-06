# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Tests for the v3_44 pre-model-sync patch that validates URY KOT Items
quantity and cancelled_qty before they change from Data to Float.

The pure helpers are tested directly. `execute` is tested with every
`frappe.db` call mocked, so no site or database is needed and the module
also runs under plain `python -m unittest` (frappe is stubbed if absent).

Covered: integer, decimal, NULL, blank and non-numeric legacy values;
success path (NULL/blank -> 0); failure path (abort, nothing updated, counts
and sample rows in the message); idempotence; missing table; column already
numeric; rollback when an UPDATE fails.
"""

import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

try:
	import frappe  # noqa: F401
except ImportError:  # pragma: no cover - only without a Frappe environment
	sys.modules["frappe"] = MagicMock()

from ury.patches.v3_44 import validate_kot_item_quantity_before_float as patch_module
from ury.patches.v3_44.validate_kot_item_quantity_before_float import (
	BLANK,
	INVALID,
	NULL,
	VALID,
	InvalidKotQuantityError,
	classify_value,
	collect_issues,
	columns_to_convert,
	execute,
	format_error,
	validate_or_raise,
)

MODULE = "ury.patches.v3_44.validate_kot_item_quantity_before_float.frappe"


class TestClassifyValue(unittest.TestCase):
	def test_integer_strings_are_valid(self):
		for value in ("1", "12", "0", "+3", "-2", " 4 "):
			self.assertEqual(classify_value(value), VALID, value)

	def test_decimal_strings_are_valid(self):
		for value in ("1.5", "0.25", ".5", "2.", "0.123456789", "-0.5"):
			self.assertEqual(classify_value(value), VALID, value)

	def test_null(self):
		self.assertEqual(classify_value(None), NULL)

	def test_blank(self):
		for value in ("", " ", "   "):
			self.assertEqual(classify_value(value), BLANK, repr(value))

	def test_non_numeric_is_invalid(self):
		for value in ("abc", "1,5", "2 pcs", "1e3", "--1", "1.2.3", "NaN", "inf", "\t1", "1\n"):
			self.assertEqual(classify_value(value), INVALID, repr(value))

	def test_out_of_range_is_invalid(self):
		self.assertEqual(classify_value("1000000000000"), INVALID)
		self.assertEqual(classify_value("999999999999.999999999"), VALID)

	def test_native_numbers(self):
		self.assertEqual(classify_value(2), VALID)
		self.assertEqual(classify_value(1.5), VALID)
		self.assertEqual(classify_value(10**13), INVALID)


class TestCollectAndValidate(unittest.TestCase):
	def _rows(self):
		return [
			("r1", "K1", "quantity", "2"),
			("r2", "K1", "quantity", "1.5"),
			("r3", "K2", "quantity", ""),
			("r1", "K1", "cancelled_qty", None),
			("r2", "K1", "cancelled_qty", "0.5"),
			("r3", "K2", "cancelled_qty", None),
		]

	def test_counts_without_invalid_values(self):
		issues = collect_issues(self._rows())
		self.assertEqual(issues["quantity"][BLANK], 1)
		self.assertEqual(issues["quantity"][NULL], 0)
		self.assertEqual(issues["cancelled_qty"][NULL], 2)
		self.assertEqual(issues["quantity"][INVALID], 0)

	def test_validate_returns_issues_when_clean(self):
		issues = validate_or_raise(self._rows())
		self.assertEqual(issues["cancelled_qty"][NULL], 2)

	def test_validate_raises_with_counts_and_samples(self):
		rows = self._rows() + [
			("r4", "K3", "quantity", "abc"),
			("r5", "K3", "cancelled_qty", "2 pcs"),
			("r6", "K4", "cancelled_qty", "1,5"),
		]
		with self.assertRaises(InvalidKotQuantityError) as ctx:
			validate_or_raise(rows)
		message = str(ctx.exception)
		self.assertIn("Column quantity: 1 non-numeric", message)
		self.assertIn("Column cancelled_qty: 2 non-numeric", message)
		self.assertIn("row=r4 parent=K3 value='abc'", message)
		self.assertIn("row=r6 parent=K4 value='1,5'", message)
		self.assertIn("run bench migrate again", message)

	def test_sample_is_capped(self):
		rows = [(f"r{i}", "K", "quantity", "bad") for i in range(25)]
		message = format_error(collect_issues(rows), sample_size=10)
		self.assertIn("25 non-numeric", message)
		self.assertEqual(message.count("row=r"), 10)

	def test_columns_to_convert(self):
		self.assertEqual(
			columns_to_convert({"quantity": "varchar", "cancelled_qty": "varchar"}),
			["quantity", "cancelled_qty"],
		)
		self.assertEqual(columns_to_convert({"quantity": "decimal", "cancelled_qty": "varchar"}), ["cancelled_qty"])
		self.assertEqual(columns_to_convert({"quantity": "decimal", "cancelled_qty": "decimal"}), [])
		self.assertEqual(columns_to_convert({}), [])


class TestExecute(unittest.TestCase):
	def _setup(self, mock_frappe, table_exists=True, column_types=None, rows=None, update_error=None):
		"""Wire frappe.db.sql by statement type. Returns the list of UPDATE statements."""
		column_types = (
			{"quantity": "varchar", "cancelled_qty": "varchar"} if column_types is None else column_types
		)
		rows = rows or []
		updates = []
		mock_frappe.db.table_exists.return_value = table_exists

		def fake_sql(query, values=None, **kwargs):
			text = " ".join(query.split())
			if "information_schema" in text:
				return [
					SimpleNamespace(COLUMN_NAME=name, DATA_TYPE=data_type.upper())
					for name, data_type in column_types.items()
				]
			if text.startswith("SELECT name, parent"):
				column = text.split("`")[1]
				return [(name, parent, row[column]) for name, parent, row in rows]
			if text.startswith("UPDATE"):
				if update_error:
					raise update_error
				updates.append(text)
				return None
			raise AssertionError(f"unexpected SQL: {text}")

		mock_frappe.db.sql.side_effect = fake_sql
		return updates

	@patch(MODULE)
	def test_missing_table_is_noop(self, mock_frappe):
		updates = self._setup(mock_frappe, table_exists=False)
		execute()
		self.assertEqual(updates, [])
		mock_frappe.db.sql.assert_not_called()

	@patch(MODULE)
	def test_columns_already_float_is_noop(self, mock_frappe):
		updates = self._setup(
			mock_frappe, column_types={"quantity": "decimal", "cancelled_qty": "decimal"}
		)
		execute()
		self.assertEqual(updates, [])
		# Only the information_schema lookup ran; the table is never read.
		self.assertEqual(mock_frappe.db.sql.call_count, 1)

	@patch(MODULE)
	def test_clean_integer_and_decimal_values_need_no_update(self, mock_frappe):
		rows = [
			("r1", "K1", {"quantity": "2", "cancelled_qty": "0"}),
			("r2", "K1", {"quantity": "1.5", "cancelled_qty": "0.5"}),
		]
		updates = self._setup(mock_frappe, rows=rows)
		execute()
		self.assertEqual(updates, [])

	@patch(MODULE)
	def test_null_and_blank_are_set_to_zero(self, mock_frappe):
		rows = [
			("r1", "K1", {"quantity": "2", "cancelled_qty": None}),
			("r2", "K1", {"quantity": "", "cancelled_qty": ""}),
			("r3", "K2", {"quantity": "1.5", "cancelled_qty": "0.5"}),
		]
		updates = self._setup(mock_frappe, rows=rows)
		execute()
		self.assertEqual(len(updates), 2)
		self.assertIn("SET `quantity` = '0'", updates[0])
		self.assertIn("SET `cancelled_qty` = '0'", updates[1])
		for statement in updates:
			self.assertIn("IS NULL OR TRIM(", statement)
		mock_frappe.db.rollback.assert_not_called()

	@patch(MODULE)
	def test_only_columns_with_null_or_blank_are_updated(self, mock_frappe):
		rows = [("r1", "K1", {"quantity": "2", "cancelled_qty": None})]
		updates = self._setup(mock_frappe, rows=rows)
		execute()
		self.assertEqual(len(updates), 1)
		self.assertIn("`cancelled_qty`", updates[0])

	@patch(MODULE)
	def test_non_numeric_aborts_before_any_update(self, mock_frappe):
		rows = [
			("r1", "K1", {"quantity": "2", "cancelled_qty": None}),
			("r2", "K2", {"quantity": "abc", "cancelled_qty": "0"}),
		]
		updates = self._setup(mock_frappe, rows=rows)
		with self.assertRaises(InvalidKotQuantityError) as ctx:
			execute()
		self.assertEqual(updates, [], "no row may change when validation fails")
		self.assertIn("row=r2 parent=K2 value='abc'", str(ctx.exception))
		self.assertIn("Column quantity: 1 non-numeric", str(ctx.exception))

	@patch(MODULE)
	def test_invalid_value_in_second_column_blocks_update_of_first(self, mock_frappe):
		rows = [
			("r1", "K1", {"quantity": "", "cancelled_qty": "x"}),
		]
		updates = self._setup(mock_frappe, rows=rows)
		with self.assertRaises(InvalidKotQuantityError):
			execute()
		self.assertEqual(updates, [])

	@patch(MODULE)
	def test_update_failure_rolls_back_and_reraises(self, mock_frappe):
		rows = [("r1", "K1", {"quantity": "", "cancelled_qty": None})]
		self._setup(mock_frappe, rows=rows, update_error=RuntimeError("db gone"))
		with self.assertRaises(RuntimeError):
			execute()
		mock_frappe.db.rollback.assert_called_once()

	@patch(MODULE)
	def test_second_run_after_conversion_is_noop(self, mock_frappe):
		rows = [("r1", "K1", {"quantity": "", "cancelled_qty": None})]
		updates = self._setup(mock_frappe, rows=rows)
		execute()
		self.assertEqual(len(updates), 2)
		# Simulate the schema sync having made both columns decimal.
		updates = self._setup(
			mock_frappe, column_types={"quantity": "decimal", "cancelled_qty": "decimal"}
		)
		execute()
		self.assertEqual(updates, [])

	@patch(MODULE)
	def test_only_one_column_present(self, mock_frappe):
		rows = [("r1", "K1", {"quantity": None})]
		updates = self._setup(mock_frappe, column_types={"quantity": "varchar"}, rows=rows)
		execute()
		self.assertEqual(len(updates), 1)
		self.assertIn("`quantity`", updates[0])


class TestRegistration(unittest.TestCase):
	def test_registered_under_pre_model_sync(self):
		import configparser
		import os

		path = os.path.join(os.path.dirname(patch_module.__file__), "..", "..", "patches.txt")
		parser = configparser.ConfigParser(allow_no_value=True)
		parser.read(path)
		name = "ury.patches.v3_44.validate_kot_item_quantity_before_float"
		self.assertIn(name, parser["pre_model_sync"])
		self.assertNotIn(name, parser["post_model_sync"])


if __name__ == "__main__":
	unittest.main()

"""Tests for ury_fast_moving.get_fast_moving_items.

Tests cover:
- Default and custom window_days parameters
- Branch filtering
- Permission enforcement (require_manager)
- Sell rate calculation and sorting
- Edge cases (zero/negative window_days, float conversion)
- Result capping at 20 items
- SQL query parameter safety
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_fast_moving import get_fast_moving_items


MODULE = "ury.ury.api.ury_fast_moving"


class TestGetFastMovingItemsHappyPath(FrappeTestCase):
	"""Test normal operation with various parameters."""

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_default_window_days_single_day(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test with default window_days=1 (24 hours)."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = [
			{
				"item": "CAKE-001",
				"item_name": "Vanilla Cake",
				"qty_sold": 24.0,
			},
			{
				"item": "COFFEE-001",
				"item_name": "Espresso",
				"qty_sold": 12.0,
			},
		]

		result = get_fast_moving_items(window_days=1)

		# Verify require_manager was called (permission check)
		mock_require_manager.assert_called_once()

		# Verify add_to_date was called to calculate start_datetime
		mock_add_to_date.assert_called_once_with(
			"2026-09-09 10:00:00", days=-1
		)

		# Verify frappe.db.sql was called
		mock_sql.assert_called_once()
		query, params = mock_sql.call_args[0][:2]

		# Verify query structure: should have proper JOINs and WHERE
		self.assertIn("tabPOS Invoice", query)
		self.assertIn("tabPOS Invoice Item", query)
		self.assertIn("tabItem", query)
		self.assertIn("`status` IN", query)
		self.assertIn("`docstatus` = 1", query)
		self.assertIn("ORDER BY qty_sold DESC", query)

		# Verify parameterization (no direct date string in query)
		self.assertIn("%(start_datetime)s", query)
		self.assertEqual(params["start_datetime"], "2026-09-08 10:00:00")

		# Verify sell_rate_per_hour calculation (qty_sold / 24 hours)
		self.assertEqual(result[0]["item"], "CAKE-001")
		self.assertEqual(result[0]["qty_sold"], 24.0)
		self.assertEqual(result[0]["sell_rate_per_hour"], 1.0)  # 24 / 24

		self.assertEqual(result[1]["item"], "COFFEE-001")
		self.assertEqual(result[1]["qty_sold"], 12.0)
		self.assertEqual(result[1]["sell_rate_per_hour"], 0.5)  # 12 / 24

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_seven_day_window(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test with window_days=7 (168 hours)."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-02 10:00:00"
		mock_sql.return_value = [
			{
				"item": "ITEM-001",
				"item_name": "Item One",
				"qty_sold": 168.0,
			},
		]

		result = get_fast_moving_items(window_days=7)

		mock_add_to_date.assert_called_once_with(
			"2026-09-09 10:00:00", days=-7
		)

		# Verify sell_rate_per_hour calculation over 7 days (168 hours)
		self.assertEqual(result[0]["sell_rate_per_hour"], 1.0)  # 168 / 168

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_with_branch_filter(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test query when branch parameter is provided."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = [
			{
				"item": "BRANCH-ITEM-001",
				"item_name": "Branch Specific Item",
				"qty_sold": 10.0,
			},
		]

		result = get_fast_moving_items(window_days=1, branch="Branch A")

		# Verify SQL was called with branch parameter
		query, params = mock_sql.call_args[0][:2]

		# Branch filter should be in WHERE clause
		self.assertIn("%(branch)s", query)
		self.assertIn("a.`branch` = %(branch)s", query)
		self.assertEqual(params["branch"], "Branch A")

		# Verify start_datetime is still parameterized
		self.assertIn("%(start_datetime)s", query)

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_without_branch_filter(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test query when branch parameter is None (all branches)."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = []

		get_fast_moving_items(window_days=1, branch=None)

		query, params = mock_sql.call_args[0][:2]

		# No branch parameter in WHERE clause
		self.assertNotIn("%(branch)s", query)
		self.assertNotIn("a.`branch` = ", query)

		# But still has start_datetime filter
		self.assertIn("%(start_datetime)s", query)
		self.assertIn("start_datetime", params)


class TestGetFastMovingItemsEdgeCases(FrappeTestCase):
	"""Test boundary conditions and edge cases."""

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_window_days_zero_normalized_to_one(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that window_days=0 is normalized to 1."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = []

		get_fast_moving_items(window_days=0)

		# Should call add_to_date with days=-1 (normalized from 0)
		mock_add_to_date.assert_called_once_with(
			"2026-09-09 10:00:00", days=-1
		)

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_window_days_negative_normalized_to_one(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that negative window_days is normalized to 1."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = []

		get_fast_moving_items(window_days=-5)

		# Should call add_to_date with days=-1 (normalized from -5)
		mock_add_to_date.assert_called_once_with(
			"2026-09-09 10:00:00", days=-1
		)

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_window_days_float_converted_to_int(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that float window_days is converted to int."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-06 10:00:00"
		mock_sql.return_value = []

		get_fast_moving_items(window_days=3.7)

		# Should call add_to_date with days=-3 (int conversion of 3.7)
		mock_add_to_date.assert_called_once_with(
			"2026-09-09 10:00:00", days=-3
		)


class TestGetFastMovingItemsSellRateCalculation(FrappeTestCase):
	"""Test sell rate calculation and sorting."""

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_sell_rate_per_hour_calculation(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that sell_rate_per_hour is calculated correctly."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-05 10:00:00"  # 4 days = 96 hours
		mock_sql.return_value = [
			{"item": "ITEM-A", "item_name": "Item A", "qty_sold": 96.0},
			{"item": "ITEM-B", "item_name": "Item B", "qty_sold": 48.0},
			{"item": "ITEM-C", "item_name": "Item C", "qty_sold": 24.0},
		]

		result = get_fast_moving_items(window_days=4)

		self.assertEqual(result[0]["sell_rate_per_hour"], 1.0)  # 96 / 96
		self.assertEqual(result[1]["sell_rate_per_hour"], 0.5)  # 48 / 96
		self.assertEqual(result[2]["sell_rate_per_hour"], 0.25)  # 24 / 96

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_results_sorted_by_sell_rate_descending(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that results are sorted by sell_rate_per_hour in descending order."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		# SQL returns unsorted (qty_sold DESC), but sell rates differ due to
		# rounding after division
		mock_sql.return_value = [
			{"item": "ITEM-C", "item_name": "Item C", "qty_sold": 5.0},
			{"item": "ITEM-A", "item_name": "Item A", "qty_sold": 24.0},
			{"item": "ITEM-B", "item_name": "Item B", "qty_sold": 12.0},
		]

		result = get_fast_moving_items(window_days=1)

		# Verify sorted by sell_rate_per_hour descending
		sell_rates = [r["sell_rate_per_hour"] for r in result]
		self.assertEqual(sell_rates, sorted(sell_rates, reverse=True))

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_sell_rate_rounded_to_three_decimals(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that sell_rate_per_hour is rounded to 3 decimal places."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = [
			{"item": "ITEM-001", "item_name": "Item One", "qty_sold": 1.0},
		]

		result = get_fast_moving_items(window_days=1)

		# 1.0 / 24 = 0.041666... should be rounded to 0.042
		self.assertEqual(result[0]["sell_rate_per_hour"], 0.042)

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_qty_sold_none_treated_as_zero(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that None qty_sold is treated as 0."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = [
			{"item": "ITEM-001", "item_name": "Item One", "qty_sold": None},
		]

		result = get_fast_moving_items(window_days=1)

		self.assertEqual(result[0]["qty_sold"], 0)
		self.assertEqual(result[0]["sell_rate_per_hour"], 0)


class TestGetFastMovingItemsResultLimits(FrappeTestCase):
	"""Test result capping and limits."""

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_results_capped_at_twenty_items(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that only top 20 items are returned."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		# Return 25 items from SQL
		mock_sql.return_value = [
			{
				"item": f"ITEM-{i:03d}",
				"item_name": f"Item {i}",
				"qty_sold": float(100 - i),
			}
			for i in range(25)
		]

		result = get_fast_moving_items(window_days=1)

		# Should return only 20
		self.assertEqual(len(result), 20)

		# Should be the top 20 by sell rate
		self.assertEqual(result[0]["item"], "ITEM-000")  # qty_sold=100
		self.assertEqual(result[19]["item"], "ITEM-019")  # qty_sold=81

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_empty_result_set(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test handling of empty result set."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = []

		result = get_fast_moving_items(window_days=1)

		self.assertEqual(result, [])

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_fewer_than_twenty_items_returned_as_is(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that fewer than 20 items are returned as-is."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = [
			{"item": f"ITEM-{i:03d}", "item_name": f"Item {i}", "qty_sold": float(10 - i)}
			for i in range(5)
		]

		result = get_fast_moving_items(window_days=1)

		self.assertEqual(len(result), 5)


class TestGetFastMovingItemsPermissions(FrappeTestCase):
	"""Test permission enforcement."""

	@patch(f"{MODULE}.require_manager")
	def test_permission_denied(self, mock_require_manager):
		"""Test that permission denial is propagated."""
		mock_require_manager.side_effect = frappe.PermissionError(
			"You do not have permission to access this report."
		)

		with self.assertRaises(frappe.PermissionError):
			get_fast_moving_items(window_days=1)

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_permission_check_happens_before_query(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that permission is checked before any database query."""
		mock_require_manager.side_effect = frappe.PermissionError("No permission")

		with self.assertRaises(frappe.PermissionError):
			get_fast_moving_items(window_days=1)

		# SQL should never be called
		mock_sql.assert_not_called()


class TestGetFastMovingItemsQuerySafety(FrappeTestCase):
	"""Test SQL query parameterization and safety."""

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_query_uses_parameterized_statements(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that query uses parameterized statements, not string interpolation."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = []

		get_fast_moving_items(window_days=1, branch="Branch A")

		query, params = mock_sql.call_args[0][:2]

		# Verify parameters are used, not direct values
		self.assertIn("%(start_datetime)s", query)
		self.assertIn("%(branch)s", query)

		# Verify no direct date string in query
		self.assertNotIn("2026-09-08", query)
		self.assertNotIn("2026-09-09", query)

		# Verify no branch string in query
		self.assertNotIn("Branch A", query)

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_query_status_filter(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that query filters for correct POS Invoice statuses."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = []

		get_fast_moving_items(window_days=1)

		query, params = mock_sql.call_args[0][:2]

		# Query should filter for Consolidated and Paid status
		self.assertIn('"Consolidated"', query)
		self.assertIn('"Paid"', query)

		# Should require docstatus = 1 (submitted)
		self.assertIn("`docstatus` = 1", query)

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_query_includes_necessary_joins(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that query includes all necessary table joins."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = []

		get_fast_moving_items(window_days=1)

		query, params = mock_sql.call_args[0][:2]

		# Should JOIN to POS Invoice Item on parent
		self.assertIn("INNER JOIN", query)
		self.assertIn("tabPOS Invoice Item", query)
		self.assertIn("a.`name` = b.`parent`", query)

		# Should LEFT JOIN to Item for item_name
		self.assertIn("LEFT JOIN", query)
		self.assertIn("tabItem", query)

		# Should group by item_code
		self.assertIn("GROUP BY b.`item_code`", query)

	@patch(f"{MODULE}.require_manager")
	@patch(f"{MODULE}.frappe.utils.now_datetime")
	@patch(f"{MODULE}.frappe.utils.add_to_date")
	@patch(f"{MODULE}.frappe.db.sql")
	def test_query_timestamp_comparison(
		self, mock_sql, mock_add_to_date, mock_now, mock_require_manager
	):
		"""Test that query uses TIMESTAMP for proper datetime comparison."""
		mock_now.return_value = "2026-09-09 10:00:00"
		mock_add_to_date.return_value = "2026-09-08 10:00:00"
		mock_sql.return_value = []

		get_fast_moving_items(window_days=1)

		query, params = mock_sql.call_args[0][:2]

		# Query should use TIMESTAMP to combine date and time for comparison
		self.assertIn("TIMESTAMP(a.`posting_date`, a.`posting_time`)", query)
		self.assertIn("TIMESTAMP(a.`posting_date`, a.`posting_time`) >=", query)

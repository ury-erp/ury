from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_dashboard import search_branch_items


class TestSearchBranchItems(FrappeTestCase):
	def _allow_search_access(self):
		"""Mock permissions and access checks for a valid in-branch user."""
		patches = [
			patch("ury.ury.api.ury_dashboard.frappe.has_permission", return_value=True),
			patch("ury.ury.api.ury_dashboard.frappe.db.get_value", return_value="Company A"),
			patch("ury.ury.api.ury_dashboard._has_dashboard_cross_branch_access", return_value=False),
			patch("ury.ury.api.ury_dashboard.getBranch", return_value="Branch A"),
		]
		for active_patch in patches:
			active_patch.start()
			self.addCleanup(active_patch.stop)

	def test_matching_role_in_branch_gets_results(self):
		"""Test that a valid in-branch user gets results."""
		self._allow_search_access()

		# Mock frappe.db.get_all for Item query.
		items = [
			{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
			{"item_code": "ITEM-2", "item_name": "Item Two", "stock_uom": "Kg"},
		]
		# Mock frappe.db.get_all for production config query (empty for now).
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[items, []],  # First call: items; second call: production config
		):
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(len(result), 2)
		self.assertEqual(result[0]["item_code"], "ITEM-1")
		self.assertEqual(result[0]["item_name"], "Item One")
		self.assertEqual(result[0]["stock_uom"], "Nos")
		self.assertIsNone(result[0]["department"])
		self.assertIsNone(result[0]["production_unit"])

	def test_out_of_branch_user_without_cross_branch_access_rejected(self):
		"""Test that users from another branch are rejected unless they have cross-branch access."""
		with patch(
			"ury.ury.api.ury_dashboard.frappe.has_permission", return_value=True
		), patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_value", return_value="Company A"
		), patch(
			"ury.ury.api.ury_dashboard._has_dashboard_cross_branch_access", return_value=False
		), patch(
			"ury.ury.api.ury_dashboard.getBranch", return_value="Branch B"
		):
			with self.assertRaises(frappe.PermissionError):
				search_branch_items("Branch A", "Company A")

	def test_query_string_filters_correctly(self):
		"""Test that query string filters items by item_code or item_name."""
		self._allow_search_access()

		items = [
			{"item_code": "COFFEE-LATTE", "item_name": "Latte", "stock_uom": "Nos"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[items, []],
		):
			result = search_branch_items("Branch A", "Company A", "LATTE", 25)

		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["item_code"], "COFFEE-LATTE")

	def test_disabled_items_are_excluded(self):
		"""Test that disabled items are excluded from results."""
		self._allow_search_access()

		# Mock should return empty since disabled items are filtered out.
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[[], []],
		) as get_all:
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(len(result), 0)
		# Verify that the filters included disabled=0.
		first_call_filters = get_all.call_args_list[0][1]["filters"]
		self.assertEqual(first_call_filters.get("disabled"), 0)

	def test_limit_is_capped_at_100(self):
		"""Test that the limit parameter is capped at 100 to prevent abuse."""
		self._allow_search_access()

		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[[], []],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", limit=500)

		# Verify that limit was capped at 100.
		first_call_limit = get_all.call_args_list[0][1]["limit_page_length"]
		self.assertEqual(first_call_limit, 100)

	def test_production_config_attached_to_results(self):
		"""Test that department/production_unit from URY Item Production Configuration are attached."""
		self._allow_search_access()

		items = [
			{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
		]
		config = [
			{
				"item": "ITEM-1",
				"department": "Kitchen",
				"production_unit": "Line A",
			},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[items, config],
		):
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["department"], "Kitchen")
		self.assertEqual(result[0]["production_unit"], "Line A")

	def test_production_config_fallback_to_none(self):
		"""Test that missing production_unit/department fall back to None."""
		self._allow_search_access()

		items = [
			{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
		]
		# No production config for this item.
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[items, []],
		):
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(len(result), 1)
		self.assertIsNone(result[0]["department"])
		self.assertIsNone(result[0]["production_unit"])

	def test_results_ordered_by_item_name(self):
		"""Test that results are ordered by item_name."""
		self._allow_search_access()

		items = [
			{"item_code": "ITEM-1", "item_name": "Zebra Item", "stock_uom": "Nos"},
			{"item_code": "ITEM-2", "item_name": "Apple Item", "stock_uom": "Nos"},
			{"item_code": "ITEM-3", "item_name": "Mango Item", "stock_uom": "Nos"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[items, []],
		) as get_all:
			result = search_branch_items("Branch A", "Company A", "", 25)

		# Verify that the query asked for order_by="item_name asc".
		first_call_order_by = get_all.call_args_list[0][1]["order_by"]
		self.assertEqual(first_call_order_by, "item_name asc")

	def test_missing_branch_fails_closed(self):
		"""Test that missing branch parameter is rejected."""
		with self.assertRaises(frappe.ValidationError):
			search_branch_items("", "Company A")

	def test_permission_denial_fails_before_query(self):
		"""Test that permission denial fails before querying items."""
		with patch(
			"ury.ury.api.ury_dashboard.frappe.has_permission", return_value=False
		) as has_permission, patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all"
		) as get_all:
			with self.assertRaises(frappe.PermissionError):
				search_branch_items("Branch A", "Company A")

		has_permission.assert_called_once_with("POS Invoice", "read")
		get_all.assert_not_called()

	def test_company_mismatch_fails_before_query(self):
		"""Test that company mismatch fails before querying items."""
		with patch(
			"ury.ury.api.ury_dashboard.frappe.has_permission", return_value=True
		), patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_value", return_value="Company B"
		), patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all"
		) as get_all:
			with self.assertRaises(frappe.PermissionError):
				search_branch_items("Branch A", "Company A")

		get_all.assert_not_called()

	def test_empty_query_string_returns_all_non_disabled_items(self):
		"""Test that an empty query string returns all non-disabled items."""
		self._allow_search_access()

		items = [
			{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
			{"item_code": "ITEM-2", "item_name": "Item Two", "stock_uom": "Nos"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[items, []],
		) as get_all:
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(len(result), 2)
		# Verify that filters did NOT include the query-based filter.
		first_call_filters = get_all.call_args_list[0][1]["filters"]
		self.assertEqual(first_call_filters, {"disabled": 0})

	def test_uses_ignore_permissions_for_item_query(self):
		"""Test that the Item query uses ignore_permissions=True."""
		self._allow_search_access()

		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[[], []],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", 25)

		# Verify that the first call (Item query) used ignore_permissions=True.
		first_call_kwargs = get_all.call_args_list[0][1]
		self.assertTrue(first_call_kwargs.get("ignore_permissions"))

	def test_production_config_query_validates_branch_scope(self):
		"""Test that production config query filters by branch."""
		self._allow_search_access()

		items = [
			{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[items, []],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", 25)

		# Verify that the second call (production config) filtered by branch.
		second_call_filters = get_all.call_args_list[1][1]["filters"]
		self.assertIn("branch", second_call_filters)
		self.assertEqual(second_call_filters["branch"], "Branch A")

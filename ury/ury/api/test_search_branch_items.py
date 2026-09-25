from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_dashboard import search_branch_items


def _branch_company_lookup(company_value):
	"""A `frappe.db.get_value` side_effect that answers ONLY this module's
	own `frappe.db.get_value("Branch", branch, "company")` lookup with
	`company_value`, delegating every other call to the real
	implementation.

	Running inside a real `FrappeTestCase` (a live site, not a bare mock),
	Frappe's own internals -- permission checks, DocType meta caching,
	savepoint bookkeeping, etc. -- call the real `frappe.db.get_value`
	many times during a single test, often with a list of `fields` and
	expecting a dict back. A bare `patch(..., return_value="Company A")`
	answers ALL of those calls with that one string too, and whichever
	internal caller then does `result.get(...)` on it blows up with
	`AttributeError: 'str' object has no attribute 'get'` -- unrelated to
	anything the test itself is exercising. Scoping the mock to the exact
	(doctype, fieldname) this module calls keeps every other caller
	talking to the real database.
	"""
	real_get_value = frappe.db.get_value

	def _side_effect(*args, **kwargs):
		doctype = args[0] if args else kwargs.get("doctype")
		fieldname = args[2] if len(args) > 2 else kwargs.get("fieldname")
		if doctype == "Branch" and fieldname == "company":
			return company_value
		return real_get_value(*args, **kwargs)

	return _side_effect


class TestSearchBranchItems(FrappeTestCase):
	def _allow_search_access(self):
		"""Mock permissions and access checks for a valid in-branch user."""
		patches = [
			patch("ury.ury.api.ury_dashboard.frappe.has_permission", return_value=True),
			patch(
				"ury.ury.api.ury_dashboard.frappe.db.get_value",
				side_effect=_branch_company_lookup("Company A"),
			),
			patch("ury.ury.api.ury_dashboard._has_dashboard_cross_branch_access", return_value=False),
			patch("ury.ury.api.ury_dashboard.getBranch", return_value="Branch A"),
			# search_branch_items does a local
			# `from ury.ury.api.ury_production_settings import
			# require_active_menu_for_planning` INSIDE the function body, so
			# it must be patched on its defining module (a patch on
			# `ury.ury.api.ury_dashboard.require_active_menu_for_planning`
			# would never be seen -- that name isn't bound there until the
			# call happens). Left unmocked, this defaults to True (no Single
			# value has ever been saved on a fresh site) and the function
			# then issues *real*, unmocked `frappe.get_all("URY Menu", ...)`
			# / `frappe.get_all("URY Menu Item", ...)` queries scoped to
			# fake branches like "Branch A" that don't exist on a live
			# bench -- those real queries return no rows, so every
			# configured item gets filtered out as "not on an enabled
			# menu" and every test here that expects real results back
			# would get an empty list instead. These tests are about the
			# search/filter/permission logic, not menu-gating, so that
			# separate policy is turned off here.
			patch(
				"ury.ury.api.ury_production_settings.require_active_menu_for_planning",
				return_value=False,
			),
		]
		for active_patch in patches:
			active_patch.start()
			self.addCleanup(active_patch.stop)

	def test_matching_role_in_branch_gets_results(self):
		"""Test that a valid in-branch user gets results."""
		self._allow_search_access()

		# First call: production config for the branch (drives the allowed
		# item-code set). Second call: Item, scoped to that set.
		config = [
			{"item": "ITEM-1", "department": None, "production_unit": None},
			{"item": "ITEM-2", "department": None, "production_unit": None},
		]
		items = [
			{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
			{"item_code": "ITEM-2", "item_name": "Item Two", "stock_uom": "Kg"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, items],
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
			"ury.ury.api.ury_dashboard.frappe.db.get_value",
			side_effect=_branch_company_lookup("Company A"),
		), patch(
			"ury.ury.api.ury_dashboard._has_dashboard_cross_branch_access", return_value=False
		), patch(
			"ury.ury.api.ury_dashboard.getBranch", return_value="Branch B"
		):
			with self.assertRaises(frappe.PermissionError):
				search_branch_items("Branch A", "Company A")

	def test_query_string_uses_or_filters_not_pipe_syntax(self):
		"""Regression test for bug 1: a non-empty query must be passed via the
		real `or_filters=` kwarg, never as an invalid "|item_code|item_name"
		dict filter key (which is not valid Frappe filter syntax and 500s)."""
		self._allow_search_access()

		config = [{"item": "COFFEE-LATTE", "department": None, "production_unit": None}]
		items = [
			{"item_code": "COFFEE-LATTE", "item_name": "Latte", "stock_uom": "Nos"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, items],
		) as get_all:
			result = search_branch_items("Branch A", "Company A", "LATTE", 25)

		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["item_code"], "COFFEE-LATTE")

		item_call_kwargs = get_all.call_args_list[1][1]
		filters = item_call_kwargs["filters"]

		# No invalid pipe-joined key anywhere in the filters dict.
		for key in filters:
			self.assertNotIn("|", key)

		# The OR-match must be expressed via or_filters=, matching the
		# established pattern in ury_pos/api.py and ury_order.py.
		or_filters = item_call_kwargs.get("or_filters")
		self.assertIsNotNone(or_filters)
		self.assertEqual(or_filters.get("item_code"), ["like", "%LATTE%"])
		self.assertEqual(or_filters.get("item_name"), ["like", "%LATTE%"])

	def test_disabled_items_are_excluded(self):
		"""Test that disabled items are excluded from results."""
		self._allow_search_access()

		config = [{"item": "ITEM-1", "department": None, "production_unit": None}]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, []],
		) as get_all:
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(len(result), 0)
		# Verify that the filters included disabled=0 on the Item query.
		item_call_filters = get_all.call_args_list[1][1]["filters"]
		self.assertEqual(item_call_filters.get("disabled"), 0)

	def test_limit_is_capped_at_100(self):
		"""Test that the limit parameter is capped at 100 to prevent abuse."""
		self._allow_search_access()

		config = [{"item": "ITEM-1", "department": None, "production_unit": None}]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, []],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", limit=500)

		# Verify that limit was capped at 100 on the Item query.
		item_call_limit = get_all.call_args_list[1][1]["limit_page_length"]
		self.assertEqual(item_call_limit, 100)

	def test_limit_non_numeric_falls_back_to_default(self):
		"""Regression test for bug 3: a non-numeric limit must not raise
		ValueError; it should fall back to the default of 25."""
		self._allow_search_access()

		config = [{"item": "ITEM-1", "department": None, "production_unit": None}]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, []],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", limit="not-a-number")

		item_call_limit = get_all.call_args_list[1][1]["limit_page_length"]
		self.assertEqual(item_call_limit, 25)

	def test_limit_negative_clamped_to_floor(self):
		"""Regression test for bug 3: a negative limit must be clamped to a
		floor of 1, not passed through as-is or produce an empty page size."""
		self._allow_search_access()

		config = [{"item": "ITEM-1", "department": None, "production_unit": None}]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, []],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", limit=-5)

		item_call_limit = get_all.call_args_list[1][1]["limit_page_length"]
		self.assertEqual(item_call_limit, 1)

	def test_production_config_attached_to_results(self):
		"""Test that department/production_unit from URY Item Production Configuration are attached."""
		self._allow_search_access()

		config = [
			{
				"item": "ITEM-1",
				"department": "Kitchen",
				"production_unit": "Line A",
			},
		]
		items = [
			{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, items],
		):
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["department"], "Kitchen")
		self.assertEqual(result[0]["production_unit"], "Line A")

	def test_production_config_fallback_to_none(self):
		"""Test that missing production_unit/department fall back to None."""
		self._allow_search_access()

		config = [{"item": "ITEM-1", "department": None, "production_unit": None}]
		items = [
			{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, items],
		):
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(len(result), 1)
		self.assertIsNone(result[0]["department"])
		self.assertIsNone(result[0]["production_unit"])

	def test_results_ordered_by_item_name(self):
		"""Test that results are ordered by item_name."""
		self._allow_search_access()

		config = [
			{"item": "ITEM-1", "department": None, "production_unit": None},
			{"item": "ITEM-2", "department": None, "production_unit": None},
			{"item": "ITEM-3", "department": None, "production_unit": None},
		]
		items = [
			{"item_code": "ITEM-1", "item_name": "Zebra Item", "stock_uom": "Nos"},
			{"item_code": "ITEM-2", "item_name": "Apple Item", "stock_uom": "Nos"},
			{"item_code": "ITEM-3", "item_name": "Mango Item", "stock_uom": "Nos"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, items],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", 25)

		# Verify that the query asked for order_by="item_name asc" on the Item query.
		item_call_order_by = get_all.call_args_list[1][1]["order_by"]
		self.assertEqual(item_call_order_by, "item_name asc")

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
			"ury.ury.api.ury_dashboard.frappe.db.get_value",
			side_effect=_branch_company_lookup("Company B"),
		), patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all"
		) as get_all:
			with self.assertRaises(frappe.PermissionError):
				search_branch_items("Branch A", "Company A")

		get_all.assert_not_called()

	def test_empty_query_string_returns_all_non_disabled_items(self):
		"""Test that an empty query string returns all non-disabled items."""
		self._allow_search_access()

		config = [
			{"item": "ITEM-1", "department": None, "production_unit": None},
			{"item": "ITEM-2", "department": None, "production_unit": None},
		]
		items = [
			{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
			{"item_code": "ITEM-2", "item_name": "Item Two", "stock_uom": "Nos"},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, items],
		) as get_all:
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(len(result), 2)
		# Verify that no or_filters (query-based OR match) were passed, and
		# that filters did not include a query-based key.
		item_call_kwargs = get_all.call_args_list[1][1]
		self.assertNotIn("or_filters", item_call_kwargs)
		self.assertEqual(item_call_kwargs["filters"].get("disabled"), 0)

	def test_uses_ignore_permissions_for_item_query(self):
		"""Test that the Item query uses ignore_permissions=True."""
		self._allow_search_access()

		config = [{"item": "ITEM-1", "department": None, "production_unit": None}]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, []],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", 25)

		# Verify that the Item query (second call) used ignore_permissions=True.
		item_call_kwargs = get_all.call_args_list[1][1]
		self.assertTrue(item_call_kwargs.get("ignore_permissions"))

	def test_production_config_query_scoped_to_branch(self):
		"""Test that the production config query (which now drives the
		allowed item-code set) filters by branch."""
		self._allow_search_access()

		config = [{"item": "ITEM-1", "department": None, "production_unit": None}]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, []],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", 25)

		# First call is the production config query, scoped to this branch.
		config_call_filters = get_all.call_args_list[0][1]["filters"]
		self.assertEqual(config_call_filters, {"branch": "Branch A"})

	def test_no_branch_leakage_when_branch_has_no_configured_items(self):
		"""Regression test for bug 2: if a branch has no
		URY Item Production Configuration rows, the endpoint must return an
		empty list rather than falling through to a site-wide Item query
		(which would leak the entire catalog, including other
		companies'/branches' items, raw materials, and packaging)."""
		self._allow_search_access()

		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[[]],
		) as get_all:
			result = search_branch_items("Branch A", "Company A", "", 25)

		self.assertEqual(result, [])
		# Only the production config lookup ran; the Item master was never
		# queried, so no cross-branch/cross-company item data could leak.
		self.assertEqual(get_all.call_count, 1)

	def test_item_query_scoped_to_branch_configured_item_codes(self):
		"""Regression test for bug 2: the Item query must restrict
		item_code to the set of items configured for this specific branch,
		not the whole site catalog."""
		self._allow_search_access()

		config = [
			{"item": "ITEM-1", "department": None, "production_unit": None},
			{"item": "ITEM-2", "department": None, "production_unit": None},
		]
		with patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			side_effect=[config, []],
		) as get_all:
			search_branch_items("Branch A", "Company A", "", 25)

		item_call_filters = get_all.call_args_list[1][1]["filters"]
		self.assertEqual(item_call_filters.get("item_code"), ["in", ["ITEM-1", "ITEM-2"]])

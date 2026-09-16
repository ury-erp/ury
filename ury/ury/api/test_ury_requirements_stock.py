"""Unit tests for ury.ury.api.ury_requirements_stock."""

import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_requirements_stock import get_plan_stock_on_hand

MODULE = "ury.ury.api.ury_requirements_stock"


class TestGetPlanStockOnHandGuards(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	@patch(f"{MODULE}.require_manager")
	def test_requires_manager(self, mock_require_manager):
		mock_require_manager.side_effect = frappe.PermissionError
		with self.assertRaises(frappe.PermissionError):
			get_plan_stock_on_hand(branch="Branch1", items=[])
		mock_require_manager.assert_called_once()

	@patch(f"{MODULE}.require_manager")
	def test_returns_empty_when_branch_missing(self, mock_require_manager):
		self.assertEqual(get_plan_stock_on_hand(branch=None, items=[]), [])

	@patch(f"{MODULE}.require_manager")
	def test_returns_empty_when_branch_is_all(self, mock_require_manager):
		self.assertEqual(get_plan_stock_on_hand(branch="all", items=[]), [])

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_returns_empty_when_no_pos_profile_warehouse(self, mock_require_manager, mock_get_value):
		mock_get_value.return_value = None
		self.assertEqual(
			get_plan_stock_on_hand(branch="Branch1", items=[{"item_code": "ITEM-1"}]), []
		)

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_returns_empty_when_pos_profile_missing_company(self, mock_require_manager, mock_get_value):
		mock_get_value.return_value = frappe._dict({"warehouse": "WH-1", "company": None})
		self.assertEqual(
			get_plan_stock_on_hand(branch="Branch1", items=[{"item_code": "ITEM-1"}]), []
		)


class TestGetPlanStockOnHandResolution(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.cache().delete_value(self._cache_key())

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.cache().delete_value(self._cache_key())

	def _cache_key(self, branch="Branch1", items=None):
		import hashlib

		items = items or []
		digest = hashlib.sha256(json.dumps(items, sort_keys=True, default=str).encode("utf-8")).hexdigest()
		return f"ury_requirements_stock:{branch}:{digest}"

	@patch(f"{MODULE}.get_allocatable_qty")
	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_resolves_department_warehouse_when_configured(
		self, mock_require_manager, mock_get_value, mock_get_all, mock_get_allocatable_qty
	):
		def get_value_side_effect(doctype, *args, **kwargs):
			if doctype == "POS Profile":
				return frappe._dict({"warehouse": "WH-CENTRAL", "company": "Test Co"})
			if doctype == "Item":
				return 12.5
			return None

		mock_get_value.side_effect = get_value_side_effect
		mock_get_all.return_value = [
			frappe._dict({"name": "Kitchen", "department_warehouse": "WH-KITCHEN"})
		]
		mock_get_allocatable_qty.return_value = {
			"bin_actual_qty": 10,
			"bin_projected_qty": 8,
			"allocatable_qty": 6,
		}

		items = [{"item_code": "ITEM-1", "department": "Kitchen"}]
		result = get_plan_stock_on_hand(branch="Branch1", items=items)

		self.assertEqual(len(result), 1)
		row = result[0]
		self.assertEqual(row["warehouse"], "WH-KITCHEN")
		self.assertEqual(row["resolved_from"], "department")
		self.assertEqual(row["actual_qty"], 10)
		self.assertEqual(row["projected_qty"], 8)
		self.assertEqual(row["allocatable_qty"], 6)
		self.assertEqual(row["valuation_rate"], 12.5)
		mock_get_allocatable_qty.assert_called_once_with("ITEM-1", "WH-KITCHEN", "Test Co")

	@patch(f"{MODULE}.get_allocatable_qty")
	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_falls_back_to_pos_profile_warehouse_when_no_department_match(
		self, mock_require_manager, mock_get_value, mock_get_all, mock_get_allocatable_qty
	):
		mock_get_value.side_effect = lambda doctype, *a, **k: (
			frappe._dict({"warehouse": "WH-CENTRAL", "company": "Test Co"})
			if doctype == "POS Profile"
			else 0.0
		)
		mock_get_all.return_value = []
		mock_get_allocatable_qty.return_value = {
			"bin_actual_qty": 1,
			"bin_projected_qty": 1,
			"allocatable_qty": 1,
		}

		items = [{"item_code": "ITEM-2", "department": "Bar"}]
		result = get_plan_stock_on_hand(branch="Branch1", items=items)

		self.assertEqual(result[0]["warehouse"], "WH-CENTRAL")
		self.assertEqual(result[0]["resolved_from"], "pos_profile")

	@patch(f"{MODULE}.get_allocatable_qty")
	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_falls_back_to_pos_profile_warehouse_when_no_department_given(
		self, mock_require_manager, mock_get_value, mock_get_all, mock_get_allocatable_qty
	):
		mock_get_value.side_effect = lambda doctype, *a, **k: (
			frappe._dict({"warehouse": "WH-CENTRAL", "company": "Test Co"})
			if doctype == "POS Profile"
			else 0.0
		)
		mock_get_all.return_value = []
		mock_get_allocatable_qty.return_value = {
			"bin_actual_qty": 0,
			"bin_projected_qty": 0,
			"allocatable_qty": 0,
		}

		items = [{"item_code": "ITEM-3"}]
		result = get_plan_stock_on_hand(branch="Branch1", items=items)

		self.assertEqual(result[0]["warehouse"], "WH-CENTRAL")
		self.assertEqual(result[0]["resolved_from"], "pos_profile")
		self.assertIsNone(result[0]["department"])

	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_skips_items_without_item_code(self, mock_require_manager, mock_get_value, mock_get_all):
		mock_get_value.return_value = frappe._dict({"warehouse": "WH-1", "company": "Co"})
		mock_get_all.return_value = []

		result = get_plan_stock_on_hand(branch="Branch1", items=[{"department": "Kitchen"}])
		self.assertEqual(result, [])

	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_parses_items_from_json_string(self, mock_require_manager, mock_get_value, mock_get_all):
		mock_get_value.return_value = None
		mock_get_all.return_value = []

		# With no POS profile warehouse, fails closed to [] regardless of items --
		# this exercises the parse_json(items) code path without needing stock mocks.
		result = get_plan_stock_on_hand(
			branch="Branch1", items=json.dumps([{"item_code": "ITEM-1"}])
		)
		self.assertEqual(result, [])

	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_defaults_items_to_empty_list_when_falsy(self, mock_require_manager, mock_get_value, mock_get_all):
		mock_get_value.return_value = frappe._dict({"warehouse": "WH-1", "company": "Co"})
		mock_get_all.return_value = []

		self.assertEqual(get_plan_stock_on_hand(branch="Branch1", items=None), [])

	@patch(f"{MODULE}.frappe.cache")
	@patch(f"{MODULE}.get_allocatable_qty")
	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_caches_result_with_short_ttl(
		self, mock_require_manager, mock_get_value, mock_get_all, mock_get_allocatable_qty, mock_cache
	):
		mock_get_value.side_effect = lambda doctype, *a, **k: (
			frappe._dict({"warehouse": "WH-CENTRAL", "company": "Test Co"})
			if doctype == "POS Profile"
			else 5.0
		)
		mock_get_all.return_value = []
		mock_get_allocatable_qty.return_value = {
			"bin_actual_qty": 2,
			"bin_projected_qty": 2,
			"allocatable_qty": 2,
		}
		cache_backend = MagicMock()
		cache_backend.get_value.return_value = None
		mock_cache.return_value = cache_backend

		items = [{"item_code": "ITEM-CACHE"}]
		result = get_plan_stock_on_hand(branch="Branch1", items=items)

		cache_backend.set_value.assert_called_once()
		args, kwargs = cache_backend.set_value.call_args
		self.assertEqual(args[1], result)
		self.assertEqual(kwargs.get("expires_in_sec"), 15)

	@patch(f"{MODULE}.frappe.cache")
	@patch(f"{MODULE}.get_allocatable_qty")
	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_returns_cached_result_without_recomputing(
		self, mock_require_manager, mock_get_value, mock_get_all, mock_get_allocatable_qty, mock_cache
	):
		mock_get_value.side_effect = lambda doctype, *a, **k: (
			frappe._dict({"warehouse": "WH-CENTRAL", "company": "Test Co"})
			if doctype == "POS Profile"
			else 5.0
		)
		mock_get_all.return_value = []
		cache_backend = MagicMock()
		cached_payload = [{"item_code": "ITEM-CACHED", "warehouse": "WH-CENTRAL"}]
		cache_backend.get_value.return_value = cached_payload
		mock_cache.return_value = cache_backend

		result = get_plan_stock_on_hand(branch="Branch1", items=[{"item_code": "ITEM-CACHED"}])

		self.assertEqual(result, cached_payload)
		mock_get_allocatable_qty.assert_not_called()

	@patch(f"{MODULE}.get_allocatable_qty")
	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.require_manager")
	def test_valuation_rate_defaults_to_zero_when_missing(
		self, mock_require_manager, mock_get_value, mock_get_all, mock_get_allocatable_qty
	):
		mock_get_value.side_effect = lambda doctype, *a, **k: (
			frappe._dict({"warehouse": "WH-CENTRAL", "company": "Test Co"})
			if doctype == "POS Profile"
			else None
		)
		mock_get_all.return_value = []
		mock_get_allocatable_qty.return_value = {}

		items = [{"item_code": "ITEM-NOVAL"}]
		result = get_plan_stock_on_hand(branch="Branch1", items=items)

		self.assertEqual(result[0]["valuation_rate"], 0.0)
		self.assertEqual(result[0]["actual_qty"], 0)
		self.assertEqual(result[0]["projected_qty"], 0)
		self.assertEqual(result[0]["allocatable_qty"], 0)

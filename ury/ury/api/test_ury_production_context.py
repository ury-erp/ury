from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_production_context import resolve_production_context


class TestResolveProductionContext(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.rows = [
			{
				"name": "UIPC-1",
				"item": "ITEM-CAKE",
				"branch": "Branch A",
				"department": "Hot Kitchen",
				"production_unit": "Main Kitchen",
				"production_policy": "Make to Stock",
				"bom": "BOM-001",
				"direct_retail_warehouse": "FG Warehouse - URY",
				"controlled_by_sales_plan": 1,
				"allow_over_plan_sale": 0,
				"availability_mode": "Always",
			},
		]

	def _patch_get_all(self, rows=None):
		return patch("ury.ury.api.ury_production_context.frappe.get_all", return_value=self.rows if rows is None else rows)

	@patch("ury.ury.api.ury_production_context.frappe.db.get_value", return_value="Test Company")
	def test_resolver_normalizes_policy_and_derives_company(self, mock_get_value):
		with self._patch_get_all():
			result = resolve_production_context("ITEM-CAKE", "Branch A")

		self.assertIsNotNone(result)
		self.assertEqual(result.name, "UIPC-1")
		self.assertEqual(result.production_policy, "PRE_PRODUCED")
		self.assertEqual(result.company, "Test Company")
		self.assertEqual(result.warehouse, "FG Warehouse - URY")
		mock_get_value.assert_called_once_with("Branch", "Branch A", "company")

	@patch("ury.ury.api.ury_production_context.frappe.db.get_value", return_value="Test Company")
	def test_resolver_respects_department_filter(self, mock_get_value):
		with self._patch_get_all():
			result = resolve_production_context("ITEM-CAKE", "Branch A", department="Hot Kitchen")

		self.assertIsNotNone(result)
		self.assertEqual(result.department, "Hot Kitchen")
		self.assertEqual(result.company, "Test Company")
		mock_get_value.assert_called_once_with("Branch", "Branch A", "company")

	def test_resolver_returns_none_for_missing_or_ambiguous_rows(self):
		with self._patch_get_all([]):
			self.assertIsNone(resolve_production_context("ITEM-CAKE", "Branch A"))

		with self._patch_get_all([self.rows[0], dict(self.rows[0], name="UIPC-2")]):
			self.assertIsNone(resolve_production_context("ITEM-CAKE", "Branch A"))

	def test_resolver_returns_none_without_item_or_branch(self):
		self.assertIsNone(resolve_production_context("", "Branch A"))
		self.assertIsNone(resolve_production_context("ITEM-CAKE", ""))

	@patch("ury.ury.api.ury_production_context.frappe.db.get_value", return_value="Other Company")
	def test_resolver_fails_closed_on_company_mismatch(self, mock_get_value):
		with self._patch_get_all():
			self.assertIsNone(resolve_production_context("ITEM-CAKE", "Branch A", company="Test Company"))

		mock_get_value.assert_called_once_with("Branch", "Branch A", "company")

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
		self.assertEqual(result.production_unit_disabled, 0)
		self.assertEqual(result.department_disabled, 0)
		# get_value is now also called to derive production_unit_disabled/
		# department_disabled from the linked records' own `enabled` field
		# (N2 fix) -- assert the company lookup happened, not that it was
		# the only call.
		self.assertIn(("Branch", "Branch A", "company"), [c.args for c in mock_get_value.call_args_list])

	@patch(
		"ury.ury.api.ury_production_context.frappe.db.get_value",
		side_effect=["MTO Warehouse - URY", 1, 1, "Test Company"],
	)
	def test_mto_uses_production_unit_warehouse(self, mock_get_value):
		row = dict(self.rows[0], production_policy="MADE_TO_ORDER")
		with self._patch_get_all([row]):
			result = resolve_production_context("ITEM-CAKE", "Branch A")

		self.assertEqual(result.warehouse, "MTO Warehouse - URY")
		self.assertEqual(
			mock_get_value.call_args_list[0].args,
			("URY Production Unit", "Main Kitchen", "warehouse"),
		)

	def test_resolver_derives_disable_flags_from_linked_records(self):
		"""production_unit_disabled/department_disabled are not real columns
		on this doctype (N2 fix) -- they must be derived live from the
		linked URY Production Unit/URY Production Department's own `enabled`
		field, not read back off the row (any such value on the row, as
		might be injected by a stale/legacy caller, must be ignored)."""
		row = dict(self.rows[0], production_unit_disabled=1, department_disabled=1)

		def _get_value(doctype, name, field):
			if doctype == "URY Production Unit":
				return 0  # disabled
			if doctype == "URY Production Department":
				return 1  # enabled
			if doctype == "Branch":
				return "Test Company"
			return None

		with self._patch_get_all([row]), patch(
			"ury.ury.api.ury_production_context.frappe.db.get_value", side_effect=_get_value
		):
			result = resolve_production_context("ITEM-CAKE", "Branch A")

		self.assertEqual(result.production_unit_disabled, 1)
		self.assertEqual(result.department_disabled, 0)

	@patch("ury.ury.api.ury_production_context.frappe.db.get_value", return_value="Test Company")
	def test_resolver_respects_department_filter(self, mock_get_value):
		with self._patch_get_all():
			result = resolve_production_context("ITEM-CAKE", "Branch A", department="Hot Kitchen")

		self.assertIsNotNone(result)
		self.assertEqual(result.department, "Hot Kitchen")
		self.assertEqual(result.company, "Test Company")
		self.assertIn(("Branch", "Branch A", "company"), [c.args for c in mock_get_value.call_args_list])

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

		self.assertIn(("Branch", "Branch A", "company"), [c.args for c in mock_get_value.call_args_list])

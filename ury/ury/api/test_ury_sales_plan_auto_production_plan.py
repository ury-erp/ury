from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_sales_plan_auto_production_plan import (
	maybe_create_production_plan_on_approval,
)


DOCTYPE = "URY Production Settings"


class _FakeSalesPlanDoc(dict):
	"""Minimal dict-like stand-in matching what
	ury_production_plan_adapter.adapt_sales_plan_to_production_plan and this
	module read via ``.get(...)``/``.name`` -- mirrors the pattern already
	used by test_ury_production_plan_adapter.py for a non-live doc."""

	def __init__(self, **kwargs):
		super().__init__(**kwargs)
		self.name = kwargs.get("name", "SP-0001")

	def set(self, key, value):
		self[key] = value


ADAPTED_PLAN = {
	"doctype": "Production Plan",
	"company": "URY Co",
	"posting_date": "2026-09-16",
	"po_items": [
		{
			"item_code": "ITEM-1",
			"bom_no": "BOM-ITEM-1",
			"planned_qty": 10,
			"stock_uom": "Nos",
			"planned_start_date": "2026-09-16",
			"description": None,
			"warehouse": "Stores - URY",
			"custom_ury_department": "Kitchen",
			"_ury_department": "Kitchen",
			"_ury_production_unit": "Main",
			"_ury_production_policy": "PRE_PRODUCED",
			"_ury_bom_revision": "abc123",
		}
	],
	"total_planned_qty": 10,
	"_source": {"source_doctype": "URY Sales Plan", "source_name": "SP-0001"},
	"_unmapped_fields": {"production_plan": [], "production_plan_item": []},
	"_ury_department_index": {"Kitchen": [0]},
}


class TestMaybeCreateProductionPlanOnApproval(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)

	def tearDown(self):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)
		frappe.set_user("Administrator")

	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.adapt_sales_plan_to_production_plan"
	)
	def test_setting_disabled_does_not_create_plan(self, mock_adapt, mock_get_doc):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)
		sales_plan_doc = _FakeSalesPlanDoc(status="Approved", name="SP-0001")

		maybe_create_production_plan_on_approval(sales_plan_doc)

		mock_adapt.assert_not_called()
		mock_get_doc.assert_not_called()

	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.adapt_sales_plan_to_production_plan"
	)
	def test_setting_enabled_creates_and_submits_plan_and_links_back(
		self, mock_adapt, mock_get_doc
	):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 1)
		mock_adapt.return_value = ADAPTED_PLAN
		fake_plan = MagicMock()
		fake_plan.name = "PP-0001"
		mock_get_doc.return_value = fake_plan
		sales_plan_doc = _FakeSalesPlanDoc(status="Approved", name="SP-0001")

		maybe_create_production_plan_on_approval(sales_plan_doc)

		mock_get_doc.assert_called_once()
		created_dict = mock_get_doc.call_args[0][0]
		self.assertEqual(created_dict["doctype"], "Production Plan")
		self.assertNotIn("_source", created_dict)
		self.assertNotIn("_unmapped_fields", created_dict)
		self.assertNotIn("_ury_department_index", created_dict)
		self.assertEqual(len(created_dict["po_items"]), 1)
		item = created_dict["po_items"][0]
		self.assertEqual(item["item_code"], "ITEM-1")
		self.assertEqual(item["custom_ury_department"], "Kitchen")
		self.assertNotIn("_ury_department", item)
		self.assertNotIn("_ury_production_policy", item)

		fake_plan.insert.assert_called_once()
		fake_plan.submit.assert_called_once()
		self.assertEqual(sales_plan_doc.get("custom_ury_production_plan"), "PP-0001")

	@patch("ury.ury.api.ury_sales_plan_production_plan.get_live_production_plan")
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.adapt_sales_plan_to_production_plan"
	)
	def test_already_linked_production_plan_is_skipped(self, mock_adapt, mock_get_doc, mock_live):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 1)
		mock_live.return_value = {"name": "PP-EXISTING", "docstatus": 1}
		sales_plan_doc = _FakeSalesPlanDoc(status="Approved", name="SP-0001")

		maybe_create_production_plan_on_approval(sales_plan_doc)

		mock_adapt.assert_not_called()
		mock_get_doc.assert_not_called()
		self.assertEqual(sales_plan_doc.get("custom_ury_production_plan"), "PP-EXISTING")

	@patch("ury.ury.api.ury_sales_plan_auto_production_plan.frappe.log_error")
	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.adapt_sales_plan_to_production_plan"
	)
	def test_adapter_failure_is_swallowed_and_logged(self, mock_adapt, mock_log_error):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 1)
		mock_adapt.side_effect = Exception("boom: no BOM found")
		sales_plan_doc = _FakeSalesPlanDoc(status="Approved", name="SP-0001")

		# Must not raise -- this is called from URY Sales Plan's validate().
		maybe_create_production_plan_on_approval(sales_plan_doc)

		mock_log_error.assert_called_once()

	@patch("ury.ury.api.ury_sales_plan_auto_production_plan.frappe.log_error")
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.adapt_sales_plan_to_production_plan"
	)
	def test_insert_failure_is_swallowed_and_logged(
		self, mock_adapt, mock_get_doc, mock_log_error
	):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 1)
		mock_adapt.return_value = ADAPTED_PLAN
		fake_plan = MagicMock()
		fake_plan.insert.side_effect = Exception("missing warehouse")
		mock_get_doc.return_value = fake_plan
		sales_plan_doc = _FakeSalesPlanDoc(status="Approved", name="SP-0001")

		maybe_create_production_plan_on_approval(sales_plan_doc)

		fake_plan.submit.assert_not_called()
		mock_log_error.assert_called_once()

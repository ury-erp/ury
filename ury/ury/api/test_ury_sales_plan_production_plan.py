# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_sales_plan_production_plan import (
	get_live_production_plan,
	get_production_plan_state,
	open_or_create_production_plan,
	preflight_issues,
)


class _FakeSalesPlanDoc(dict):
	def __init__(self, **kwargs):
		super().__init__(**kwargs)
		self.name = kwargs.get("name", "SP-0001")
		self.docstatus = kwargs.get("docstatus", 1)

	def set(self, key, value):
		self[key] = value


ADAPTED_PLAN_WITH_ITEMS = {
	"doctype": "Production Plan",
	"company": "URY Co",
	"posting_date": "2026-09-21",
	"po_items": [
		{
			"item_code": "ITEM-1",
			"bom_no": "BOM-ITEM-1",
			"planned_qty": 10,
			"stock_uom": "Nos",
			"warehouse": "Stores - URY",
			"custom_ury_department": "Kitchen",
		}
	],
	"_source": {},
	"_unmapped_fields": {},
	"_ury_department_index": {},
}

ADAPTED_PLAN_NO_ITEMS = {
	"doctype": "Production Plan",
	"company": "URY Co",
	"posting_date": "2026-09-21",
	"po_items": [],
	"_source": {},
	"_unmapped_fields": {},
	"_ury_department_index": {},
}

ADAPTED_PLAN_NO_BOM = {
	"doctype": "Production Plan",
	"company": "URY Co",
	"posting_date": "2026-09-21",
	"po_items": [{"item_code": "ITEM-1", "bom_no": None, "planned_qty": 5, "stock_uom": "Nos"}],
	"_source": {},
	"_unmapped_fields": {},
	"_ury_department_index": {},
}


class TestPreflightIssues(FrappeTestCase):
	def test_ineligible_status(self):
		doc = _FakeSalesPlanDoc(status="Draft")
		issues = preflight_issues(doc, production_plan_dict={})
		self.assertTrue(any("Approved" in i for i in issues))

	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.adapt_sales_plan_to_production_plan",
		return_value=ADAPTED_PLAN_NO_ITEMS,
	)
	def test_no_plannable_items(self, mock_adapt):
		doc = _FakeSalesPlanDoc(status="Approved")
		issues = preflight_issues(doc)
		self.assertTrue(any("No plannable items" in i for i in issues))

	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.adapt_sales_plan_to_production_plan",
		return_value=ADAPTED_PLAN_NO_BOM,
	)
	def test_missing_bom(self, mock_adapt):
		doc = _FakeSalesPlanDoc(status="Approved")
		issues = preflight_issues(doc)
		self.assertTrue(any("no BOM" in i for i in issues))


class TestCreateOrGetProductionPlan(FrappeTestCase):
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.db.get_value", return_value="SP-0001")
	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.get_live_production_plan",
		return_value={"name": "PP-EXISTING", "docstatus": 1},
	)
	def test_idempotent_returns_existing(self, mock_live, mock_lock):
		from ury.ury.api.ury_sales_plan_production_plan import create_or_get_production_plan

		doc = _FakeSalesPlanDoc(name="SP-0001", status="Approved")
		name, created = create_or_get_production_plan(doc, submit=False)
		self.assertEqual(name, "PP-EXISTING")
		self.assertFalse(created)

	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.adapt_sales_plan_to_production_plan",
		return_value=ADAPTED_PLAN_WITH_ITEMS,
	)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.db.get_value", return_value="SP-0001")
	@patch("ury.ury.api.ury_sales_plan_production_plan.get_live_production_plan", return_value=None)
	def test_creates_draft_never_submits_unless_asked(
		self, mock_live, mock_lock, mock_adapt, mock_get_doc
	):
		from ury.ury.api.ury_sales_plan_production_plan import create_or_get_production_plan

		mock_get_doc.return_value.name = "PP-NEW"
		doc = _FakeSalesPlanDoc(name="SP-0001", status="Approved")

		name, created = create_or_get_production_plan(doc, submit=False)

		self.assertEqual(name, "PP-NEW")
		self.assertTrue(created)
		mock_get_doc.return_value.insert.assert_called_once()
		mock_get_doc.return_value.submit.assert_not_called()

	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.adapt_sales_plan_to_production_plan",
		return_value=ADAPTED_PLAN_NO_ITEMS,
	)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.db.get_value", return_value="SP-0001")
	@patch("ury.ury.api.ury_sales_plan_production_plan.get_live_production_plan", return_value=None)
	def test_throws_on_preflight_issues(self, mock_live, mock_lock, mock_adapt, mock_get_doc):
		from ury.ury.api.ury_sales_plan_production_plan import create_or_get_production_plan

		doc = _FakeSalesPlanDoc(name="SP-0001", status="Approved")
		with self.assertRaises(frappe.ValidationError):
			create_or_get_production_plan(doc, submit=False)
		mock_get_doc.assert_not_called()


class TestGetProductionPlanState(FrappeTestCase):
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.has_permission", return_value=True)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	def test_ineligible_status(self, mock_get_doc, mock_perm):
		mock_get_doc.return_value = _FakeSalesPlanDoc(status="Draft")
		state = get_production_plan_state("SP-0001")
		self.assertEqual(state["state"], "ineligible")

	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.has_permission", return_value=True)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	@patch("ury.ury.api.ury_sales_plan_production_plan.get_live_production_plan")
	def test_stale_when_hash_mismatch(self, mock_live, mock_get_doc, mock_perm):
		mock_get_doc.return_value = _FakeSalesPlanDoc(status="Approved", approval_snapshot_hash="new")
		mock_live.return_value = {
			"name": "PP-1",
			"docstatus": 0,
			"custom_ury_snapshot_hash": "old",
		}
		state = get_production_plan_state("SP-0001")
		self.assertEqual(state["state"], "stale")

	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.has_permission", return_value=True)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	@patch("ury.ury.api.ury_sales_plan_production_plan.get_live_production_plan")
	def test_live_when_hash_matches(self, mock_live, mock_get_doc, mock_perm):
		mock_get_doc.return_value = _FakeSalesPlanDoc(status="Approved", approval_snapshot_hash="same")
		mock_live.return_value = {
			"name": "PP-1",
			"docstatus": 0,
			"custom_ury_snapshot_hash": "same",
		}
		state = get_production_plan_state("SP-0001")
		self.assertEqual(state["state"], "live")


class TestOpenOrCreateProductionPlan(FrappeTestCase):
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.has_permission", return_value=True)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.db.get_value", return_value="SP-0001")
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	def test_not_approved_throws(self, mock_get_doc, mock_lock, mock_perm):
		mock_get_doc.return_value = _FakeSalesPlanDoc(status="Draft", docstatus=0)
		with self.assertRaises(frappe.ValidationError):
			open_or_create_production_plan("SP-0001")

	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.db.set_value")
	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.create_or_get_production_plan",
		return_value=("PP-NEW", True),
	)
	@patch("ury.ury.api.ury_sales_plan_production_plan.get_live_production_plan", return_value=None)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.has_permission", return_value=True)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.db.get_value", return_value="SP-0001")
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	def test_creates_and_links_back(
		self, mock_get_doc, mock_lock, mock_perm, mock_live, mock_create, mock_set_value
	):
		mock_get_doc.return_value = _FakeSalesPlanDoc(status="Approved", docstatus=1)
		result = open_or_create_production_plan("SP-0001")
		self.assertEqual(result, {"name": "PP-NEW", "created": True, "docstatus": 0})
		mock_set_value.assert_called_once_with(
			"URY Sales Plan", "SP-0001", "custom_ury_production_plan", "PP-NEW"
		)

	@patch(
		"ury.ury.api.ury_sales_plan_production_plan.get_live_production_plan",
		return_value={"name": "PP-EXISTING", "docstatus": 1},
	)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.has_permission", return_value=True)
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.db.get_value", return_value="SP-0001")
	@patch("ury.ury.api.ury_sales_plan_production_plan.frappe.get_doc")
	def test_double_call_does_not_duplicate(self, mock_get_doc, mock_lock, mock_perm, mock_live):
		mock_get_doc.return_value = _FakeSalesPlanDoc(status="Approved", docstatus=1)
		result = open_or_create_production_plan("SP-0001")
		self.assertEqual(result["name"], "PP-EXISTING")
		self.assertFalse(result["created"])

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from unittest.mock import call, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_sales_plan_production_plan import (
	create_department_production_plans,
	create_or_get_department_production_plans,
	get_department_production_plan,
	get_live_production_plans,
	get_production_plan_states,
	open_department_production_plan,
)

MOD = "ury.ury.api.ury_sales_plan_production_plan"


class _FakeSalesPlanDoc(dict):
	def __init__(self, **kwargs):
		super().__init__(**kwargs)
		self.name = kwargs.get("name", "SP-0001")
		self.docstatus = kwargs.get("docstatus", 1)

	def set(self, key, value):
		self[key] = value


def _target(department, item_code, warehouse, required_qty=10, bom_no="BOM-1", stock_uom="Nos"):
	return {
		"item_code": item_code,
		"bom_no": bom_no,
		"required_qty": required_qty,
		"stock_uom": stock_uom,
		"department": department,
		"warehouse": warehouse,
		"sourcing_mode": "IN_HOUSE",
		"component_vector": [],
		"depends_on": [],
		"sources": [],
	}


DEPARTMENTS_TWO = {
	"Main Kitchen": {
		"department": "Main Kitchen",
		"warehouse": "Main Kitchen - WH",
		"targets": [_target("Main Kitchen", "BIRYANI-BASE", "Main Kitchen - WH")],
		"external_receipt_targets": [],
	},
	"Bakery": {
		"department": "Bakery",
		"warehouse": "Bakery - WH",
		"targets": [_target("Bakery", "BREAD-DOUGH", "Bakery - WH")],
		"external_receipt_targets": [],
	},
}


def _sales_plan_doc(**overrides):
	defaults = dict(
		name="SP-0001",
		status="Locked for Production",
		branch="Branch A",
		company="URY Co",
		plan_date="2026-09-21",
		approval_snapshot="{}",
		approval_snapshot_hash="hash-1",
	)
	defaults.update(overrides)
	return _FakeSalesPlanDoc(**defaults)


class TestCreateOrGetDepartmentProductionPlans(FrappeTestCase):
	"""Material Request generation (``_generate_material_requests``) is
	patched out in every test here whose subject is plan creation itself --
	it now runs for real at the end of ``create_or_get_department_production_plans``
	(see that function and its module docstring), and these are mocked unit
	tests that never set up fake Material Request machinery. Generation is
	exercised on its own in ``test_ury_production_plan_material_request.py``
	/ ``test_ury_production_transfer.py``, and against real records in
	``test_ury_production_plan_integration.py``."""

	@patch(f"{MOD}._generate_material_requests", return_value={"purchase": None, "transfers": [], "errors": []})
	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.compile_production_targets", return_value=(DEPARTMENTS_TWO, []))
	@patch(f"{MOD}.frappe.get_all", return_value=[])
	@patch(f"{MOD}.frappe.db.get_value", return_value="SP-0001")
	def test_creates_one_plan_per_department(self, mock_lock, mock_get_all, mock_compile, mock_get_doc, mock_generate_mr):
		created_docs = []

		def _make_doc(plan_dict):
			doc = frappe._dict(dict(plan_dict))
			doc.name = f"MFG-PP-{plan_dict['custom_ury_department']}"
			doc.insert = lambda: None
			doc.submit = lambda: None
			created_docs.append(doc)
			return doc

		mock_get_doc.side_effect = _make_doc

		doc = _sales_plan_doc()
		result = create_or_get_department_production_plans(doc, submit=False)

		self.assertEqual(result["sales_plan"], "SP-0001")
		departments_created = {row["department"] for row in result["production_plans"]}
		self.assertEqual(departments_created, {"Main Kitchen", "Bakery"})
		self.assertTrue(all(row["created"] for row in result["production_plans"]))
		self.assertEqual(len(created_docs), 2)

		# Row lock is taken before anything else.
		mock_lock.assert_called_once_with("URY Sales Plan", "SP-0001", "name", for_update=True)

		# Material Request generation runs once, over the just-created results,
		# and its return value is surfaced on the response.
		mock_generate_mr.assert_called_once_with("SP-0001", result["production_plans"])
		self.assertEqual(result["material_requests"], {"purchase": None, "transfers": [], "errors": []})

	@patch(f"{MOD}._generate_material_requests", return_value={"purchase": None, "transfers": [], "errors": []})
	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.compile_production_targets", return_value=(DEPARTMENTS_TWO, []))
	@patch(f"{MOD}.frappe.db.get_value", return_value="SP-0001")
	def test_idempotent_skips_department_with_matching_hash(self, mock_lock, mock_compile, mock_get_doc, mock_generate_mr):
		# Main Kitchen already has a live plan at the current hash; Bakery does not.
		with patch(
			f"{MOD}.frappe.get_all",
			return_value=[
				{
					"name": "MFG-PP-EXISTING",
					"docstatus": 1,
					"custom_ury_department": "Main Kitchen",
					"custom_ury_snapshot_hash": "hash-1",
					"custom_ury_production_state": "Ready for Production",
				}
			],
		):
			doc = _sales_plan_doc(approval_snapshot_hash="hash-1")
			result = create_or_get_department_production_plans(doc, submit=False)

		by_department = {row["department"]: row for row in result["production_plans"]}
		self.assertFalse(by_department["Main Kitchen"]["created"])
		self.assertEqual(by_department["Main Kitchen"]["production_plan"], "MFG-PP-EXISTING")
		self.assertTrue(by_department["Bakery"]["created"])
		# Only the genuinely new department plan is ever inserted.
		mock_get_doc.assert_called_once()

	@patch(f"{MOD}.frappe.get_all", return_value=[])
	@patch(f"{MOD}.frappe.db.get_value", return_value="SP-0001")
	def test_throws_without_frozen_snapshot(self, mock_lock, mock_get_all):
		doc = _sales_plan_doc(approval_snapshot=None)
		with self.assertRaises(frappe.ValidationError):
			create_or_get_department_production_plans(doc, submit=False)

	@patch(f"{MOD}._generate_material_requests", return_value={"purchase": None, "transfers": [], "errors": []})
	@patch(f"{MOD}.frappe.get_doc")
	@patch(
		f"{MOD}.compile_production_targets",
		return_value=(
			{
				"Main Kitchen": {
					"department": "Main Kitchen",
					"warehouse": "Main Kitchen - WH",
					"targets": [],
					"external_receipt_targets": [],
				}
			},
			[],
		),
	)
	@patch(f"{MOD}.frappe.get_all", return_value=[])
	@patch(f"{MOD}.frappe.db.get_value", return_value="SP-0001")
	def test_empty_department_produces_no_plan(self, mock_lock, mock_get_all, mock_compile, mock_get_doc, mock_generate_mr):
		doc = _sales_plan_doc()
		result = create_or_get_department_production_plans(doc, submit=False)
		self.assertEqual(result["production_plans"], [])
		mock_get_doc.assert_not_called()
		# Generation still runs (over an empty results list) even when no
		# department plan was created -- the consolidated Purchase request is
		# sales-plan-wide, not per-department.
		mock_generate_mr.assert_called_once_with("SP-0001", [])

	@patch(f"{MOD}._generate_material_requests", return_value={"purchase": None, "transfers": [], "errors": []})
	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.compile_production_targets", return_value=(DEPARTMENTS_TWO, []))
	@patch(f"{MOD}.frappe.get_all", return_value=[])
	@patch(f"{MOD}.frappe.db.get_value", return_value="SP-0001")
	def test_include_exploded_items_survives_onto_po_items(self, mock_lock, mock_get_all, mock_compile, mock_get_doc, mock_generate_mr):
		"""D2 / the wiring point Agent 2 flagged: include_exploded_items must
		reach every Production Plan Item row, or ERPNext silently explodes
		pre-produced sub-assemblies into raw materials."""
		captured = {}

		def _make_doc(plan_dict):
			captured.setdefault(plan_dict["custom_ury_department"], plan_dict)
			doc = frappe._dict(dict(plan_dict))
			doc.name = f"MFG-PP-{plan_dict['custom_ury_department']}"
			doc.insert = lambda: None
			doc.submit = lambda: None
			return doc

		mock_get_doc.side_effect = _make_doc

		doc = _sales_plan_doc()
		create_or_get_department_production_plans(doc, submit=False)

		for plan_dict in captured.values():
			self.assertTrue(plan_dict["po_items"], "expected at least one po_items row")
			for row in plan_dict["po_items"]:
				self.assertEqual(row["include_exploded_items"], 0)

	@patch(f"{MOD}._generate_material_requests", return_value={"purchase": None, "transfers": [], "errors": []})
	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.compile_production_targets", return_value=(DEPARTMENTS_TWO, []))
	@patch(f"{MOD}.frappe.get_all", return_value=[])
	@patch(f"{MOD}.frappe.db.get_value", return_value="SP-0001")
	def test_submit_true_submits_every_created_plan(self, mock_lock, mock_get_all, mock_compile, mock_get_doc, mock_generate_mr):
		docs = []

		def _make_doc(plan_dict):
			doc = frappe._dict(dict(plan_dict))
			doc.name = f"MFG-PP-{plan_dict['custom_ury_department']}"
			doc.insert = lambda: None
			doc.submit = lambda d=doc: docs.append(d)
			return doc

		mock_get_doc.side_effect = _make_doc

		doc = _sales_plan_doc()
		create_or_get_department_production_plans(doc, submit=True)
		self.assertEqual(len(docs), 2)

	@patch(f"{MOD}._generate_material_requests", return_value={"purchase": None, "transfers": [], "errors": []})
	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.compile_production_targets", return_value=(DEPARTMENTS_TWO, []))
	@patch(f"{MOD}.frappe.get_all", return_value=[])
	@patch(f"{MOD}.frappe.db.get_value", return_value="SP-0001")
	def test_never_writes_deprecated_sales_plan_link_field(self, mock_lock, mock_get_all, mock_compile, mock_get_doc, mock_generate_mr):
		"""D11: URY Sales Plan.custom_ury_production_plan is no longer written."""
		mock_get_doc.side_effect = lambda plan_dict: frappe._dict(
			dict(plan_dict, name="MFG-PP-1", insert=lambda: None, submit=lambda: None)
		)
		doc = _sales_plan_doc()
		create_or_get_department_production_plans(doc, submit=False)
		self.assertNotIn("custom_ury_production_plan", doc)


class TestGetLiveProductionPlans(FrappeTestCase):
	@patch(f"{MOD}.frappe.get_all", return_value=[{"name": "MFG-PP-1", "docstatus": 1}])
	def test_get_live_production_plans(self, mock_get_all):
		rows = get_live_production_plans("SP-0001")
		self.assertEqual(rows[0]["name"], "MFG-PP-1")

	@patch(f"{MOD}.frappe.get_all", return_value=[{"name": "MFG-PP-1", "docstatus": 0}])
	def test_get_department_production_plan(self, mock_get_all):
		row = get_department_production_plan("SP-0001", "Main Kitchen")
		self.assertEqual(row["name"], "MFG-PP-1")

	@patch(f"{MOD}.frappe.get_all", return_value=[])
	def test_get_department_production_plan_none(self, mock_get_all):
		self.assertIsNone(get_department_production_plan("SP-0001", "Bakery"))


class TestGetProductionPlanStates(FrappeTestCase):
	@patch(f"{MOD}.frappe.has_permission", return_value=True)
	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.get_live_production_plans", return_value=[])
	def test_ineligible_status(self, mock_live, mock_get_doc, mock_perm):
		mock_get_doc.return_value = _FakeSalesPlanDoc(status="Approved")
		state = get_production_plan_states("SP-0001")
		self.assertFalse(state["eligible"])
		self.assertEqual(state["production_plans"], [])

	@patch(f"{MOD}.frappe.has_permission", return_value=True)
	@patch(f"{MOD}.frappe.get_doc")
	@patch(
		f"{MOD}.get_live_production_plans",
		return_value=[
			{
				"name": "MFG-PP-1",
				"docstatus": 1,
				"custom_ury_department": "Main Kitchen",
				"custom_ury_snapshot_hash": "old",
				"custom_ury_production_state": "Ready for Production",
			}
		],
	)
	def test_stale_when_hash_mismatch(self, mock_live, mock_get_doc, mock_perm):
		mock_get_doc.return_value = _FakeSalesPlanDoc(
			status="Locked for Production", approval_snapshot_hash="new"
		)
		state = get_production_plan_states("SP-0001")
		self.assertTrue(state["eligible"])
		self.assertEqual(state["production_plans"][0]["link_state"], "stale")

	@patch(f"{MOD}.frappe.has_permission", return_value=True)
	@patch(f"{MOD}.frappe.get_doc")
	@patch(
		f"{MOD}.get_live_production_plans",
		return_value=[
			{
				"name": "MFG-PP-1",
				"docstatus": 1,
				"custom_ury_department": "Main Kitchen",
				"custom_ury_snapshot_hash": "same",
				"custom_ury_production_state": "Ready for Production",
			}
		],
	)
	def test_live_when_hash_matches(self, mock_live, mock_get_doc, mock_perm):
		mock_get_doc.return_value = _FakeSalesPlanDoc(
			status="Locked for Production", approval_snapshot_hash="same"
		)
		state = get_production_plan_states("SP-0001")
		self.assertEqual(state["production_plans"][0]["link_state"], "live")


class TestCreateDepartmentProductionPlans(FrappeTestCase):
	@patch(f"{MOD}.frappe.has_permission", return_value=True)
	@patch(f"{MOD}.frappe.get_doc")
	def test_not_locked_throws(self, mock_get_doc, mock_perm):
		mock_get_doc.return_value = _FakeSalesPlanDoc(status="Approved")
		with self.assertRaises(frappe.ValidationError):
			create_department_production_plans("SP-0001")

	@patch(f"{MOD}.create_or_get_department_production_plans", return_value={"sales_plan": "SP-0001", "production_plans": [], "blockers": []})
	@patch(f"{MOD}.frappe.has_permission", return_value=True)
	@patch(f"{MOD}.frappe.get_doc")
	def test_locked_delegates_without_submit(self, mock_get_doc, mock_perm, mock_create):
		mock_get_doc.return_value = _FakeSalesPlanDoc(status="Locked for Production")
		create_department_production_plans("SP-0001")
		mock_create.assert_called_once()
		self.assertEqual(mock_create.call_args.kwargs.get("submit"), False)


class TestOpenDepartmentProductionPlan(FrappeTestCase):
	@patch(f"{MOD}.frappe.has_permission", return_value=True)
	@patch(f"{MOD}.get_department_production_plan", return_value=None)
	def test_throws_when_missing(self, mock_get, mock_perm):
		with self.assertRaises(frappe.ValidationError):
			open_department_production_plan("SP-0001", "Main Kitchen")

	@patch(f"{MOD}.frappe.has_permission", return_value=True)
	@patch(f"{MOD}.get_department_production_plan", return_value={"name": "MFG-PP-1", "docstatus": 1})
	def test_returns_existing(self, mock_get, mock_perm):
		result = open_department_production_plan("SP-0001", "Main Kitchen")
		self.assertEqual(result, {"name": "MFG-PP-1", "docstatus": 1, "department": "Main Kitchen"})

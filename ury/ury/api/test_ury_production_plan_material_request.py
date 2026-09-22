# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Unit tests for per-Production-Plan Purchase Material Requests.

Same mocking style as ``test_ury_sales_plan_production_plan.py``:
``FrappeTestCase`` for the test-runner site context, with every frappe call
patched rather than requiring real Sales Plan / Production Plan / Material
Request fixtures.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import ury_production_plan_material_request as mr_module
from ury.ury.api.ury_production_plan_material_request import (
	_allocate_purchase_requirement,
	generate_purchase_material_request_for_sales_plan,
)

MOD = "ury.ury.api.ury_production_plan_material_request"


def _readiness_row(item_code, department, department_shortage, store_shortage,
                    department_warehouse="DEPT-WH", stock_uom="Kg"):
	return {
		"item_code": item_code,
		"department": department,
		"department_warehouse": department_warehouse,
		"stock_uom": stock_uom,
		"required_qty": department_shortage,
		"department_available": 0.0,
		"department_shortage": department_shortage,
		"store_available": 0.0,
		"store_shortage": store_shortage,
	}


class _FakeChildRow:
	_counter = 0

	def __init__(self, fields):
		self.fields = fields
		_FakeChildRow._counter += 1
		self.name = f"mri-row-{_FakeChildRow._counter:04d}"


class _FakeProductionPlanDoc:
	def __init__(self, name):
		self.name = name
		self.flags = frappe._dict()
		self.mr_items = []
		self.saved = False

	def append(self, tablefield, fields):
		assert tablefield == "mr_items"
		row = _FakeChildRow(fields)
		self.mr_items.append(row)
		return row

	def save(self, ignore_permissions=False):
		self.saved = True


class _FakeMaterialRequestDoc:
	_created = []

	def __init__(self, fields):
		self.fields = fields
		self.name = f"MAT-MR-{len(_FakeMaterialRequestDoc._created) + 1:04d}"
		self.inserted = False
		self.submitted = False
		_FakeMaterialRequestDoc._created.append(self)

	def insert(self, ignore_permissions=False):
		self.inserted = True

	def submit(self):
		self.submitted = True


class TestAllocatePurchaseRequirement(FrappeTestCase):
	"""Pure allocation math -- no frappe calls at all."""

	def test_zero_requirement_after_outstanding_allocates_nothing(self):
		rows = [_readiness_row("RICE", "Main Kitchen", department_shortage=10.0, store_shortage=5.0)]
		self.assertEqual(_allocate_purchase_requirement(rows, outstanding_qty=5.0), [])

	def test_over_covered_by_outstanding_allocates_nothing(self):
		rows = [_readiness_row("RICE", "Main Kitchen", department_shortage=10.0, store_shortage=5.0)]
		self.assertEqual(_allocate_purchase_requirement(rows, outstanding_qty=50.0), [])

	def test_single_department_gets_full_requirement(self):
		rows = [_readiness_row("RICE", "Main Kitchen", department_shortage=10.0, store_shortage=5.0)]
		allocations = _allocate_purchase_requirement(rows, outstanding_qty=0.0)
		self.assertEqual(len(allocations), 1)
		self.assertEqual(allocations[0]["department"], "Main Kitchen")
		self.assertEqual(allocations[0]["qty"], 5.0)

	def test_two_departments_split_proportionally_and_sum_exactly(self):
		# Main Kitchen contributed 15 of the 20 total department_shortage,
		# Tandoor contributed 5. Store shortage (shared) is 12.
		rows = [
			_readiness_row("RICE", "Main Kitchen", department_shortage=15.0, store_shortage=12.0),
			_readiness_row("RICE", "Tandoor", department_shortage=5.0, store_shortage=12.0),
		]
		allocations = _allocate_purchase_requirement(rows, outstanding_qty=0.0)
		self.assertEqual(len(allocations), 2)
		total = sum(a["qty"] for a in allocations)
		self.assertEqual(total, 12.0)
		by_department = {a["department"]: a["qty"] for a in allocations}
		self.assertAlmostEqual(by_department["Main Kitchen"], 9.0)
		self.assertAlmostEqual(by_department["Tandoor"], 3.0)


class TestGeneratePurchaseMaterialRequest(FrappeTestCase):
	def setUp(self):
		_FakeMaterialRequestDoc._created = []
		_FakeChildRow._counter = 0
		self.plan_docs = {}

	def _run(self, departments, plan_by_department, outstanding_by_item=None, store_warehouse="Store WH - U"):
		outstanding_by_item = outstanding_by_item or {}

		def fake_get_doc(doctype, name=None):
			if doctype == "URY Sales Plan":
				return frappe._dict(
					name=name,
					branch="Branch A",
					company="URY Co",
					approval_snapshot="{}",
					approval_snapshot_hash="hash-1",
				)
			if doctype == "Production Plan":
				return self.plan_docs.setdefault(name, _FakeProductionPlanDoc(name))
			raise AssertionError(f"Unexpected frappe.get_doc(doctype) call: {doctype}")

		def fake_get_doc_dispatch(*args):
			if len(args) == 1 and isinstance(args[0], dict):
				return _FakeMaterialRequestDoc(args[0])
			return fake_get_doc(*args)

		live_plans = [
			{"name": row["name"], mr_module.PP_DEPARTMENT_FIELD: department}
			for department, row in plan_by_department.items()
		]

		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
				patch(f"{MOD}.frappe.get_doc", side_effect=fake_get_doc_dispatch), \
				patch(f"{MOD}.compile_production_targets", return_value=(departments, [])), \
				patch(f"{MOD}.get_live_production_plans", return_value=live_plans), \
				patch(f"{MOD}.get_store_warehouse", return_value=store_warehouse), \
				patch(f"{MOD}._existing_purchase_qty_by_item", return_value=outstanding_by_item):
			return generate_purchase_material_request_for_sales_plan("SP-0001")

	def test_department_stock_reduces_requirement_end_to_end(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "BIRYANI-BASE",
						"stock_uom": "Kg",
						"component_vector": [{"item_code": "RICE", "required_qty": 20.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
			}
		}
		plan_by_department = {"Main Kitchen": {"name": "MFG-PP-0001"}}

		bin_qty = {("RICE", "Main Kitchen - WH"): 5.0, ("RICE", "Store WH - U"): 0.0}

		def fake_bin_get_value(doctype, filters, fieldname=None):
			return bin_qty.get((filters.get("item_code"), filters.get("warehouse")), 0.0)

		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", side_effect=fake_bin_get_value):
			result = self._run(departments, plan_by_department)

		self.assertEqual(len(result["rows"]), 1)
		# 20 required - 5 department stock - 0 store stock - 0 outstanding = 15.
		self.assertEqual(result["rows"][0]["qty"], 15.0)
		self.assertEqual(len(result["material_requests"]), 1)
		self.assertEqual(result["material_requests"][0]["production_plan"], "MFG-PP-0001")

	def test_shared_raw_material_across_two_targets_is_one_row(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "LEMONADE",
						"stock_uom": "Nos",
						"component_vector": [{"item_code": "LEMON", "required_qty": 0.1, "stock_uom": "Kg"}],
					},
					{
						"item_code": "LEMON-CAKE",
						"stock_uom": "Nos",
						"component_vector": [{"item_code": "LEMON", "required_qty": 0.1, "stock_uom": "Kg"}],
					},
				],
				"external_receipt_targets": [],
			}
		}
		plan_by_department = {"Main Kitchen": {"name": "MFG-PP-0001"}}
		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", return_value=0.0):
			result = self._run(departments, plan_by_department)

		self.assertEqual(len(result["rows"]), 1)
		self.assertEqual(result["rows"][0]["item_code"], "LEMON")
		self.assertEqual(result["rows"][0]["qty"], 0.2)
		self.assertEqual(len(result["material_requests"]), 1)
		mr_doc = _FakeMaterialRequestDoc._created[0]
		self.assertEqual(len(mr_doc.fields["items"]), 1)
		self.assertEqual(mr_doc.fields["items"][0]["qty"], 0.2)

	def test_two_department_plans_get_separate_purchase_mrs_without_duplicating_store_shortage(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "X",
						"stock_uom": "Kg",
						"component_vector": [{"item_code": "RICE", "required_qty": 10.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
			},
			"Tandoor": {
				"department": "Tandoor",
				"warehouse": "Tandoor - WH",
				"targets": [
					{
						"item_code": "Y",
						"stock_uom": "Kg",
						"component_vector": [{"item_code": "RICE", "required_qty": 10.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
			},
		}
		plan_by_department = {
			"Main Kitchen": {"name": "MFG-PP-MK"},
			"Tandoor": {"name": "MFG-PP-TD"},
		}
		bin_qty = {
			("RICE", "Main Kitchen - WH"): 0.0,
			("RICE", "Tandoor - WH"): 0.0,
			("RICE", "Store WH - U"): 15.0,
		}

		def fake_bin_get_value(doctype, filters, fieldname=None):
			return bin_qty.get((filters.get("item_code"), filters.get("warehouse")), 0.0)

		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", side_effect=fake_bin_get_value):
			result = self._run(departments, plan_by_department)

		# Total demand 20, store has 15 -> shared shortfall is 5, split across
		# both departments -- never 5 each / 10 total.
		total_qty = sum(row["qty"] for row in result["rows"])
		self.assertEqual(total_qty, 5.0)
		self.assertEqual({row["production_plan"] for row in result["rows"]}, {"MFG-PP-MK", "MFG-PP-TD"})

		# One Purchase MR document per department plan.
		self.assertEqual(len(result["material_requests"]), 2)
		self.assertEqual(
			{entry["production_plan"] for entry in result["material_requests"]},
			{"MFG-PP-MK", "MFG-PP-TD"},
		)
		self.assertEqual(len(_FakeMaterialRequestDoc._created), 2)
		for mr_doc in _FakeMaterialRequestDoc._created:
			plans = {item["production_plan"] for item in mr_doc.fields["items"]}
			self.assertEqual(len(plans), 1)
			self.assertEqual(len(mr_doc.fields["items"]), 1)
			self.assertEqual(mr_doc.fields["items"][0]["item_code"], "RICE")

	def test_every_row_resolves_back_to_a_department_plan(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "X",
						"stock_uom": "Kg",
						"component_vector": [{"item_code": "RICE", "required_qty": 10.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
			}
		}
		plan_by_department = {"Main Kitchen": {"name": "MFG-PP-0001"}}
		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", return_value=0.0):
			result = self._run(departments, plan_by_department)

		self.assertTrue(result["rows"])
		for row in result["rows"]:
			self.assertEqual(row["production_plan"], "MFG-PP-0001")

		self.assertEqual(len(result["material_requests"]), 1)
		mr_doc = _FakeMaterialRequestDoc._created[0]
		self.assertTrue(mr_doc.submitted)
		for item in mr_doc.fields["items"]:
			self.assertEqual(item["production_plan"], "MFG-PP-0001")
			self.assertTrue(item["material_request_plan_item"])

		plan_doc = self.plan_docs["MFG-PP-0001"]
		self.assertTrue(plan_doc.saved)
		self.assertTrue(plan_doc.mr_items)

	def test_mr_items_warehouse_is_store_not_department(self):
		"""ERPNext's native Production Plan.make_material_request reads
		mr_items.warehouse straight onto the Material Request Item it
		generates. Purchase receive location must stay Store."""
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "X",
						"stock_uom": "Kg",
						"component_vector": [{"item_code": "RICE", "required_qty": 10.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
			}
		}
		plan_by_department = {"Main Kitchen": {"name": "MFG-PP-0001"}}
		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", return_value=0.0):
			self._run(departments, plan_by_department, store_warehouse="Store WH - U")

		plan_doc = self.plan_docs["MFG-PP-0001"]
		self.assertTrue(plan_doc.mr_items)
		for row in plan_doc.mr_items:
			self.assertEqual(row.fields["warehouse"], "Store WH - U")
			self.assertNotEqual(row.fields["warehouse"], "Main Kitchen - WH")

		mr_doc = _FakeMaterialRequestDoc._created[0]
		for item in mr_doc.fields["items"]:
			self.assertEqual(item["warehouse"], "Store WH - U")

	def test_repeated_call_creates_no_duplicates(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "X",
						"stock_uom": "Kg",
						"component_vector": [{"item_code": "RICE", "required_qty": 10.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
			}
		}
		plan_by_department = {"Main Kitchen": {"name": "MFG-PP-0001"}}
		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", return_value=0.0):
			result = self._run(departments, plan_by_department, outstanding_by_item={"RICE": 10.0})

		self.assertEqual(result["rows"], [])
		self.assertEqual(result["material_requests"], [])
		self.assertEqual(_FakeMaterialRequestDoc._created, [])

	def test_raised_requirement_creates_supplementary_request(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "X",
						"stock_uom": "Kg",
						"component_vector": [{"item_code": "RICE", "required_qty": 30.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
			}
		}
		plan_by_department = {"Main Kitchen": {"name": "MFG-PP-0001"}}
		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", return_value=0.0):
			result = self._run(departments, plan_by_department, outstanding_by_item={"RICE": 10.0})

		self.assertEqual(len(result["rows"]), 1)
		self.assertEqual(result["rows"][0]["qty"], 20.0)
		self.assertEqual(len(result["material_requests"]), 1)
		self.assertEqual(len(_FakeMaterialRequestDoc._created), 1)

	def test_generated_material_request_is_submitted_not_draft(self):
		departments = {
			"Bakery": {
				"department": "Bakery",
				"warehouse": "Bakery - WH",
				"targets": [
					{
						"item_code": "BREAD",
						"stock_uom": "Kg",
						"component_vector": [{"item_code": "FLOUR", "required_qty": 5.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
			}
		}
		plan_by_department = {"Bakery": {"name": "MFG-PP-BAKERY"}}
		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", return_value=0.0):
			self._run(departments, plan_by_department)

		mr_doc = _FakeMaterialRequestDoc._created[0]
		self.assertTrue(mr_doc.inserted)
		self.assertTrue(mr_doc.submitted)
		self.assertEqual(mr_doc.fields["material_request_type"], "Purchase")

	def test_external_receipt_demand_appears_in_purchase_requirement(self):
		"""D19: an EXTERNAL_RECEIPT target has no component_vector at all --
		its own demand must still reach the Purchase requirement here."""
		departments = {
			"Bakery": {
				"department": "Bakery",
				"warehouse": "Bakery - WH",
				"targets": [],
				"external_receipt_targets": [
					{"item_code": "IMPORTED-CHEESE", "required_qty": 8.0, "stock_uom": "Kg"}
				],
			}
		}
		plan_by_department = {"Bakery": {"name": "MFG-PP-BAKERY"}}
		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", return_value=0.0):
			result = self._run(departments, plan_by_department)

		self.assertEqual(len(result["rows"]), 1)
		self.assertEqual(result["rows"][0]["item_code"], "IMPORTED-CHEESE")
		self.assertEqual(result["rows"][0]["qty"], 8.0)
		self.assertEqual(len(result["material_requests"]), 1)

	def test_missing_department_plan_is_reported_not_silently_dropped(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "X",
						"stock_uom": "Kg",
						"component_vector": [{"item_code": "RICE", "required_qty": 10.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
			}
		}
		with patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", return_value=0.0):
			result = self._run(departments, plan_by_department={})

		self.assertEqual(result["material_requests"], [])
		self.assertTrue(
			any(b["type"] == "department_plan_missing_for_purchase_request" for b in result["blockers"])
		)


class TestExistingPurchaseQtyByItem(FrappeTestCase):
	def test_empty_plan_list_short_circuits_without_a_query(self):
		with patch(f"{MOD}.frappe.db.sql") as mock_sql:
			self.assertEqual(mr_module._existing_purchase_qty_by_item([]), {})
			mock_sql.assert_not_called()

	def test_restricted_to_purchase_type_and_submitted_only(self):
		with patch(f"{MOD}.frappe.db.sql", return_value=[{"item_code": "RICE", "qty": 12.0}]) as mock_sql:
			result = mr_module._existing_purchase_qty_by_item(["MFG-PP-0001"])
		self.assertEqual(result, {"RICE": 12.0})
		sql_text = mock_sql.call_args[0][0]
		self.assertIn("material_request_type", sql_text)
		self.assertIn("docstatus = 1", sql_text)
		params = mock_sql.call_args[0][1]
		self.assertEqual(params["material_request_type"], "Purchase")


if __name__ == "__main__":
	import unittest

	unittest.main()

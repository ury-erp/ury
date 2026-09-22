# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Unit tests for the read-only readiness engine.

Follows the same mocking style as ``test_ury_sales_plan_production_plan.py``:
``FrappeTestCase`` for the test-runner site context, with
``frappe.db.get_value`` (the engine's only stock read) patched directly
rather than requiring real Bin fixtures.
"""

import inspect
from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api import ury_production_readiness
from ury.ury.api.ury_production_readiness import compute_readiness

MOD = "ury.ury.api.ury_production_readiness"


def _target(item_code, component_vector, stock_uom="Kg"):
	return {
		"item_code": item_code,
		"stock_uom": stock_uom,
		"component_vector": component_vector,
		"external_receipt_targets": [],
	}


def _component(item_code, required_qty, stock_uom="Kg"):
	return {"item_code": item_code, "required_qty": required_qty, "stock_uom": stock_uom}


def _bin_fake(bin_qty_by_key):
	def _fake_get_value(doctype, filters, fieldname=None):
		if doctype == "Bin":
			key = (filters.get("item_code"), filters.get("warehouse"))
			return bin_qty_by_key.get(key, 0.0)
		raise AssertionError(f"Unexpected frappe.db.get_value call: {doctype} {filters}")

	return _fake_get_value


class TestDepartmentStockReducesRequirement(FrappeTestCase):
	def test_existing_department_stock_nets_off_before_store(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "BIRYANI-BASE",
						"stock_uom": "Kg",
						"component_vector": [_component("RICE", 20.0)],
					}
				],
				"external_receipt_targets": [],
			}
		}
		# Department already has 5 of the 20 required -> shortage is 15, not 20.
		bin_qty = {
			("RICE", "Main Kitchen - WH"): 5.0,
			("RICE", "Store - WH"): 0.0,
		}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			result = compute_readiness(departments, store_warehouse="Store - WH")

		row = result["rows"][0]
		self.assertEqual(row["required_qty"], 20.0)
		self.assertEqual(row["department_available"], 5.0)
		self.assertEqual(row["department_shortage"], 15.0)

	def test_department_stock_fully_covering_requirement_is_zero_shortage(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "BIRYANI-BASE",
						"stock_uom": "Kg",
						"component_vector": [_component("RICE", 10.0)],
					}
				],
				"external_receipt_targets": [],
			}
		}
		bin_qty = {("RICE", "Main Kitchen - WH"): 25.0, ("RICE", "Store - WH"): 0.0}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			result = compute_readiness(departments, store_warehouse="Store - WH")

		row = result["rows"][0]
		self.assertEqual(row["department_shortage"], 0.0)
		self.assertEqual(row["store_shortage"], 0.0)


class TestNoDuplicateStoreShortageAcrossDepartments(FrappeTestCase):
	def test_two_departments_share_one_store_shortage_number(self):
		# Main Kitchen and Tandoor both need 10 kg Rice, department has none,
		# Store has 15 kg. Total demand on Store is 20, Store has 15 ->
		# shortage is 5, and BOTH rows must report that same 5, not 10 each.
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{"item_code": "X", "stock_uom": "Kg", "component_vector": [_component("RICE", 10.0)]}
				],
				"external_receipt_targets": [],
			},
			"Tandoor": {
				"department": "Tandoor",
				"warehouse": "Tandoor - WH",
				"targets": [
					{"item_code": "Y", "stock_uom": "Kg", "component_vector": [_component("RICE", 10.0)]}
				],
				"external_receipt_targets": [],
			},
		}
		bin_qty = {
			("RICE", "Main Kitchen - WH"): 0.0,
			("RICE", "Tandoor - WH"): 0.0,
			("RICE", "Store - WH"): 15.0,
		}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			result = compute_readiness(departments, store_warehouse="Store - WH")

		rows_by_department = {row["department"]: row for row in result["rows"]}
		self.assertEqual(rows_by_department["Main Kitchen"]["department_shortage"], 10.0)
		self.assertEqual(rows_by_department["Tandoor"]["department_shortage"], 10.0)
		# Shared Store shortfall: 20 required - 15 available = 5, on both rows.
		self.assertEqual(rows_by_department["Main Kitchen"]["store_shortage"], 5.0)
		self.assertEqual(rows_by_department["Tandoor"]["store_shortage"], 5.0)


class TestExternalReceiptDemandIsNotLost(FrappeTestCase):
	def test_external_receipt_target_becomes_its_own_demand_row(self):
		# D19: an EXTERNAL_RECEIPT target has no component_vector at all, but
		# its own demand must still surface here, or it vanishes from the
		# whole system.
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
		bin_qty = {("IMPORTED-CHEESE", "Bakery - WH"): 2.0, ("IMPORTED-CHEESE", "Store - WH"): 0.0}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			result = compute_readiness(departments, store_warehouse="Store - WH")

		self.assertEqual(len(result["rows"]), 1)
		row = result["rows"][0]
		self.assertEqual(row["item_code"], "IMPORTED-CHEESE")
		self.assertEqual(row["required_qty"], 8.0)
		self.assertEqual(row["department_shortage"], 6.0)
		self.assertEqual(row["store_shortage"], 6.0)


class TestMadeToOrderRawMaterialDemandIsNotLost(FrappeTestCase):
	def test_raw_material_demand_row_becomes_a_demand_row(self):
		# A MADE_TO_ORDER row's own raw materials (Orange Juice's Orange and
		# Sugar, say) never become a target -- see
		# ury_production_target_compiler's "MADE_TO_ORDER raw materials"
		# section -- but the demand is real and must reach the same place a
		# target's component_vector row would.
		departments = {
			"Beverage": {
				"department": "Beverage",
				"warehouse": "Beverage - WH",
				"targets": [],
				"external_receipt_targets": [],
				"raw_material_demand": [
					{"item_code": "Orange", "required_qty": 6.0, "stock_uom": "Kg"},
				],
			}
		}
		bin_qty = {("Orange", "Beverage - WH"): 1.0, ("Orange", "Store - WH"): 2.0}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			result = compute_readiness(departments, store_warehouse="Store - WH")

		self.assertEqual(len(result["rows"]), 1)
		row = result["rows"][0]
		self.assertEqual(row["item_code"], "Orange")
		self.assertEqual(row["required_qty"], 6.0)
		self.assertEqual(row["department_available"], 1.0)
		self.assertEqual(row["department_shortage"], 5.0)
		self.assertEqual(row["store_shortage"], 3.0)  # 5.0 shortage - 2.0 Store stock

	def test_raw_material_demand_sums_with_a_targets_component_vector_for_the_same_item(self):
		# Rice needed by a target's own component_vector, and Rice needed
		# directly by a MADE_TO_ORDER row in the same department, are two
		# different sources of the exact same physical requirement -- they
		# must sum into one row, not report as two separate, understated
		# shortages.
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{
						"item_code": "BIRYANI-BASE",
						"component_vector": [{"item_code": "Rice", "required_qty": 4.0, "stock_uom": "Kg"}],
					}
				],
				"external_receipt_targets": [],
				"raw_material_demand": [{"item_code": "Rice", "required_qty": 3.0, "stock_uom": "Kg"}],
			}
		}
		bin_qty = {("Rice", "Main Kitchen - WH"): 0.0, ("Rice", "Store - WH"): 0.0}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			result = compute_readiness(departments, store_warehouse="Store - WH")

		self.assertEqual(len(result["rows"]), 1)
		self.assertEqual(result["rows"][0]["required_qty"], 7.0)  # 4.0 + 3.0


class TestStoreWarehouseBlocker(FrappeTestCase):
	def test_missing_store_warehouse_is_a_blocker_not_an_exception(self):
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{"item_code": "X", "stock_uom": "Kg", "component_vector": [_component("RICE", 10.0)]}
				],
				"external_receipt_targets": [],
			}
		}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake({})), \
				patch(f"{MOD}.get_store_warehouse", return_value=None):
			result = compute_readiness(departments)

		self.assertEqual(len(result["blockers"]), 1)
		self.assertEqual(result["blockers"][0]["type"], "store_warehouse_not_configured")
		# Department-level numbers are still reported -- a missing Store
		# config never blocks the department picture, which needs no Store
		# lookup at all.
		self.assertEqual(result["rows"][0]["department_shortage"], 10.0)

	def test_no_demand_no_store_warehouse_no_blocker(self):
		with patch(f"{MOD}.get_store_warehouse", return_value=None):
			result = compute_readiness({})
		self.assertEqual(result["rows"], [])
		self.assertEqual(result["blockers"], [])


class TestSingleDepartmentScope(FrappeTestCase):
	def test_caller_can_pass_one_department_subset(self):
		"""Agent 5/8 re-run readiness for one department under Bin locks (D17)
		-- the engine must not require the full Sales Plan's departments."""
		departments = {
			"Bakery": {
				"department": "Bakery",
				"warehouse": "Bakery - WH",
				"targets": [
					{"item_code": "BREAD", "stock_uom": "Kg", "component_vector": [_component("FLOUR", 5.0)]}
				],
				"external_receipt_targets": [],
			}
		}
		bin_qty = {("FLOUR", "Bakery - WH"): 0.0, ("FLOUR", "Store - WH"): 5.0}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			result = compute_readiness(departments, store_warehouse="Store - WH")
		self.assertEqual(len(result["rows"]), 1)
		self.assertEqual(result["rows"][0]["department"], "Bakery")


class TestSharedRawMaterialAcrossTargets(FrappeTestCase):
	def test_two_targets_sharing_one_raw_material_sum_into_one_row(self):
		# Lemon 0.1 kg on dish A + lemon 0.1 kg on dish B (same department)
		# must become one demand row of 0.2 kg — never two rows of 0.1.
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{"item_code": "LEMONADE", "stock_uom": "Nos", "component_vector": [_component("LEMON", 0.1)]},
					{"item_code": "LEMON-CAKE", "stock_uom": "Nos", "component_vector": [_component("LEMON", 0.1)]},
				],
				"external_receipt_targets": [],
			}
		}
		bin_qty = {("LEMON", "Main Kitchen - WH"): 0.0, ("LEMON", "Store - WH"): 0.0}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			result = compute_readiness(departments, store_warehouse="Store - WH")

		self.assertEqual(len(result["rows"]), 1)
		row = result["rows"][0]
		self.assertEqual(row["item_code"], "LEMON")
		self.assertEqual(row["required_qty"], 0.2)
		self.assertEqual(row["department_shortage"], 0.2)
		self.assertEqual(row["store_shortage"], 0.2)


class TestFloatResidueIsNotAShortage(FrappeTestCase):
	def test_near_zero_store_shortfall_rounds_to_zero(self):
		# required == available aside from binary float noise must not report
		# a store_shortage (and must not surface "2.77e-17" in blocker copy).
		departments = {
			"Main Kitchen": {
				"department": "Main Kitchen",
				"warehouse": "Main Kitchen - WH",
				"targets": [
					{"item_code": "X", "stock_uom": "Kg", "component_vector": [_component("LMN", 0.3)]}
				],
				"external_receipt_targets": [],
			}
		}
		# 0.1 + 0.2 is the classic float that is not exactly 0.3 in binary.
		bin_qty = {
			("LMN", "Main Kitchen - WH"): 0.0,
			("LMN", "Store - WH"): 0.1 + 0.2,
		}
		with patch(f"{MOD}.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			result = compute_readiness(departments, store_warehouse="Store - WH")

		row = result["rows"][0]
		self.assertEqual(row["store_shortage"], 0.0)

	def test_store_shortage_blocker_message_is_human_readable(self):
		from ury.ury.api.ury_production_readiness import store_shortage_blocker

		blocker = store_shortage_blocker({
			"item_code": "LMN",
			"department": "Main Kitchen",
			"store_shortage": 1.5,
			"stock_uom": "Kg",
		})
		self.assertIn("short by 1.5 Kg", blocker["message"])
		self.assertNotIn("e-", blocker["message"])


class TestNoWrites(FrappeTestCase):
	"""Structural guard: the readiness engine performs zero writes. Grepping
	the module's own source is the same approach Agent 1 used for the BOM
	tree service -- an inline mock can never catch a call that was added to
	the real function bodies later, but the source text can."""

	_FORBIDDEN_SUBSTRINGS = (
		".insert(",
		".save(",
		".submit(",
		".cancel(",
		".delete_doc(",
		"db_set(",
		"frappe.db.set_value(",
		"frappe.db.delete(",
	)

	def test_module_source_contains_no_write_calls(self):
		source = inspect.getsource(ury_production_readiness)
		for forbidden in self._FORBIDDEN_SUBSTRINGS:
			self.assertNotIn(forbidden, source, f"readiness engine must not write ({forbidden!r} found)")

	def test_no_frappe_whitelist_mutation_verbs_in_module(self):
		# Defensive belt-and-suspenders: no doctype-mutating frappe.get_doc
		# call chain either (the module never even loads a document).
		source = inspect.getsource(ury_production_readiness)
		self.assertNotIn("frappe.get_doc(", source)


if __name__ == "__main__":
	import unittest

	unittest.main()

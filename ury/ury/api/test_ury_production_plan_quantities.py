# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Unit tests for ``ury_production_plan_quantities`` (pure functions, no DB)."""

import unittest

import frappe

from ury.ury.api.ury_production_plan_quantities import (
	apply_quantities_to_bucket,
	consumption_by_item,
	dependency_shortfalls,
	derive_plan_quantities,
	is_pure_sub_assembly,
	scale_target,
	validate_dependency_quantities,
)


def _target(item_code, required_qty, components=None, raw=None, bom_no=None):
	return {
		"item_code": item_code,
		"bom_no": bom_no or f"BOM-{item_code}",
		"required_qty": required_qty,
		"component_vector": [dict(row) for row in (components or [])],
		"raw_material_vector": [dict(row) for row in (raw if raw is not None else components or [])],
	}


class TestScaleTarget(unittest.TestCase):
	def test_scales_required_and_both_vectors_linearly(self):
		target = _target("BASE", 10, components=[{"item_code": "RICE", "required_qty": 4.0}])
		scaled = scale_target(target, 15)
		self.assertEqual(scaled["required_qty"], 15)
		self.assertAlmostEqual(scaled["component_vector"][0]["required_qty"], 6.0)
		self.assertAlmostEqual(scaled["raw_material_vector"][0]["required_qty"], 6.0)

	def test_does_not_mutate_input(self):
		target = _target("BASE", 10, components=[{"item_code": "RICE", "required_qty": 4.0}])
		scale_target(target, 5)
		self.assertEqual(target["required_qty"], 10)
		self.assertEqual(target["component_vector"][0]["required_qty"], 4.0)

	def test_same_quantity_is_unchanged(self):
		target = _target("BASE", 10, components=[{"item_code": "RICE", "required_qty": 4.0}])
		scaled = scale_target(target, 10)
		self.assertEqual(scaled["component_vector"][0]["required_qty"], 4.0)
		self.assertNotIn("production_plan_factor", scaled)


class TestApplyQuantitiesToBucket(unittest.TestCase):
	def test_matches_on_item_and_bom_and_leaves_others(self):
		bucket = {
			"warehouse": "WH",
			"targets": [
				_target("A", 10, components=[{"item_code": "RM", "required_qty": 1.0}]),
				_target("B", 5, components=[{"item_code": "RM", "required_qty": 2.0}]),
			],
		}
		result = apply_quantities_to_bucket(bucket, {("A", "BOM-A"): 20})
		self.assertEqual(result["targets"][0]["required_qty"], 20)
		self.assertAlmostEqual(result["targets"][0]["raw_material_vector"][0]["required_qty"], 2.0)
		self.assertEqual(result["targets"][1]["required_qty"], 5)
		self.assertEqual(result["warehouse"], "WH")
		self.assertEqual(bucket["targets"][0]["required_qty"], 10)

	def test_different_bom_is_not_matched(self):
		bucket = {"targets": [_target("A", 10, bom_no="BOM-OLD")]}
		result = apply_quantities_to_bucket(bucket, {("A", "BOM-NEW"): 20})
		self.assertEqual(result["targets"][0]["required_qty"], 10)


class TestDependencyQuantities(unittest.TestCase):
	def _targets(self, base_qty, biryani_qty):
		base = _target("BASE", base_qty, components=[{"item_code": "RICE", "required_qty": 1.0}])
		biryani = _target(
			"BIRYANI",
			10,
			components=[{"item_code": "BASE", "required_qty": 8.0}, {"item_code": "CHICKEN", "required_qty": 2.0}],
			raw=[{"item_code": "CHICKEN", "required_qty": 2.0}],
		)
		biryani = scale_target(biryani, biryani_qty)
		return [base, biryani]

	def test_consistent_quantities_pass(self):
		self.assertEqual(dependency_shortfalls(self._targets(8, 10)), [])
		validate_dependency_quantities(self._targets(8, 10))

	def test_sub_assembly_below_consumption_is_reported(self):
		shortfalls = dependency_shortfalls(self._targets(8, 15))
		self.assertEqual(len(shortfalls), 1)
		self.assertEqual(shortfalls[0]["item_code"], "BASE")
		self.assertAlmostEqual(shortfalls[0]["consumed_qty"], 12.0)
		with self.assertRaises(frappe.ValidationError):
			validate_dependency_quantities(self._targets(8, 15))

	def test_raising_sub_assembly_above_consumption_is_allowed(self):
		self.assertEqual(dependency_shortfalls(self._targets(20, 10)), [])


NESTED = [{"parent_item": "PARENT", "required_qty": 8.0, "source_type": "nested_dependency"}]
DIRECT = [{"parent_item": None, "required_qty": 10.0, "source_type": "direct_plan_row"}]


def _chain():
	"""GRAND (nested, 1 per BASE) <- BASE (nested, 0.8 per parent) <- PARENT (direct 10)."""
	grand = _target("GRAND", 8, components=[{"item_code": "RICE", "required_qty": 8.0}])
	grand["sources"] = NESTED
	base = _target("BASE", 8, components=[{"item_code": "GRAND", "required_qty": 8.0}])
	base["sources"] = NESTED
	parent = _target("PARENT", 10, components=[{"item_code": "BASE", "required_qty": 8.0}])
	parent["sources"] = DIRECT
	return [grand, base, parent]


class TestDeriveQuantities(unittest.TestCase):
	def test_pure_sub_assembly_detection(self):
		grand, base, parent = _chain()
		self.assertTrue(is_pure_sub_assembly(base))
		self.assertFalse(is_pure_sub_assembly(parent))
		mixed = dict(base, sources=NESTED + DIRECT)
		self.assertFalse(is_pure_sub_assembly(mixed))
		self.assertFalse(is_pure_sub_assembly(_target("X", 1)))  # no sources key

	def test_demand_minus_stock_never_below_zero(self):
		targets = _chain()
		self.assertEqual(derive_plan_quantities(targets, {}, {})[("BASE", "BOM-BASE")], 8.0)
		self.assertEqual(derive_plan_quantities(targets, {}, {"BASE": 3})[("BASE", "BOM-BASE")], 5.0)
		self.assertEqual(derive_plan_quantities(targets, {}, {"BASE": 99})[("BASE", "BOM-BASE")], 0.0)

	def test_follows_the_parents_edited_quantity(self):
		quantities = derive_plan_quantities(_chain(), {("PARENT", "BOM-PARENT"): 20}, {"BASE": 6})
		self.assertEqual(quantities[("PARENT", "BOM-PARENT")], 20)
		self.assertEqual(quantities[("BASE", "BOM-BASE")], 10.0)  # 16 demanded - 6 in stock

	def test_nested_levels_use_the_netted_parent_production(self):
		# BASE is netted to 5 (8 - 3), so GRAND needs 5, not 8, minus its own stock.
		quantities = derive_plan_quantities(_chain(), {}, {"BASE": 3, "GRAND": 2})
		self.assertEqual(quantities[("BASE", "BOM-BASE")], 5.0)
		self.assertEqual(quantities[("GRAND", "BOM-GRAND")], 3.0)

	def test_stock_covered_parent_zeroes_the_whole_chain(self):
		quantities = derive_plan_quantities(_chain(), {}, {"BASE": 99})
		self.assertEqual(quantities[("BASE", "BOM-BASE")], 0.0)
		self.assertEqual(quantities[("GRAND", "BOM-GRAND")], 0.0)

	def test_an_override_replaces_the_derived_quantity_and_feeds_the_level_below(self):
		quantities = derive_plan_quantities(_chain(), {}, {}, overrides={("BASE", "BOM-BASE"): 20})
		self.assertEqual(quantities[("BASE", "BOM-BASE")], 20)
		self.assertEqual(quantities[("GRAND", "BOM-GRAND")], 20.0)

	def test_direct_targets_keep_their_compiled_quantity(self):
		self.assertEqual(derive_plan_quantities(_chain(), {}, {})[("PARENT", "BOM-PARENT")], 10)


class TestMissingSubAssembly(unittest.TestCase):
	def _bucket(self):
		grand, base, parent = _chain()
		parent["depends_on"] = ["BASE"]
		base["depends_on"] = ["GRAND"]
		return {"targets": [grand, base, parent]}

	def test_drop_removes_the_row_less_sub_assembly_and_prunes_depends_on(self):
		planned = {("GRAND", "BOM-GRAND"): 3.0, ("PARENT", "BOM-PARENT"): 10.0}
		result = apply_quantities_to_bucket(self._bucket(), planned)
		self.assertEqual([t["item_code"] for t in result["targets"]], ["GRAND", "PARENT"])
		self.assertEqual(result["targets"][1]["depends_on"], [])

	def test_zero_keeps_it_for_display_at_quantity_zero(self):
		planned = {("PARENT", "BOM-PARENT"): 10.0}
		result = apply_quantities_to_bucket(self._bucket(), planned, "zero")
		self.assertEqual([t["item_code"] for t in result["targets"]], ["GRAND", "BASE", "PARENT"])
		self.assertEqual(result["targets"][1]["required_qty"], 0)
		self.assertEqual(consumption_by_item(result["targets"]).get("BASE"), 8.0)

	def test_a_missing_direct_target_is_left_alone(self):
		result = apply_quantities_to_bucket(self._bucket(), {})
		self.assertIn("PARENT", [t["item_code"] for t in result["targets"]])

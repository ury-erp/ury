"""Tests for ury_projection_service.project_mto_capacity.

Following the same hermetic mocking pattern as test_ury_availability.py /
test_ury_reservation_service.py: every composed dependency is patched by
name on the module under test --

- `compile_bom_vector` (child-BOM explosions; a per-item fixture table),
- `get_allocatable_qty` (Bin-derived allocatable stock; one fixture map),
- `_has_pre_produced_config` (PRE_PRODUCED config existence; a fixture set),
- `_resolve_active_bom` (active child BOM existence; raises for BOM-less
  items),

so no real BOM/Item/Bin documents are needed. `_fill_made_to_order`
integration is covered indirectly: the availability suite's Stock Available
MTO tests run the projection against real DB reads for fake items (all
zero/falsy), which the fail-soft clamp handles.
"""

from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_projection_service import project_mto_capacity

MODULE = "ury.ury.api.ury_projection_service"

WAREHOUSE = "Kitchen Warehouse - URY"
COMPANY = "Company A"


def _row(component_item, qty_per_unit):
	return {
		"component_item": component_item,
		"qty": qty_per_unit,
		"qty_per_unit": qty_per_unit,
		"stock_uom": "Nos",
	}


class _Harness:
	"""Fixture tables + recording fakes for one projection scenario."""

	def __init__(self, vectors, allocatable, pre_produced=(), bomless=()):
		# vectors: item_code -> [component rows at qty 1] (the compiler
		# already normalizes BOM.quantity batch scaling into qty_per_unit).
		self.vectors = vectors
		# allocatable: item_code -> allocatable qty (finished components AND
		# raw materials share one map; the service does not distinguish).
		self.allocatable = allocatable
		self.pre_produced = set(pre_produced)
		self.bomless = set(bomless)
		self.alloc_calls = []

	def compile_bom_vector(self, item_code, qty, company):
		rows = self.vectors[item_code]
		return {
			"item_code": item_code,
			"bom": "BOM-{0}".format(item_code),
			"qty": qty,
			"company": company,
			"source": "manual_recursion",
			"components": [
				{
					"component_item": row["component_item"],
					"qty": row["qty_per_unit"] * qty,
					"qty_per_unit": row["qty_per_unit"],
					"stock_uom": row["stock_uom"],
				}
				for row in rows
			],
		}

	def get_allocatable_qty(self, item_code, warehouse, company):
		self.alloc_calls.append(item_code)
		return {"allocatable_qty": self.allocatable.get(item_code, 0)}

	def resolve_active_bom(self, item_code, company):
		if item_code in self.bomless:
			raise frappe.ValidationError("no active BOM for {0}".format(item_code))
		return "BOM-{0}".format(item_code)


@contextmanager
def _patched(harness):
	with patch(
		f"{MODULE}.compile_bom_vector", side_effect=harness.compile_bom_vector
	) as mock_compile, patch(
		f"{MODULE}.get_allocatable_qty", side_effect=harness.get_allocatable_qty
	), patch(
		f"{MODULE}._has_pre_produced_config",
		side_effect=lambda item_code: item_code in harness.pre_produced,
	), patch(
		f"{MODULE}._resolve_active_bom", side_effect=harness.resolve_active_bom
	):
		yield mock_compile


def _project(harness, item_code="FIN", **kwargs):
	with _patched(harness):
		return project_mto_capacity(item_code, COMPANY, WAREHOUSE, **kwargs)


class TestProjectMTOCapacity(FrappeTestCase):
	"""MTO-P1..P8: projected-capacity matrix for the Stock Available mode."""

	def test_mto_p1_all_components_available_caps_at_immediate(self):
		# BUN x1 / PATTY x2, both non-toppable, ample finished stock: no
		# top-up candidate exists, max stays at immediate capacity.
		harness = _Harness(
			vectors={"FIN": [_row("BUN", 1), _row("PATTY", 2)]},
			allocatable={"BUN": 50, "PATTY": 20},
		)

		result = _project(
			harness,
			allocatable_by_component={"BUN": 50, "PATTY": 20},
		)

		# immediate = min(50/1, 20/2) = 10; nothing short, nothing projected.
		self.assertEqual(result["immediate_capacity"], 10)
		self.assertEqual(result["max_producible"], 10)
		self.assertEqual(result["projected_shortfalls"], {})
		# The precomputed finished-stock map was honored: no stock re-reads
		# happened at all (every constraint was already known).
		self.assertEqual(harness.alloc_calls, [])

	def test_mto_p2_pre_produced_shortfall_topped_up_from_child_bom(self):
		# RICE (PRE_PRODUCED, x1) has 2 units on hand; its child BOM consumes
		# 0.5 BASMATI + 0.1 GHEE per unit. LEAF is a raw x1 component.
		harness = _Harness(
			vectors={
				"FIN": [_row("RICE", 1), _row("LEAF", 1)],
				"RICE": [_row("BASMATI", 0.5), _row("GHEE", 0.1)],
			},
			allocatable={"RICE": 2, "LEAF": 10, "BASMATI": 10, "GHEE": 10},
			pre_produced={"RICE"},
		)

		result = _project(
			harness,
			immediate_capacity=2,
			allocatable_by_component={"RICE": 2},
		)

		# LEAF caps N at 10; raw materials would allow far more
		# (BASMATI: N-2 <= 20). max_producible rises above immediate, and
		# immediate capacity itself is unchanged.
		self.assertEqual(result["immediate_capacity"], 2)
		self.assertEqual(result["max_producible"], 10)
		# Finished RICE stock was credited before projecting: the raw pool
		# only carries the shortfall beyond the 2 finished units, so RICE's
		# own finished qty is never re-queried via get_allocatable_qty.
		self.assertNotIn("RICE", harness.alloc_calls)
		self.assertIn("LEAF", harness.alloc_calls)

	def test_mto_p3_partial_component_stock_shortfall_is_need_minus_stock(self):
		# X (PRE_PRODUCED, x2) has 5 finished units; RAWX stock allows 4 more
		# final items: demand 2N-5 <= 4 -> N <= 4. At N=4 the unmet finished
		# qty is exactly need - stock = 8 - 5 = 3.
		harness = _Harness(
			vectors={"FIN": [_row("X", 2)], "X": [_row("RAWX", 1)]},
			allocatable={"X": 5, "RAWX": 4},
			pre_produced={"X"},
		)

		result = _project(harness)

		self.assertEqual(result["immediate_capacity"], 2)  # floor(5/2)
		self.assertEqual(result["max_producible"], 4)
		self.assertEqual(result["projected_shortfalls"], {"X": 3})
		self.assertIn("RAWX", result["limiting_factors"])

	def test_mto_p4_shared_raw_material_single_demand_pool(self):
		# COMP-A and COMP-B both consume 0.5 GHEE per unit. GHEE stock (3)
		# is pooled: total demand N*0.5 + N*0.5 = N <= 3. Independent
		# per-component checks would have allowed 6 each (double-counting).
		harness = _Harness(
			vectors={
				"FIN": [_row("COMP-A", 1), _row("COMP-B", 1)],
				"COMP-A": [_row("GHEE", 0.5), _row("RICE", 1)],
				"COMP-B": [_row("GHEE", 0.5), _row("MASALA", 1)],
			},
			allocatable={"COMP-A": 0, "COMP-B": 0, "GHEE": 3, "RICE": 10, "MASALA": 10},
			pre_produced={"COMP-A", "COMP-B"},
		)

		result = _project(harness)

		self.assertEqual(result["immediate_capacity"], 0)
		self.assertEqual(result["max_producible"], 3)
		self.assertEqual(result["projected_shortfalls"], {"COMP-A": 3, "COMP-B": 3})

	def test_mto_p5_three_level_nested_bom_recursion(self):
		# FIN -> BASE (PRE_PRODUCED x1, 1 finished on hand) -> DEEPBASE
		# (PRE_PRODUCED x2 per BASE, 2 finished on hand) -> RICE x3 per
		# DEEPBASE. MASALA is a raw leaf inside BASE's BOM.
		harness = _Harness(
			vectors={
				"FIN": [_row("BASE", 1)],
				"BASE": [_row("DEEPBASE", 2), _row("MASALA", 1)],
				"DEEPBASE": [_row("RICE", 3)],
			},
			allocatable={"BASE": 1, "DEEPBASE": 2, "MASALA": 100, "RICE": 100},
			pre_produced={"BASE", "DEEPBASE"},
		)

		result = _project(harness)

		# BASE shortfall per N: N-1. DEEPBASE need 2(N-1), finished 2 covers
		# part; RICE demand 3*(2(N-1)-2) = 6N-12 <= 100 -> N <= 18.
		self.assertEqual(result["immediate_capacity"], 1)
		self.assertEqual(result["max_producible"], 18)
		self.assertEqual(result["projected_shortfalls"], {"BASE": 17})
		self.assertIn("RICE", result["limiting_factors"])

	def test_mto_p6_circular_bom_reference_terminates(self):
		# CYC (PRE_PRODUCED) lists the final item itself in its child BOM;
		# without the visited set the recursion would never terminate. CYC's
		# finished stock is zero, so immediate capacity is 0 and every N>0
		# demands N units of FIN itself from the (zero) pool.
		harness = _Harness(
			vectors={"FIN": [_row("CYC", 1)], "CYC": [_row("FIN", 1)]},
			allocatable={"CYC": 0, "FIN": 0},
			pre_produced={"CYC"},
		)

		result = _project(harness)

		# Completing at all is the cycle-safety assertion; the visited set
		# also keeps FIN's own BOM out of the recursion (compiled exactly
		# once, for the parent vector only).
		self.assertEqual(result["immediate_capacity"], 0)
		self.assertEqual(result["max_producible"], 0)

	def test_mto_p7_missing_child_bom_caps_at_finished_stock(self):
		# Y carries a PRE_PRODUCED config but has no active submitted child
		# BOM: it cannot be topped up, so its finished stock is the ceiling
		# and its BOM is never exploded.
		harness = _Harness(
			vectors={"FIN": [_row("Y", 1)]},
			allocatable={"Y": 3},
			pre_produced={"Y"},
			bomless={"Y"},
		)

		with _patched(harness) as mock_compile:
			result = project_mto_capacity("FIN", COMPANY, WAREHOUSE)

		self.assertEqual(result["immediate_capacity"], 3)
		self.assertEqual(result["max_producible"], 3)
		compiled_items = {call.args[0] for call in mock_compile.call_args_list}
		self.assertNotIn("Y", compiled_items)

	def test_mto_p8_bom_quantity_scaling_preserved(self):
		# BATCHED (PRE_PRODUCED, x2.5 per FIN) has 10 finished units
		# (immediate = floor(10/2.5) = 4); its child BOM consumes 0.5 RAWM
		# per unit (already normalized for BOM.quantity by the compiler).
		# Demand per extra final item: 2.5 * 0.5 = 1.25 RAWM; stock 120
		# allows exactly 96 more -> max_producible 100 with no float drift.
		harness = _Harness(
			vectors={"FIN": [_row("BATCHED", 2.5)], "BATCHED": [_row("RAWM", 0.5)]},
			allocatable={"BATCHED": 10, "RAWM": 120},
			pre_produced={"BATCHED"},
		)

		result = _project(harness)

		self.assertEqual(result["immediate_capacity"], 4)
		self.assertEqual(result["max_producible"], 100)
		self.assertEqual(result["projected_shortfalls"], {"BATCHED": 240.0})

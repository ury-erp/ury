# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching the test_self_ordering.py
# convention) rather than a live bench -- no bench/Docker is available in
# this task's worktree. These were reviewed by hand (traced call-by-call
# against ury_bom_compiler.py) rather than executed; see the task report for
# that walkthrough. Static validation performed: python3 -m py_compile and
# git diff --check on both files in this change.

import unittest
from unittest.mock import patch

import frappe

from ury.ury.api.ury_bom_compiler import (
    build_demand_vector,
    compile_bom_vector,
    compile_shared_component_index,
    get_items_affected_by_component,
)


MOD = "ury.ury.api.ury_bom_compiler"


def _row(item_code, qty_consumed_per_unit, stock_uom="Nos"):
    return frappe._dict(
        item_code=item_code, qty_consumed_per_unit=qty_consumed_per_unit, stock_uom=stock_uom
    )


class TestCompileBomVectorSingleLevel(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_single_level_bom_compiles_correctly(self, mock_get_value, mock_get_all):
        mock_get_value.return_value = "BOM-BURGER-001"
        mock_get_all.return_value = [
            _row("Bun", 1),
            _row("Patty", 1),
            _row("Cheese Slice", 2),
        ]

        result = compile_bom_vector("Burger", 10, "URY Co")

        self.assertEqual(result["bom"], "BOM-BURGER-001")
        self.assertEqual(result["source"], "bom_explosion_item")
        by_item = {c["component_item"]: c for c in result["components"]}
        self.assertEqual(by_item["Bun"]["qty"], 10)
        self.assertEqual(by_item["Patty"]["qty"], 10)
        self.assertEqual(by_item["Cheese Slice"]["qty"], 20)
        self.assertEqual(by_item["Cheese Slice"]["qty_per_unit"], 2)

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_determinism_same_input_twice_identical_output(self, mock_get_value, mock_get_all):
        mock_get_value.return_value = "BOM-BURGER-001"
        mock_get_all.return_value = [_row("Bun", 1), _row("Patty", 1)]

        first = compile_bom_vector("Burger", 5, "URY Co")
        second = compile_bom_vector("Burger", 5, "URY Co")

        self.assertEqual(first, second)


class TestCompileBomVectorNested(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_nested_bom_falls_back_to_manual_recursion_and_flattens_subassembly(
        self, mock_get_value, mock_get_all
    ):
        # No BOM Explosion Item rows populated -> falls back to manual BOM Item
        # recursion, exploding the sub-assembly (Patty Mix) down to raw items.
        def get_all_side_effect(doctype, filters=None, fields=None, **kwargs):
            if doctype == "BOM Explosion Item":
                return []
            if doctype == "BOM Item":
                parent = filters["parent"]
                if parent == "BOM-COMBO-001":
                    return [
                        frappe._dict(
                            item_code="Patty Mix",
                            stock_qty=1,
                            stock_uom="Nos",
                            is_sub_assembly_item=1,
                            bom_no="BOM-PATTYMIX-001",
                        ),
                        frappe._dict(
                            item_code="Bun",
                            stock_qty=1,
                            stock_uom="Nos",
                            is_sub_assembly_item=0,
                            bom_no=None,
                        ),
                    ]
                if parent == "BOM-PATTYMIX-001":
                    return [
                        frappe._dict(
                            item_code="Beef",
                            stock_qty=0.2,
                            stock_uom="Kg",
                            is_sub_assembly_item=0,
                            bom_no=None,
                        ),
                        frappe._dict(
                            item_code="Spice Mix",
                            stock_qty=0.01,
                            stock_uom="Kg",
                            is_sub_assembly_item=0,
                            bom_no=None,
                        ),
                    ]
            return []

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            # top-level BOM resolution and BOM.quantity lookups
            if doctype == "BOM" and field == "quantity":
                return 1
            if doctype == "BOM" and isinstance(filters, dict) and filters.get("item") == "Combo":
                return "BOM-COMBO-001"
            # BOM.quantity called with bom name as positional filter (frappe.db.get_value(doctype, name, field))
            if doctype == "BOM":
                return 1
            return None

        mock_get_all.side_effect = get_all_side_effect
        mock_get_value.side_effect = get_value_side_effect

        result = compile_bom_vector("Combo", 4, "URY Co")

        self.assertEqual(result["source"], "manual_recursion")
        by_item = {c["component_item"]: c for c in result["components"]}
        self.assertNotIn("Patty Mix", by_item)  # sub-assembly must be flattened away
        self.assertEqual(by_item["Bun"]["qty"], 4)
        self.assertEqual(by_item["Beef"]["qty"], 4 * 0.2)
        self.assertEqual(by_item["Spice Mix"]["qty"], 4 * 0.01)


class TestSharedComponentIndex(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_shared_component_aggregates_across_two_top_level_items(
        self, mock_get_value, mock_get_all
    ):
        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if filters.get("item") == "Burger":
                return "BOM-BURGER-001"
            if filters.get("item") == "Cheese Fries":
                return "BOM-FRIES-001"
            return None

        def get_all_side_effect(doctype, filters=None, fields=None, **kwargs):
            parent = filters["parent"]
            if parent == "BOM-BURGER-001":
                return [_row("Bun", 1), _row("Cheese Slice", 2)]
            if parent == "BOM-FRIES-001":
                return [_row("Cheese Slice", 1), _row("Potato", 3)]
            return []

        mock_get_value.side_effect = get_value_side_effect
        mock_get_all.side_effect = get_all_side_effect

        index = compile_shared_component_index(["Burger", "Cheese Fries"], "URY Co")

        self.assertEqual(len(index["Cheese Slice"]), 2)
        consumers = {row["top_level_item"]: row["qty_per_unit"] for row in index["Cheese Slice"]}
        self.assertEqual(consumers["Burger"], 2)
        self.assertEqual(consumers["Cheese Fries"], 1)
        self.assertEqual(len(index["Bun"]), 1)
        self.assertEqual(len(index["Potato"]), 1)


class TestNoBomFailsClosed(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_item_with_no_bom_raises_validation_error(self, mock_get_value, mock_get_all):
        mock_get_value.return_value = None

        with self.assertRaises(frappe.ValidationError):
            compile_bom_vector("No Recipe Item", 1, "URY Co")

        business_doctype_calls = [
            call for call in mock_get_all.call_args_list
            if call.args and call.args[0] in ("BOM Explosion Item", "BOM Item")
        ]
        self.assertEqual(business_doctype_calls, [])


class TestBuildDemandVector(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_demand_vector_shape_matches_v3_31_expectation_and_aggregates_shared_component(
        self, mock_get_value, mock_get_all
    ):
        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if filters.get("item") == "Burger":
                return "BOM-BURGER-001"
            if filters.get("item") == "Cheese Fries":
                return "BOM-FRIES-001"
            return None

        def get_all_side_effect(doctype, filters=None, fields=None, **kwargs):
            parent = filters["parent"]
            if parent == "BOM-BURGER-001":
                return [_row("Cheese Slice", 2)]
            if parent == "BOM-FRIES-001":
                return [_row("Cheese Slice", 1)]
            return []

        mock_get_value.side_effect = get_value_side_effect
        mock_get_all.side_effect = get_all_side_effect

        snapshot = {
            "company": "URY Co",
            "items": [
                {
                    "item_code": "Burger",
                    "qty": 10,
                    "department": "Kitchen",
                    "production_unit": "Main Kitchen",
                    "policy": "MADE_TO_ORDER",
                    "bom": "BOM-BURGER-001",
                    "bom_revision": 1,
                    "control_mode": "HARD",
                },
                {
                    "item_code": "Cheese Fries",
                    "qty": 5,
                    "department": "Kitchen",
                    "production_unit": "Main Kitchen",
                    "policy": "MADE_TO_ORDER",
                    "bom": "BOM-FRIES-001",
                    "bom_revision": 1,
                    "control_mode": "HARD",
                },
            ],
        }

        rows = build_demand_vector(snapshot)

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(
            set(row.keys()),
            {"component_item", "department", "production_unit", "required_qty", "stock_uom", "control_mode"},
        )
        self.assertEqual(row["component_item"], "Cheese Slice")
        self.assertEqual(row["department"], "Kitchen")
        self.assertEqual(row["production_unit"], "Main Kitchen")
        self.assertEqual(row["required_qty"], 10 * 2 + 5 * 1)
        self.assertEqual(row["control_mode"], "HARD")

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_direct_retail_lines_excluded_from_demand_vector(self, mock_get_value, mock_get_all):
        snapshot = {
            "company": "URY Co",
            "items": [
                {
                    "item_code": "Bottled Water",
                    "qty": 20,
                    "department": "Retail",
                    "production_unit": None,
                    "policy": "DIRECT_RETAIL",
                }
            ],
        }

        rows = build_demand_vector(snapshot)

        self.assertEqual(rows, [])
        mock_get_all.assert_not_called()
        mock_get_value.assert_not_called()

    def test_demand_vector_determinism(self):
        with patch(f"{MOD}.frappe.get_all") as mock_get_all, patch(
            f"{MOD}.frappe.db.get_value"
        ) as mock_get_value:
            mock_get_value.return_value = "BOM-BURGER-001"
            mock_get_all.return_value = [_row("Bun", 1)]

            snapshot = {
                "company": "URY Co",
                "items": [
                    {
                        "item_code": "Burger",
                        "qty": 3,
                        "department": "Kitchen",
                        "production_unit": "Main Kitchen",
                        "policy": "MADE_TO_ORDER",
                    }
                ],
            }

            first = build_demand_vector(snapshot)
            second = build_demand_vector(snapshot)
            self.assertEqual(first, second)


class TestGetItemsAffectedByComponent(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_two_made_to_order_items_sharing_one_component_returns_both(
        self, mock_get_value, mock_get_all
    ):
        def get_all_side_effect(doctype, filters=None, fields=None, pluck=None, **kwargs):
            # First call: get MADE_TO_ORDER items from URY Item Production Configuration
            if doctype == "URY Item Production Configuration":
                return ["Burger", "Cheese Fries"]
            # Subsequent calls: BOM explosion lookups
            parent = filters.get("parent") if filters else None
            if parent == "BOM-BURGER-001":
                return [_row("Cheese Slice", 2), _row("Bun", 1)]
            if parent == "BOM-FRIES-001":
                return [_row("Cheese Slice", 1), _row("Potato", 3)]
            return []

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if filters.get("item") == "Burger":
                return "BOM-BURGER-001"
            if filters.get("item") == "Cheese Fries":
                return "BOM-FRIES-001"
            return None

        mock_get_all.side_effect = get_all_side_effect
        mock_get_value.side_effect = get_value_side_effect

        result = get_items_affected_by_component("Cheese Slice", "Delhi Branch", "URY Co")

        self.assertEqual(len(result), 2)
        consumers = {row["top_level_item"]: row["qty_per_unit"] for row in result}
        self.assertEqual(consumers["Burger"], 2)
        self.assertEqual(consumers["Cheese Fries"], 1)

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_component_used_by_single_made_to_order_item_returns_only_that_item(
        self, mock_get_value, mock_get_all
    ):
        def get_all_side_effect(doctype, filters=None, fields=None, pluck=None, **kwargs):
            if doctype == "URY Item Production Configuration":
                return ["Burger"]
            parent = filters.get("parent") if filters else None
            if parent == "BOM-BURGER-001":
                return [_row("Bun", 1), _row("Patty", 1)]
            return []

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if filters.get("item") == "Burger":
                return "BOM-BURGER-001"
            return None

        mock_get_all.side_effect = get_all_side_effect
        mock_get_value.side_effect = get_value_side_effect

        result = get_items_affected_by_component("Bun", "Delhi Branch", "URY Co")

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["top_level_item"], "Burger")
        self.assertEqual(result[0]["qty_per_unit"], 1)

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_unused_component_returns_empty_list(self, mock_get_value, mock_get_all):
        def get_all_side_effect(doctype, filters=None, fields=None, pluck=None, **kwargs):
            if doctype == "URY Item Production Configuration":
                return ["Burger"]
            parent = filters.get("parent") if filters else None
            if parent == "BOM-BURGER-001":
                return [_row("Bun", 1), _row("Patty", 1)]
            return []

        def get_value_side_effect(doctype, filters, field=None, **kwargs):
            if filters.get("item") == "Burger":
                return "BOM-BURGER-001"
            return None

        mock_get_all.side_effect = get_all_side_effect
        mock_get_value.side_effect = get_value_side_effect

        result = get_items_affected_by_component("Unused Component", "Delhi Branch", "URY Co")

        self.assertEqual(result, [])

    @patch(f"{MOD}.frappe.get_all")
    def test_no_made_to_order_items_returns_empty_list(self, mock_get_all):
        def get_all_side_effect(doctype, filters=None, fields=None, pluck=None, **kwargs):
            if doctype == "URY Item Production Configuration":
                return []
            return []

        mock_get_all.side_effect = get_all_side_effect

        result = get_items_affected_by_component("Cheese Slice", "Delhi Branch", "URY Co")

        self.assertEqual(result, [])

    @patch(f"{MOD}.frappe.throw")
    def test_missing_component_item_raises_validation_error(self, mock_throw):
        mock_throw.side_effect = frappe.ValidationError

        with self.assertRaises(frappe.ValidationError):
            get_items_affected_by_component("", "Delhi Branch", "URY Co")

        mock_throw.assert_called()

    @patch(f"{MOD}.frappe.throw")
    def test_missing_branch_raises_validation_error(self, mock_throw):
        mock_throw.side_effect = frappe.ValidationError

        with self.assertRaises(frappe.ValidationError):
            get_items_affected_by_component("Cheese Slice", "", "URY Co")

        mock_throw.assert_called()

    @patch(f"{MOD}.frappe.throw")
    def test_missing_company_raises_validation_error(self, mock_throw):
        mock_throw.side_effect = frappe.ValidationError

        with self.assertRaises(frappe.ValidationError):
            get_items_affected_by_component("Cheese Slice", "Delhi Branch", "")

        mock_throw.assert_called()


if __name__ == "__main__":
    unittest.main()

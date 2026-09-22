# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching test_ury_bom_compiler.py's
# convention) -- no bench/Docker is available in this task's worktree.

import ast
import unittest
from unittest.mock import patch

import frappe

from ury.ury.api.ury_bom_tree import walk_bom_tree


MOD = "ury.ury.api.ury_bom_tree"


def _bom(item, quantity, docstatus=1, company="URY Co"):
    return frappe._dict(item=item, quantity=quantity, docstatus=docstatus, company=company)


def _row(item_code, stock_qty, stock_uom="Kg", bom_no=None):
    return frappe._dict(item_code=item_code, stock_qty=stock_qty, stock_uom=stock_uom, bom_no=bom_no)


class TestScalesByBomQuantity(unittest.TestCase):
    """A BOM producing 5 units per run must scale its lines by that 5, not by 1."""

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_quantity_other_than_one_scales_lines_correctly(self, mock_get_value, mock_get_all):
        # BOM-BIRYANI-BASE-001 produces 5 Kg of BIRYANI-BASE per run, and
        # consumes 1 Kg of Rice per that 5 Kg batch.
        mock_get_value.return_value = _bom("BIRYANI-BASE", quantity=5)
        mock_get_all.return_value = [_row("Rice", stock_qty=1)]

        nodes = walk_bom_tree("BOM-BIRYANI-BASE-001", 20, "URY Co")

        self.assertEqual(len(nodes), 1)
        # 1 Kg Rice per 5 Kg output -> for 20 Kg required: (1/5)*20 = 4 Kg.
        self.assertEqual(nodes[0]["required_qty"], 4)
        self.assertEqual(nodes[0]["item_code"], "Rice")
        self.assertFalse(nodes[0]["has_bom"])

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_quantity_of_one_behaves_as_before(self, mock_get_value, mock_get_all):
        mock_get_value.return_value = _bom("BURGER", quantity=1)
        mock_get_all.return_value = [_row("Bun", stock_qty=1), _row("Patty", stock_qty=1)]

        nodes = walk_bom_tree("BOM-BURGER-001", 10, "URY Co")

        by_item = {n["item_code"]: n for n in nodes}
        self.assertEqual(by_item["Bun"]["required_qty"], 10)
        self.assertEqual(by_item["Patty"]["required_qty"], 10)


class TestNestedRecursionAndLeaves(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_recurses_through_nested_bom_and_marks_leaves(self, mock_get_value, mock_get_all):
        def get_value_side_effect(doctype, name, fields, as_dict=None):
            return {
                "BOM-CHICKEN-BIRYANI-001": _bom("CHICKEN-BIRYANI", quantity=1),
                "BOM-BIRYANI-BASE-001": _bom("BIRYANI-BASE", quantity=5),
            }.get(name)

        def get_all_side_effect(doctype, filters=None, fields=None, order_by=None, **kwargs):
            parent = filters["parent"]
            if parent == "BOM-CHICKEN-BIRYANI-001":
                return [
                    _row("BIRYANI-BASE", stock_qty=1, bom_no="BOM-BIRYANI-BASE-001"),
                ]
            if parent == "BOM-BIRYANI-BASE-001":
                return [
                    _row("Rice", stock_qty=1),
                    _row("Masala", stock_qty=0.2),
                ]
            return []

        mock_get_value.side_effect = get_value_side_effect
        mock_get_all.side_effect = get_all_side_effect

        nodes = walk_bom_tree("BOM-CHICKEN-BIRYANI-001", 20, "URY Co")

        by_item = {n["item_code"]: n for n in nodes}

        base = by_item["BIRYANI-BASE"]
        self.assertEqual(base["required_qty"], 20)
        self.assertEqual(base["parent_item"], "CHICKEN-BIRYANI")
        self.assertEqual(base["level"], 1)
        self.assertEqual(base["path"], ["CHICKEN-BIRYANI", "BIRYANI-BASE"])
        self.assertTrue(base["has_bom"])
        self.assertEqual(base["bom_no"], "BOM-BIRYANI-BASE-001")

        rice = by_item["Rice"]
        # 1 Kg Rice per 5 Kg BIRYANI-BASE batch, 20 Kg BIRYANI-BASE required -> 4 Kg.
        self.assertEqual(rice["required_qty"], 4)
        self.assertEqual(rice["parent_item"], "BIRYANI-BASE")
        self.assertEqual(rice["level"], 2)
        self.assertEqual(rice["path"], ["CHICKEN-BIRYANI", "BIRYANI-BASE", "Rice"])
        self.assertFalse(rice["has_bom"])
        self.assertIsNone(rice["bom_no"])

        masala = by_item["Masala"]
        self.assertEqual(masala["required_qty"], 0.8)
        self.assertFalse(masala["has_bom"])


class TestCircularReferenceDetection(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_cycle_raises_naming_the_path_instead_of_recursing_forever(
        self, mock_get_value, mock_get_all
    ):
        def get_value_side_effect(doctype, name, fields, as_dict=None):
            return {
                "BOM-A-001": _bom("A", quantity=1),
                "BOM-B-001": _bom("B", quantity=1),
            }.get(name)

        def get_all_side_effect(doctype, filters=None, fields=None, order_by=None, **kwargs):
            parent = filters["parent"]
            if parent == "BOM-A-001":
                return [_row("B", stock_qty=1, bom_no="BOM-B-001")]
            if parent == "BOM-B-001":
                # B's BOM points back at A's BOM -> cycle.
                return [_row("A", stock_qty=1, bom_no="BOM-A-001")]
            return []

        mock_get_value.side_effect = get_value_side_effect
        mock_get_all.side_effect = get_all_side_effect

        with self.assertRaises(frappe.ValidationError) as ctx:
            walk_bom_tree("BOM-A-001", 10, "URY Co")

        self.assertIn("BOM-A-001", str(ctx.exception))

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_shared_subassembly_in_two_branches_is_not_a_cycle(self, mock_get_value, mock_get_all):
        # Diamond, not a cycle: ROOT -> ITEM-A -> SHARED, and separately
        # ROOT -> ITEM-B -> SHARED. SHARED's bom_no is identical on both
        # branches, but the two branches never nest inside one another, so
        # this must walk cleanly -- cycle detection is per-path, not a single
        # set shared across the whole recursion.
        def get_value_side_effect(doctype, name, fields, as_dict=None):
            return {
                "BOM-ROOT-001": _bom("ROOT", quantity=1),
                "BOM-A-001": _bom("ITEM-A", quantity=1),
                "BOM-B-001": _bom("ITEM-B", quantity=1),
                "BOM-SHARED-001": _bom("SHARED", quantity=1),
            }.get(name)

        def get_all_side_effect(doctype, filters=None, fields=None, order_by=None, **kwargs):
            parent = filters["parent"]
            if parent == "BOM-ROOT-001":
                return [
                    _row("ITEM-A", stock_qty=2, bom_no="BOM-A-001"),
                    _row("ITEM-B", stock_qty=3, bom_no="BOM-B-001"),
                ]
            if parent == "BOM-A-001":
                return [_row("SHARED", stock_qty=1, bom_no="BOM-SHARED-001")]
            if parent == "BOM-B-001":
                return [_row("SHARED", stock_qty=1, bom_no="BOM-SHARED-001")]
            if parent == "BOM-SHARED-001":
                return [_row("Filling", stock_qty=0.5)]
            return []

        mock_get_value.side_effect = get_value_side_effect
        mock_get_all.side_effect = get_all_side_effect

        # Must not raise.
        nodes = walk_bom_tree("BOM-ROOT-001", 10, "URY Co")

        shared_nodes = [n for n in nodes if n["item_code"] == "SHARED"]
        filling_nodes = [n for n in nodes if n["item_code"] == "Filling"]

        # The shared sub-assembly appears once per branch.
        self.assertEqual(len(shared_nodes), 2)
        self.assertEqual(len(filling_nodes), 2)

        shared_by_parent = {n["parent_item"]: n for n in shared_nodes}
        filling_by_path = {tuple(n["path"]): n for n in filling_nodes}

        # ITEM-A: 2 per ROOT unit, 10 required -> 20. SHARED: 1 per ITEM-A -> 20.
        self.assertEqual(shared_by_parent["ITEM-A"]["required_qty"], 20)
        self.assertEqual(shared_by_parent["ITEM-A"]["path"], ["ROOT", "ITEM-A", "SHARED"])
        # ITEM-B: 3 per ROOT unit, 10 required -> 30. SHARED: 1 per ITEM-B -> 30.
        self.assertEqual(shared_by_parent["ITEM-B"]["required_qty"], 30)
        self.assertEqual(shared_by_parent["ITEM-B"]["path"], ["ROOT", "ITEM-B", "SHARED"])

        # Filling scales off each branch's own SHARED quantity, independently.
        self.assertEqual(filling_by_path[("ROOT", "ITEM-A", "SHARED", "Filling")]["required_qty"], 10)
        self.assertEqual(filling_by_path[("ROOT", "ITEM-B", "SHARED", "Filling")]["required_qty"], 15)


class TestFailsLoudlyOnMissingOrCancelledBom(unittest.TestCase):
    @patch(f"{MOD}.frappe.db.get_value")
    def test_missing_bom_raises(self, mock_get_value):
        mock_get_value.return_value = None

        with self.assertRaises(frappe.ValidationError):
            walk_bom_tree("BOM-DOES-NOT-EXIST", 10, "URY Co")

    @patch(f"{MOD}.frappe.db.get_value")
    def test_cancelled_bom_raises(self, mock_get_value):
        mock_get_value.return_value = _bom("BURGER", quantity=1, docstatus=2)

        with self.assertRaises(frappe.ValidationError):
            walk_bom_tree("BOM-BURGER-001", 10, "URY Co")

    @patch(f"{MOD}.frappe.db.get_value")
    def test_draft_bom_raises(self, mock_get_value):
        mock_get_value.return_value = _bom("BURGER", quantity=1, docstatus=0)

        with self.assertRaises(frappe.ValidationError):
            walk_bom_tree("BOM-BURGER-001", 10, "URY Co")

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_nested_cancelled_bom_raises(self, mock_get_value, mock_get_all):
        def get_value_side_effect(doctype, name, fields, as_dict=None):
            return {
                "BOM-COMBO-001": _bom("COMBO", quantity=1),
                "BOM-SUB-001": _bom("SUB", quantity=1, docstatus=2),
            }.get(name)

        mock_get_value.side_effect = get_value_side_effect
        mock_get_all.return_value = [_row("SUB", stock_qty=1, bom_no="BOM-SUB-001")]

        with self.assertRaises(frappe.ValidationError):
            walk_bom_tree("BOM-COMBO-001", 10, "URY Co")

    @patch(f"{MOD}.frappe.db.get_value")
    def test_required_qty_must_be_positive(self, mock_get_value):
        with self.assertRaises(frappe.ValidationError):
            walk_bom_tree("BOM-BURGER-001", 0, "URY Co")
        mock_get_value.assert_not_called()

    def test_missing_bom_no_raises(self):
        with self.assertRaises(frappe.ValidationError):
            walk_bom_tree(None, 10, "URY Co")


class TestDeterministicOutput(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_identical_inputs_produce_identical_output(self, mock_get_value, mock_get_all):
        mock_get_value.return_value = _bom("BURGER", quantity=2)
        mock_get_all.return_value = [_row("Bun", stock_qty=1), _row("Patty", stock_qty=1)]

        first = walk_bom_tree("BOM-BURGER-001", 10, "URY Co")
        second = walk_bom_tree("BOM-BURGER-001", 10, "URY Co")

        self.assertEqual(first, second)

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_order_follows_bom_item_idx_order(self, mock_get_value, mock_get_all):
        mock_get_value.return_value = _bom("BURGER", quantity=1)
        mock_get_all.return_value = [_row("Zucchini", stock_qty=1), _row("Apple", stock_qty=1)]

        nodes = walk_bom_tree("BOM-BURGER-001", 1, "URY Co")

        self.assertEqual([n["item_code"] for n in nodes], ["Zucchini", "Apple"])
        _, kwargs = mock_get_all.call_args
        self.assertEqual(kwargs.get("order_by"), "idx asc")


class TestNoItemCodeEntryPoint(unittest.TestCase):
    """Structural guarantee (D3/Agent 1 contract): only `bom_no` gets in."""

    def test_signature_accepts_only_bom_no_required_qty_company(self):
        import inspect

        params = list(inspect.signature(walk_bom_tree).parameters)
        self.assertEqual(params, ["bom_no", "required_qty", "company"])

    def test_module_has_no_resolve_active_bom_style_helper(self):
        import ury.ury.api.ury_bom_tree as module

        names = [name for name in dir(module) if "resolve" in name.lower()]
        self.assertEqual(names, [])


class TestModuleKnowsNothingAboutUrySemantics(unittest.TestCase):
    """This module must not import URY doctypes or URY-semantic modules."""

    FORBIDDEN_SUBSTRINGS = (
        "ury_production_context",
        "ury_availability",
        "ury_production_settings",
    )

    def test_no_forbidden_imports(self):
        import ury.ury.api.ury_bom_tree as module

        source = inspect_getsource_safe(module)
        tree = ast.parse(source)

        imported_modules = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported_modules.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imported_modules.append(node.module)

        for imported in imported_modules:
            for forbidden in self.FORBIDDEN_SUBSTRINGS:
                self.assertNotIn(
                    forbidden,
                    imported,
                    f"ury_bom_tree.py must not import {forbidden!r}, found {imported!r}",
                )

        # Only frappe (and its `_`) are imported at all.
        self.assertEqual(set(imported_modules), {"frappe"})

    def test_no_frappe_db_exists_or_get_all_call_against_a_ury_doctype(self):
        """No call in the module queries a `URY *` doctype (belt-and-suspenders).

        The module docstring itself names the forbidden modules (to document
        why they must never be imported), so a raw substring scan over the
        whole file would false-positive on that explanation. This checks the
        actual doctype string literals passed to frappe.get_all/get_value/
        db.exists calls instead.
        """
        import ury.ury.api.ury_bom_tree as module

        source = inspect_getsource_safe(module)
        tree = ast.parse(source)

        doctype_literals = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                for arg in node.args:
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        doctype_literals.add(arg.value)

        for literal in doctype_literals:
            self.assertFalse(
                literal.startswith("URY "),
                f"ury_bom_tree.py must not reference URY doctype {literal!r}",
            )


def inspect_getsource_safe(module):
    import inspect

    return inspect.getsource(module)


if __name__ == "__main__":
    unittest.main()

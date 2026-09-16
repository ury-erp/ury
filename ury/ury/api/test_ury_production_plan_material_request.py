"""Unit tests for Material Request generation from a Production Plan
(Track-Items N5 "Department stock check" + N6 "Material Request generation").

No live bench/Frappe site is available in this environment, so these tests
mock ``frappe.db.get_value``, ``frappe.get_doc`` and the BOM compiler rather
than hitting a real DB, following the same style as
``test_ury_production_plan_adapter.py`` / ``test_ury_requirements_stock.py``.

Validated with ``python3 -m py_compile`` only (no pytest/bench run performed
-- no bench available in this worktree).
"""

import unittest
from unittest import mock

from ury.ury.api import ury_production_plan_material_request as mr_module


def make_plan(po_items):
    return {"company": "URY Test Co", "po_items": po_items}


class FakeInsertedDoc:
    """Stand-in for a Frappe document returned by frappe.get_doc({...})."""

    _counter = 0

    def __init__(self, fields):
        self.fields = fields
        FakeInsertedDoc._counter += 1
        self.name = "MR-{0:04d}".format(FakeInsertedDoc._counter)

    def insert(self, ignore_permissions=False):
        pass


class GenerateMaterialRequestsTests(unittest.TestCase):
    def setUp(self):
        FakeInsertedDoc._counter = 0
        self.created_docs = []

    def _fake_get_doc(self, fields):
        doc = FakeInsertedDoc(fields)
        self.created_docs.append(doc)
        return doc

    def _run(self, plan, bin_qty_by_key, min_order_qty_by_item=None, store_warehouse="Store WH - U"):
        """bin_qty_by_key: {(item_code, warehouse): actual_qty}"""
        min_order_qty_by_item = min_order_qty_by_item or {}

        def fake_get_value(doctype, filters, fieldname=None):
            if doctype == "Bin":
                key = (filters.get("item_code"), filters.get("warehouse"))
                return bin_qty_by_key.get(key, 0.0)
            if doctype == "Item":
                return min_order_qty_by_item.get(filters)
            raise AssertionError("Unexpected frappe.db.get_value call: {0} {1}".format(doctype, filters))

        with mock.patch.object(mr_module, "get_store_warehouse", return_value=store_warehouse), \
                mock.patch.object(mr_module.frappe.db, "get_value", side_effect=fake_get_value), \
                mock.patch.object(mr_module.frappe, "get_doc", side_effect=self._fake_get_doc), \
                mock.patch.object(mr_module.frappe.utils, "nowdate", return_value="2026-09-16"):
            return mr_module.generate_material_requests_for_production_plan(plan)

    def test_short_stock_produces_both_purchase_and_transfer(self):
        # BOM: 1 x FINISHED-A needs 2 x RAW-1 (mocked via compile_bom_vector)
        plan = make_plan(
            [
                {
                    "item_code": "FINISHED-A",
                    "bom_no": "BOM-A",
                    "planned_qty": 10,
                    "warehouse": "Kitchen WH - U",
                    "custom_ury_department": "Kitchen",
                }
            ]
        )
        vector = {
            "components": [
                {"component_item": "RAW-1", "qty": 20.0, "stock_uom": "Kg"},
            ]
        }
        # Department has 5 in stock, needs 20 -> net need 15.
        # Store has 5 in stock, aggregate requirement 15 -> purchase 10.
        bin_qty = {
            ("RAW-1", "Kitchen WH - U"): 5.0,
            ("RAW-1", "Store WH - U"): 5.0,
        }
        with mock.patch.object(mr_module, "compile_bom_vector", return_value=vector):
            result = self._run(plan, bin_qty)

        self.assertEqual(len(result["purchase_material_requests"]), 1)
        self.assertEqual(len(result["transfer_material_requests"]), 1)
        self.assertEqual(result["skipped_sufficient_stock"], [])
        self.assertEqual(result["department_stock_used"][("Kitchen", "RAW-1")], 5.0)

        purchase_doc = self.created_docs[0]
        self.assertEqual(purchase_doc.fields["material_request_type"], "Purchase")
        self.assertEqual(purchase_doc.fields["items"][0]["qty"], 10.0)
        self.assertEqual(purchase_doc.fields["items"][0]["warehouse"], "Store WH - U")

        transfer_doc = self.created_docs[1]
        self.assertEqual(transfer_doc.fields["material_request_type"], "Material Transfer")
        self.assertEqual(transfer_doc.fields["items"][0]["qty"], 15.0)
        self.assertEqual(transfer_doc.fields["items"][0]["warehouse"], "Kitchen WH - U")
        self.assertEqual(transfer_doc.fields["items"][0]["from_warehouse"], "Store WH - U")

    def test_sufficient_department_stock_skips_both_legs(self):
        plan = make_plan(
            [
                {
                    "item_code": "FINISHED-A",
                    "bom_no": "BOM-A",
                    "planned_qty": 10,
                    "warehouse": "Kitchen WH - U",
                    "custom_ury_department": "Kitchen",
                }
            ]
        )
        vector = {
            "components": [
                {"component_item": "RAW-1", "qty": 20.0, "stock_uom": "Kg"},
            ]
        }
        # Department already has enough (>= required).
        bin_qty = {
            ("RAW-1", "Kitchen WH - U"): 25.0,
            ("RAW-1", "Store WH - U"): 0.0,
        }
        with mock.patch.object(mr_module, "compile_bom_vector", return_value=vector):
            result = self._run(plan, bin_qty)

        self.assertEqual(result["purchase_material_requests"], [])
        self.assertEqual(result["transfer_material_requests"], [])
        self.assertEqual(
            result["skipped_sufficient_stock"],
            [{"department": "Kitchen", "item_code": "RAW-1"}],
        )
        self.assertEqual(result["department_stock_used"], {})

    def test_sufficient_store_stock_only_produces_transfer(self):
        plan = make_plan(
            [
                {
                    "item_code": "FINISHED-A",
                    "bom_no": "BOM-A",
                    "planned_qty": 10,
                    "warehouse": "Kitchen WH - U",
                    "custom_ury_department": "Kitchen",
                }
            ]
        )
        vector = {
            "components": [
                {"component_item": "RAW-1", "qty": 20.0, "stock_uom": "Kg"},
            ]
        }
        # Department is short (has 0, needs 20 -> net need 20).
        # Store has plenty (50) to cover it -> no Purchase MR.
        bin_qty = {
            ("RAW-1", "Kitchen WH - U"): 0.0,
            ("RAW-1", "Store WH - U"): 50.0,
        }
        with mock.patch.object(mr_module, "compile_bom_vector", return_value=vector):
            result = self._run(plan, bin_qty)

        self.assertEqual(result["purchase_material_requests"], [])
        self.assertEqual(len(result["transfer_material_requests"]), 1)
        transfer_doc = self.created_docs[0]
        self.assertEqual(transfer_doc.fields["items"][0]["qty"], 20.0)
        self.assertEqual(result["skipped_sufficient_stock"], [])

    def test_unset_store_warehouse_raises_clear_error(self):
        plan = make_plan(
            [
                {
                    "item_code": "FINISHED-A",
                    "bom_no": "BOM-A",
                    "planned_qty": 10,
                    "warehouse": "Kitchen WH - U",
                    "custom_ury_department": "Kitchen",
                }
            ]
        )
        with mock.patch.object(mr_module, "compile_bom_vector"):
            with self.assertRaises(mr_module.frappe.ValidationError):
                self._run(plan, {}, store_warehouse=None)

    def test_min_order_qty_bumps_purchase_quantity(self):
        plan = make_plan(
            [
                {
                    "item_code": "FINISHED-A",
                    "bom_no": "BOM-A",
                    "planned_qty": 1,
                    "warehouse": "Kitchen WH - U",
                    "custom_ury_department": "Kitchen",
                }
            ]
        )
        vector = {
            "components": [
                {"component_item": "RAW-1", "qty": 2.0, "stock_uom": "Kg"},
            ]
        }
        # Department short by 2, store has 0 -> raw purchase need = 2, but
        # min_order_qty is 50, so purchase qty should be bumped to 50.
        bin_qty = {
            ("RAW-1", "Kitchen WH - U"): 0.0,
            ("RAW-1", "Store WH - U"): 0.0,
        }
        with mock.patch.object(mr_module, "compile_bom_vector", return_value=vector):
            result = self._run(plan, bin_qty, min_order_qty_by_item={"RAW-1": 50.0})

        purchase_doc = self.created_docs[0]
        self.assertEqual(purchase_doc.fields["items"][0]["qty"], 50.0)
        self.assertEqual(len(result["purchase_material_requests"]), 1)


if __name__ == "__main__":
    unittest.main()

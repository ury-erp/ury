"""Unit tests for the Sales Plan -> Production Plan adapter (V3-24).

No live bench/Frappe site is available in this environment, so these tests
avoid frappe.tests.UnitTestCase / the ORM entirely. ``FakeDoc`` stands in for
a Frappe document, exposing only ``.get(...)`` -- the same surface the
adapter uses -- so behaviour is exercised the same way it would be against a
real ``frappe.model.document.Document``.

Static review note: these tests are written against CPython's stdlib
``unittest`` and were validated with ``python3 -m py_compile`` only (no
pytest/bench run performed, per task instructions -- no bench available in
this worktree). Test logic has been manually re-checked below rather than
executed against a live site.
"""

import json
import unittest
from unittest import mock

from ury.ury.api.ury_production_plan_adapter import (
    UnapprovedSalesPlanError,
    _build_department_index,
    adapt_sales_plan_to_production_plan,
)


def _warehouse_for_department(dt, department, fieldname):
    """Stand-in for frappe.db.get_value("URY Production Department", dept,
    "department_warehouse") used by tests below, keyed off department name.
    """
    mapping = {
        "Kitchen": "Kitchen Warehouse - U",
        "Bakery": "Bakery Warehouse - U",
    }
    return mapping.get(department)


class FakeDoc(dict):
    """Dict-like stand-in for a Frappe document; only .get(...) is used."""


def make_snapshot(items=None, **overrides):
    payload = {
        "branch": "Main Branch",
        "company": "URY Test Co",
        "plan_date": "2026-08-01",
        "service_period": "Dinner",
        "items": items
        if items is not None
        else [
            {
                "item_code": "ITEM-A",
                "qty": 10,
                "stock_uom": "Nos",
                "department": "Kitchen",
                "production_unit": "Unit A",
                "production_policy": "PRE_PRODUCED",
                "bom": "BOM-ITEM-A-001",
                "bom_revision": 1,
            },
            {
                "item_code": "ITEM-B",
                "qty": 5,
                "stock_uom": "Nos",
                "department": "Bakery",
                "production_unit": "Unit B",
                "production_policy": "PRE_PRODUCED",
                "bom": "BOM-ITEM-B-001",
                "bom_revision": 2,
            },
        ],
        "insight_snapshot": {},
    }
    payload.update(overrides)
    return payload


def make_approved_doc(snapshot=None, status="Approved", name="SP-0001"):
    snapshot = snapshot if snapshot is not None else make_snapshot()
    encoded = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), default=str)
    return FakeDoc(
        name=name,
        status=status,
        company=snapshot.get("company"),
        approval_snapshot=encoded,
        approval_snapshot_hash="deadbeef",
    )


class AdaptSalesPlanToProductionPlanTests(unittest.TestCase):
    def setUp(self):
        # _snapshot_item_to_production_plan_item resolves the item's
        # Finished Goods Warehouse via frappe.db.get_value("URY Production
        # Department", department, "department_warehouse"); no live site is
        # available here, so it is mocked for every test in this class,
        # following the same FakeDoc-only-.get() style used for the rest of
        # this file.
        patcher = mock.patch(
            "frappe.db.get_value", side_effect=_warehouse_for_department
        )
        self.mock_get_value = patcher.start()
        self.addCleanup(patcher.stop)

        # _filter_items_in_scope's sellable-item defence hits
        # frappe.get_all("Item", ...); default every item_code sellable so
        # existing tests (not concerned with that check) are unaffected.
        # test_excludes_non_sellable_items below overrides this per-test.
        get_all_patcher = mock.patch(
            "ury.ury.api.ury_production_plan_adapter.frappe.get_all",
            side_effect=lambda doctype, filters=None, pluck=None, **kw: list(
                (filters or {}).get("name", [""])[1]
            ),
        )
        self.mock_get_all = get_all_patcher.start()
        self.addCleanup(get_all_patcher.stop)

    def test_rejects_plan_with_no_status(self):
        doc = FakeDoc(name="SP-DRAFT", status="Draft", approval_snapshot=None)
        with self.assertRaises(UnapprovedSalesPlanError):
            adapt_sales_plan_to_production_plan(doc)

    def test_rejects_approved_status_without_snapshot(self):
        # Defensive: a doc claiming "Approved" but missing the frozen
        # snapshot (e.g. corrupted/partial data) must still be rejected.
        doc = FakeDoc(name="SP-BROKEN", status="Approved", approval_snapshot="")
        with self.assertRaises(UnapprovedSalesPlanError):
            adapt_sales_plan_to_production_plan(doc)

    def test_rejects_submitted_for_approval_status(self):
        doc = make_approved_doc(status="Submitted for Approval")
        # Submitted-for-Approval plans have no frozen snapshot per
        # ury_sales_plan.transition_sales_plan; simulate that directly.
        doc["approval_snapshot"] = None
        with self.assertRaises(UnapprovedSalesPlanError):
            adapt_sales_plan_to_production_plan(doc)

    def test_accepts_approved_and_locked_for_production(self):
        for status in ("Approved", "Locked for Production"):
            doc = make_approved_doc(status=status)
            result = adapt_sales_plan_to_production_plan(doc)
            self.assertEqual(result["doctype"], "Production Plan")

    def test_deterministic_same_input_same_output(self):
        doc1 = make_approved_doc()
        doc2 = make_approved_doc()
        result1 = adapt_sales_plan_to_production_plan(doc1)
        result2 = adapt_sales_plan_to_production_plan(doc2)
        self.assertEqual(result1, result2)

    def test_preserves_item_qty_and_code_fidelity(self):
        doc = make_approved_doc()
        result = adapt_sales_plan_to_production_plan(doc)
        po_items = result["po_items"]
        self.assertEqual(len(po_items), 2)
        self.assertEqual(po_items[0]["item_code"], "ITEM-A")
        self.assertEqual(po_items[0]["planned_qty"], 10)
        self.assertEqual(po_items[0]["bom_no"], "BOM-ITEM-A-001")
        self.assertEqual(po_items[1]["item_code"], "ITEM-B")
        self.assertEqual(po_items[1]["planned_qty"], 5)
        self.assertEqual(result["total_planned_qty"], 15)

    def test_preserves_department_grouping(self):
        doc = make_approved_doc()
        result = adapt_sales_plan_to_production_plan(doc)
        index = result["_ury_department_index"]
        self.assertEqual(index["Kitchen"], [0])
        self.assertEqual(index["Bakery"], [1])
        # Cross-check against each po_items row's own namespaced department.
        for department, positions in index.items():
            for position in positions:
                self.assertEqual(
                    result["po_items"][position]["_ury_department"], department
                )

    def test_department_index_groups_multiple_items_same_department(self):
        snapshot = make_snapshot(
            items=[
                {"item_code": "A", "qty": 1, "department": "Kitchen", "bom": "B1"},
                {"item_code": "B", "qty": 2, "department": "Kitchen", "bom": "B2"},
                {"item_code": "C", "qty": 3, "department": "Bar", "bom": "B3"},
            ]
        )
        index = _build_department_index(snapshot["items"])
        self.assertEqual(index["Kitchen"], [0, 1])
        self.assertEqual(index["Bar"], [2])

    def test_unmapped_fields_are_reported_not_guessed(self):
        doc = make_approved_doc()
        result = adapt_sales_plan_to_production_plan(doc)
        self.assertIn("get_items_from", result["_unmapped_fields"]["production_plan"])
        # "warehouse" (Finished Goods Warehouse) is populated as of
        # Track-Item N2 and must no longer be listed as unmapped.
        self.assertNotIn(
            "warehouse", result["_unmapped_fields"]["production_plan_item"]
        )
        self.assertIn(
            "planned_end_date", result["_unmapped_fields"]["production_plan_item"]
        )
        # None of the unmapped fields should have been silently populated
        # with a guessed value on the parent dict.
        for field in result["_unmapped_fields"]["production_plan"]:
            self.assertNotIn(field, result)

    def test_no_erpnext_document_mutation_apis_invoked(self):
        """The adapter must never call insert/save/submit/db_set on anything.

        We patch frappe.get_doc (the only plausible way this module could
        reach a real document) and assert it is never called; we also
        confirm the returned value is a plain dict, not anything exposing
        Frappe Document mutation methods.
        """
        doc = make_approved_doc()
        with mock.patch("frappe.get_doc") as mocked_get_doc:
            result = adapt_sales_plan_to_production_plan(doc)
            mocked_get_doc.assert_not_called()
        self.assertIsInstance(result, dict)
        for mutating_method in ("insert", "save", "submit", "db_set", "delete"):
            self.assertFalse(hasattr(result, mutating_method))

    def test_accepts_plain_dict_snapshot_not_only_json_string(self):
        snapshot = make_snapshot()
        doc = FakeDoc(
            name="SP-DICT",
            status="Approved",
            company=snapshot["company"],
            approval_snapshot=snapshot,  # dict, not JSON string
            approval_snapshot_hash="abc123",
        )
        result = adapt_sales_plan_to_production_plan(doc)
        self.assertEqual(len(result["po_items"]), 2)

    def test_direct_retail_items_excluded(self):
        snapshot = make_snapshot(
            items=[
                {
                    "item_code": "PP-1",
                    "qty": 4,
                    "stock_uom": "Nos",
                    "department": "Kitchen",
                    "production_policy": "PRE_PRODUCED",
                    "bom": "BOM-PP-1",
                },
                {
                    "item_code": "DR-1",
                    "qty": 6,
                    "stock_uom": "Nos",
                    "department": "Bakery",
                    "production_policy": "DIRECT_RETAIL",
                    "bom": "BOM-DR-1",
                },
            ]
        )
        doc = make_approved_doc(snapshot=snapshot)
        result = adapt_sales_plan_to_production_plan(doc)
        item_codes = [row["item_code"] for row in result["po_items"]]
        self.assertEqual(item_codes, ["PP-1"])
        self.assertEqual(result["total_planned_qty"], 4)

    def test_non_sellable_items_excluded_even_if_pre_produced(self):
        """Last-gate defence: a sub-assembly leaked in with a PRE_PRODUCED
        config must still never reach a Production Plan's po_items."""
        snapshot = make_snapshot(
            items=[
                {
                    "item_code": "PP-1",
                    "qty": 4,
                    "stock_uom": "Nos",
                    "department": "Kitchen",
                    "production_policy": "PRE_PRODUCED",
                    "bom": "BOM-PP-1",
                },
                {
                    "item_code": "SUB-1",
                    "qty": 2,
                    "stock_uom": "Nos",
                    "department": "Kitchen",
                    "production_policy": "PRE_PRODUCED",
                    "bom": "BOM-SUB-1",
                },
            ]
        )
        doc = make_approved_doc(snapshot=snapshot)
        with mock.patch(
            "ury.ury.api.ury_production_plan_adapter.frappe.get_all",
            return_value=["PP-1"],
        ):
            result = adapt_sales_plan_to_production_plan(doc)
        item_codes = [row["item_code"] for row in result["po_items"]]
        self.assertEqual(item_codes, ["PP-1"])

    def test_made_to_order_items_excluded(self):
        # Made-to-order items are excluded per Track-Item N2's scope: the
        # snapshot shape does not currently identify a MADE_TO_ORDER row's
        # pre-produced inner-BOM sub-items, so plain MADE_TO_ORDER rows are
        # dropped rather than guessed at.
        snapshot = make_snapshot(
            items=[
                {
                    "item_code": "MTO-1",
                    "qty": 2,
                    "stock_uom": "Nos",
                    "department": "Kitchen",
                    "production_policy": "MADE_TO_ORDER",
                    "bom": "BOM-MTO-1",
                },
            ]
        )
        doc = make_approved_doc(snapshot=snapshot)
        result = adapt_sales_plan_to_production_plan(doc)
        self.assertEqual(result["po_items"], [])

    def test_pre_produced_items_get_warehouse_department_and_start_date(self):
        doc = make_approved_doc()
        result = adapt_sales_plan_to_production_plan(doc)
        po_items = result["po_items"]

        row_a = po_items[0]
        self.assertEqual(row_a["custom_ury_department"], "Kitchen")
        self.assertEqual(row_a["warehouse"], "Kitchen Warehouse - U")
        self.assertEqual(row_a["planned_start_date"], "2026-08-01")
        # Backwards-compat key is still populated alongside the real field.
        self.assertEqual(row_a["_ury_department"], "Kitchen")

        row_b = po_items[1]
        self.assertEqual(row_b["custom_ury_department"], "Bakery")
        self.assertEqual(row_b["warehouse"], "Bakery Warehouse - U")
        self.assertEqual(row_b["planned_start_date"], "2026-08-01")

        self.mock_get_value.assert_any_call(
            "URY Production Department", "Kitchen", "department_warehouse"
        )
        self.mock_get_value.assert_any_call(
            "URY Production Department", "Bakery", "department_warehouse"
        )

    def test_warehouse_is_none_when_department_unresolved(self):
        snapshot = make_snapshot(
            items=[
                {
                    "item_code": "PP-2",
                    "qty": 1,
                    "stock_uom": "Nos",
                    "department": "Unknown Dept",
                    "production_policy": "PRE_PRODUCED",
                    "bom": "BOM-PP-2",
                },
            ]
        )
        doc = make_approved_doc(snapshot=snapshot)
        result = adapt_sales_plan_to_production_plan(doc)
        self.assertIsNone(result["po_items"][0]["warehouse"])


if __name__ == "__main__":
    unittest.main()

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
                "production_policy": "Make",
                "bom": "BOM-ITEM-A-001",
                "bom_revision": 1,
            },
            {
                "item_code": "ITEM-B",
                "qty": 5,
                "stock_uom": "Nos",
                "department": "Bakery",
                "production_unit": "Unit B",
                "production_policy": "Make",
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
        self.assertIn(
            "warehouse", result["_unmapped_fields"]["production_plan_item"]
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


if __name__ == "__main__":
    unittest.main()

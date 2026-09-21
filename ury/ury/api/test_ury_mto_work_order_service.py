"""Tests for ury_mto_work_order_service (N4).

Static-review note: no live bench/site/DB is available in this environment
-- these tests mock `frappe.db.exists`, `frappe.get_doc`, `frappe.get_meta`,
`frappe.db.get_value`, `frappe.db.set_value`, `frappe.db.savepoint`, and
`resolve_production_context` at the module boundary, following the same
mocking pattern as `test_ury_mto_fulfilment_service.py`.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_mto_work_order_service import create_work_orders_for_kot

MODULE = "ury.ury.api.ury_mto_work_order_service"


def _kot_item_row(name, item, quantity=2, work_order=None):
    row = frappe._dict(
        {
            "name": name,
            "item": item,
            "item_name": item,
            "quantity": quantity,
            "custom_ury_work_order": work_order,
        }
    )
    return row


def _make_kot_doc(branch="Branch A", rows=None):
    # frappe._dict is a dict subclass whose __setattr__ writes into the dict
    # itself, so a plain instance-attribute override of `.get` (as this
    # helper used to attempt) is silently shadowed by the real, inherited
    # `dict.get` at attribute-lookup time -- `kot.get("kot_items")` would
    # always miss and return `None`/default. Put `kot_items` directly in the
    # dict instead so the real `dict.get` finds it.
    return frappe._dict({"name": "KOT-1", "branch": branch, "kot_items": rows or []})


def _context(policy="MADE_TO_ORDER", company="Company A", warehouse="WH - C", bom=None):
    return frappe._dict(
        {
            "production_policy": policy,
            "company": company,
            "warehouse": warehouse,
            "bom": bom,
            "get": lambda key, default=None: {
                "production_policy": policy,
                "company": company,
                "warehouse": warehouse,
                "bom": bom,
            }.get(key, default),
        }
    )


def _new_doc_recorder():
    created = []

    def _get_doc(*args, **kwargs):
        arg = args[0] if args else None
        if isinstance(arg, dict):
            doc = frappe._dict(dict(arg))
            doc.name = f"WO-{len(created) + 1}"
            doc.insert = MagicMock()
            doc.submit = MagicMock()
            created.append(doc)
            return doc
        raise AssertionError("unexpected frappe.get_doc(name) call in this test")

    return _get_doc, created


class TestCreateWorkOrdersForKot(FrappeTestCase):
    def test_made_to_order_item_with_bom_creates_submitted_work_order(self):
        rows = [_kot_item_row("row-1", "ITEM-MTO")]
        kot = _make_kot_doc(rows=rows)
        get_doc_side_effect, created = _new_doc_recorder()

        def _get_doc(doctype_or_dict, name=None):
            if isinstance(doctype_or_dict, dict):
                return get_doc_side_effect(doctype_or_dict)
            assert doctype_or_dict == "URY KOT"
            return kot

        with patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=_get_doc
        ), patch(f"{MODULE}.frappe.get_meta") as mock_get_meta, patch(
            f"{MODULE}.resolve_production_context", return_value=_context()
        ), patch(
            f"{MODULE}.frappe.db.get_value", return_value="BOM-ITEM-MTO-001"
        ), patch(
            f"{MODULE}.frappe.db.set_value"
        ) as mock_set_value, patch(
            f"{MODULE}.frappe.db.savepoint"
        ):
            mock_get_meta.return_value.has_field.return_value = True
            result = create_work_orders_for_kot("KOT-1")

        self.assertEqual(len(result["created"]), 1)
        self.assertEqual(result["created"][0]["item_code"], "ITEM-MTO")
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["skipped"], [])
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["production_item"], "ITEM-MTO")
        self.assertEqual(created[0]["bom_no"], "BOM-ITEM-MTO-001")
        self.assertEqual(created[0]["qty"], 2)
        created[0].insert.assert_called_once()
        created[0].submit.assert_called_once()
        mock_set_value.assert_called_once_with(
            "URY KOT Items", "row-1", "custom_ury_work_order", created[0].name
        )

    def test_pre_produced_and_direct_retail_items_are_skipped(self):
        rows = [
            _kot_item_row("row-1", "ITEM-PRE"),
            _kot_item_row("row-2", "ITEM-RETAIL"),
        ]
        kot = _make_kot_doc(rows=rows)
        get_doc_side_effect, created = _new_doc_recorder()

        contexts = {
            "ITEM-PRE": _context(policy="PRE_PRODUCED"),
            "ITEM-RETAIL": _context(policy="DIRECT_RETAIL"),
        }

        def _get_doc(doctype_or_dict, name=None):
            if isinstance(doctype_or_dict, dict):
                return get_doc_side_effect(doctype_or_dict)
            return kot

        with patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=_get_doc
        ), patch(f"{MODULE}.frappe.get_meta") as mock_get_meta, patch(
            f"{MODULE}.resolve_production_context",
            side_effect=lambda item, branch: contexts[item],
        ), patch(
            f"{MODULE}.frappe.db.savepoint"
        ):
            mock_get_meta.return_value.has_field.return_value = True
            result = create_work_orders_for_kot("KOT-1")

        self.assertEqual(result["created"], [])
        self.assertEqual(created, [])
        self.assertEqual(len(result["skipped"]), 2)
        reasons = {s["item_code"]: s["reason"] for s in result["skipped"]}
        self.assertEqual(reasons["ITEM-PRE"], "NOT_MADE_TO_ORDER")
        self.assertEqual(reasons["ITEM-RETAIL"], "NOT_MADE_TO_ORDER")

    def test_recall_for_same_kot_does_not_duplicate_work_orders(self):
        """A row that already has `custom_ury_work_order` set is skipped on
        a re-invocation -- idempotency."""
        rows = [_kot_item_row("row-1", "ITEM-MTO", work_order="WO-EXISTING")]
        kot = _make_kot_doc(rows=rows)
        get_doc_side_effect, created = _new_doc_recorder()

        def _get_doc(doctype_or_dict, name=None):
            if isinstance(doctype_or_dict, dict):
                return get_doc_side_effect(doctype_or_dict)
            return kot

        with patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=_get_doc
        ), patch(f"{MODULE}.frappe.get_meta") as mock_get_meta, patch(
            f"{MODULE}.resolve_production_context", return_value=_context()
        ), patch(
            f"{MODULE}.frappe.db.savepoint"
        ):
            mock_get_meta.return_value.has_field.return_value = True
            result = create_work_orders_for_kot("KOT-1")

        self.assertEqual(result["created"], [])
        self.assertEqual(created, [])
        self.assertEqual(len(result["skipped"]), 1)
        self.assertEqual(result["skipped"][0]["reason"], "ALREADY_HAS_WORK_ORDER")
        self.assertEqual(result["skipped"][0]["work_order"], "WO-EXISTING")

    def test_item_with_no_resolvable_bom_is_recorded_under_errors_without_raising(self):
        rows = [_kot_item_row("row-1", "ITEM-NO-BOM")]
        kot = _make_kot_doc(rows=rows)
        get_doc_side_effect, created = _new_doc_recorder()

        def _get_doc(doctype_or_dict, name=None):
            if isinstance(doctype_or_dict, dict):
                return get_doc_side_effect(doctype_or_dict)
            return kot

        with patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=_get_doc
        ), patch(f"{MODULE}.frappe.get_meta") as mock_get_meta, patch(
            f"{MODULE}.resolve_production_context", return_value=_context()
        ), patch(
            f"{MODULE}.frappe.db.get_value", return_value=None
        ), patch(
            f"{MODULE}.frappe.db.savepoint"
        ), patch(
            f"{MODULE}.frappe.db.rollback"
        ), patch(
            f"{MODULE}.frappe.log_error"
        ) as mock_log_error:
            mock_get_meta.return_value.has_field.return_value = True
            result = create_work_orders_for_kot("KOT-1")

        self.assertEqual(result["created"], [])
        self.assertEqual(created, [])
        self.assertEqual(len(result["errors"]), 1)
        self.assertEqual(result["errors"][0]["item_code"], "ITEM-NO-BOM")
        mock_log_error.assert_called_once()

    def test_nonexistent_kot_returns_error_without_raising(self):
        with patch(f"{MODULE}.frappe.db.exists", return_value=False):
            result = create_work_orders_for_kot("KOT-DOES-NOT-EXIST")

        self.assertEqual(result["created"], [])
        self.assertEqual(len(result["errors"]), 1)
        self.assertEqual(result["errors"][0]["reason"], "KOT_NOT_FOUND")

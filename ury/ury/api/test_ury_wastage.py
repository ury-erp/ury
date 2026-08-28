import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_wastage import (
    approve_wastage,
    capture_wastage,
    compute_wastage_valuation,
    held_quantity,
    list_wastage,
    reject_wastage,
)


MODULE = "ury.ury.api.ury_wastage"


def _auth_doc(**values):
    doc = frappe._dict(
        {
            "name": "AUTH-1",
            "plan": "PLAN-1",
            "branch": "Branch A",
            "company": "Company A",
            "department": "DEPT-1",
            "production_unit": None,
            "component_item": "COMP-1",
            "stock_uom": "Nos",
            "status": "Authorized",
            "authorized_qty": 10,
        }
    )
    doc.update(values)
    return doc


def _new_doc_recorder():
    created = {}

    def _get_doc(*args, **kwargs):
        arg = args[0] if args else kwargs.get("arg1")
        if isinstance(arg, dict):
            doc = frappe._dict(arg)
            doc.insert = MagicMock()
            doc.save = MagicMock()
            created["doc"] = doc
            return doc
        raise AssertionError("other lookups should be mocked separately")

    return _get_doc, created


class TestCaptureWastage(FrappeTestCase):
    def setUp(self):
        # capture_wastage() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_capture_succeeds_within_held_qty(self):
        auth_doc = _auth_doc()
        new_doc_side_effect, created = _new_doc_recorder()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Issue Authorization":
                return auth_doc
            return new_doc_side_effect(*args, **kwargs)

        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), patch(
            f"{MODULE}.frappe.db.get_value", return_value="Company A"
        ), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            result = capture_wastage(
                issue_authorization="AUTH-1",
                wasted_qty=3,
                reason_category="Spoilage",
                branch="Branch A",
                company="Company A",
            )

        self.assertEqual(result.status, "Draft")
        self.assertEqual(result.wasted_qty, 3)
        self.assertEqual(result.held_qty_before, 10)
        audit = json.loads(result.audit_log)
        self.assertEqual(audit[0]["event"], "captured")
        result.insert.assert_called_once()

    def test_capture_rejected_when_exceeding_held_qty(self):
        # authorized_qty=10, 8 already approved-wasted -> held=2, request 3 fails.
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=auth_doc), patch(
            f"{MODULE}.frappe.db.get_value", return_value="Company A"
        ), patch(
            f"{MODULE}.frappe.get_all",
            return_value=[{"name": "W-1", "wasted_qty": 8}],
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            with self.assertRaises(frappe.ValidationError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=3,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )

    def test_branch_mismatch_fails_closed(self):
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=auth_doc):
            with self.assertRaises(frappe.ValidationError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch B",
                    company="Company A",
                )

    def test_company_scope_ambiguity_fails_closed(self):
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=auth_doc), patch(
            f"{MODULE}.frappe.db.get_value", return_value="Other Company"
        ):
            with self.assertRaises(frappe.ValidationError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )

    def test_unauthorized_actor_rejected_role_check(self):
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock User"]):
            with self.assertRaises(frappe.PermissionError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )

    def test_unauthorized_actor_rejected_has_permission_false(self):
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=False
        ):
            with self.assertRaises(frappe.PermissionError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )

    def test_capture_rejects_unauthorized_issue_authorization_status(self):
        auth_doc = _auth_doc(status="Rejected")
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=auth_doc):
            with self.assertRaises(frappe.ValidationError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )


class TestApproveWastage(FrappeTestCase):
    def setUp(self):
        # capture_wastage() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def _draft_doc(self, **values):
        doc = frappe._dict(
            {
                "name": "W-1",
                "issue_authorization": "AUTH-1",
                "plan": "PLAN-1",
                "branch": "Branch A",
                "company": "Company A",
                "department": "DEPT-1",
                "component_item": "COMP-1",
                "status": "Draft",
                "wasted_qty": 3,
                "audit_log": None,
            }
        )
        doc.update(values)
        doc.save = MagicMock()
        return doc

    def test_draft_wastage_does_not_count_until_approved(self):
        # held_quantity only sums status="Authorized" wastage rows; a Draft
        # row (status != Authorized) must not appear in what get_all returns
        # for that filter, so it never reduces held qty / entitlement.
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.get_all", return_value=[]) as mocked_get_all, patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            result = held_quantity(auth_doc)
        self.assertEqual(result, 10)
        called_filters = mocked_get_all.call_args.kwargs.get("filters") or mocked_get_all.call_args[0][1]
        self.assertEqual(called_filters.get("status"), "Authorized")

    def test_approval_requires_correct_permission(self):
        draft = self._draft_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]):
            with self.assertRaises(frappe.PermissionError):
                approve_wastage("W-1", actor="line-cook@example.com")

    def test_approval_succeeds_with_authorized_role_and_flips_status(self):
        draft = self._draft_doc()
        auth_doc = _auth_doc()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Issue Wastage":
                return draft
            if args and args[0] == "URY Issue Authorization":
                return auth_doc
            raise AssertionError("unexpected get_doc call")

        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            result = approve_wastage("W-1", actor="stock-mgr@example.com")

        self.assertEqual(result.status, "Authorized")
        self.assertEqual(result.valuation_amount, 0)
        result.save.assert_called_once()

    def test_reject_wastage_leaves_status_rejected(self):
        draft = self._draft_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=draft):
            result = reject_wastage("W-1", actor="stock-mgr@example.com")

        self.assertEqual(result.status, "Rejected")


class TestValuationHook(FrappeTestCase):
    def setUp(self):
        # capture_wastage() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_valuation_hook_computes_qty_times_rate(self):
        doc = frappe._dict({"wasted_qty": 4, "valuation_rate": None})
        amount = compute_wastage_valuation(doc, valuation_rate=2.5)
        self.assertEqual(amount, 10.0)
        self.assertEqual(doc.valuation_rate, 2.5)
        self.assertEqual(doc.valuation_amount, 10.0)
        self.assertEqual(doc.valuation_is_estimated, 1)

    def test_valuation_hook_uses_rate_already_on_doc_when_not_passed(self):
        doc = frappe._dict({"wasted_qty": 2, "valuation_rate": 5})
        amount = compute_wastage_valuation(doc)
        self.assertEqual(amount, 10)


class TestListWastage(FrappeTestCase):
    def setUp(self):
        # capture_wastage() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_list_scoped_by_branch_succeeds(self):
        rows = [
            {
                "name": "W-1",
                "component_item": "COMP-1",
                "wasted_qty": 3,
                "status": "Authorized",
                "department": "DEPT-1",
                "branch": "Branch A",
                "company": "Company A",
                "valuation_rate": 2.5,
                "valuation_amount": 7.5,
            }
        ]
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ) as mocked_get_all:
            result = list_wastage(branch="Branch A")

        self.assertEqual(result, rows)
        called_filters = mocked_get_all.call_args.kwargs.get("filters")
        self.assertEqual(called_filters, {"branch": "Branch A"})

    def test_list_fails_closed_when_branch_missing(self):
        with self.assertRaises(frappe.ValidationError):
            list_wastage(branch=None)

    def test_list_narrowed_by_department_and_date_filters(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ) as mocked_get_all:
            list_wastage(
                branch="Branch A",
                department="DEPT-1",
                from_date="2026-01-01",
                to_date="2026-01-31",
            )

        called_filters = mocked_get_all.call_args.kwargs.get("filters")
        self.assertEqual(called_filters.get("department"), "DEPT-1")
        self.assertEqual(
            called_filters.get("creation"), ["between", ["2026-01-01", "2026-01-31"]]
        )

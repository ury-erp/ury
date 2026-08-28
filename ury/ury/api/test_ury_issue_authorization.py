import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_issue_authorization import (
    create_issue_authorization,
    list_issue_authorizations,
    remaining_entitlement,
)


MODULE = "ury.ury.api.ury_issue_authorization"


def _demand_row(**values):
    row = {
        "component_item": "COMP-1",
        "department": "DEPT-1",
        "production_unit": None,
        "required_qty": 10,
        "stock_uom": "Nos",
        "control_mode": "HARD",
    }
    row.update(values)
    return row


def _plan_doc(**values):
    snapshot = {"demand_vector": [_demand_row()]}
    doc = frappe._dict(
        {
            "name": "PLAN-1",
            "status": "Approved",
            "branch": "Branch A",
            "company": "Company A",
            "approval_snapshot": json.dumps(snapshot),
            "approval_snapshot_hash": "hash123",
        }
    )
    doc.update(values)
    return doc


class TestURYIssueAuthorization(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def _new_doc_recorder(self):
        """Return a frappe.get_doc side_effect that records the constructed record."""
        created = {}

        def _get_doc(*args, **kwargs):
            arg = args[0] if args else kwargs.get("arg1")
            if isinstance(arg, dict):
                doc = frappe._dict(arg)
                doc.insert = MagicMock()
                created["doc"] = doc
                return doc
            # second call pattern: frappe.get_doc("URY Sales Plan", plan)
            raise AssertionError("plan lookup should be mocked separately")

        return _get_doc, created

    def test_authorizes_within_entitlement(self):
        plan_doc = _plan_doc()
        new_doc_side_effect, created = self._new_doc_recorder()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Sales Plan":
                return plan_doc
            return new_doc_side_effect(*args, **kwargs)

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            result = create_issue_authorization(
                plan="PLAN-1",
                department="DEPT-1",
                component_item="COMP-1",
                requested_qty=4,
                branch="Branch A",
                company="Company A",
            )

        self.assertEqual(result.authorized_qty, 4)
        self.assertEqual(result.remaining_before_qty, 10)
        self.assertEqual(result.remaining_after_qty, 6)
        self.assertEqual(result.status, "Authorized")
        audit = json.loads(result.audit_log)
        self.assertEqual(audit[0]["authorized_qty"], 4)
        result.insert.assert_called_once()

    def test_rejects_when_exceeding_remaining_entitlement(self):
        plan_doc = _plan_doc()
        # Prior authorizations already consumed 8 of the 10 required units.
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[8]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=5,
                    branch="Branch A",
                    company="Company A",
                )

    def test_exact_demand_never_exceeds_required_qty_across_authorizations(self):
        # Two sequential authorizations must never let authorized total exceed
        # required_qty=10: first takes 6, second attempts 5 (would total 11).
        plan_doc = _plan_doc()
        new_doc_side_effect, created = self._new_doc_recorder()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Sales Plan":
                return plan_doc
            return new_doc_side_effect(*args, **kwargs)

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            first = create_issue_authorization(
                plan="PLAN-1",
                department="DEPT-1",
                component_item="COMP-1",
                requested_qty=6,
                branch="Branch A",
                company="Company A",
            )
        self.assertEqual(first.remaining_after_qty, 4)

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[6]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=5,
                    branch="Branch A",
                    company="Company A",
                )

    def test_rejects_unapproved_plan(self):
        plan_doc = _plan_doc(status="Draft")
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_rejects_plan_missing_approval_snapshot(self):
        plan_doc = _plan_doc(approval_snapshot=None, approval_snapshot_hash=None)
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_branch_mismatch_fails_closed(self):
        plan_doc = _plan_doc()
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch B",
                    company="Company A",
                )

    def test_company_scope_ambiguity_fails_closed(self):
        # Branch's own company record disagrees with the plan's company.
        plan_doc = _plan_doc()
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Other Company"):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_permission_check_blocks_unauthorized_actor(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=False):
            with self.assertRaises(frappe.PermissionError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_missing_frozen_demand_fails_closed(self):
        plan_doc = _plan_doc()
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-UNKNOWN",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )


class TestListIssueAuthorizations(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_lists_records_scoped_by_branch(self):
        rows = [
            {
                "name": "IA-1",
                "plan": "PLAN-1",
                "component_item": "COMP-1",
                "department": "DEPT-1",
                "authorized_qty": 4,
                "required_qty": 10,
                "remaining_after_qty": 6,
                "status": "Authorized",
                "branch": "Branch A",
                "company": "Company A",
                "production_unit": None,
                "stock_uom": "Nos",
                "creation": "2026-08-28 00:00:00",
            }
        ]
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ) as get_all:
            result = list_issue_authorizations(branch="Branch A")

        self.assertEqual(result, rows)
        _, kwargs = get_all.call_args
        self.assertEqual(kwargs["filters"], {"branch": "Branch A"})

    def test_missing_branch_fails_closed(self):
        with self.assertRaises(frappe.ValidationError):
            list_issue_authorizations(branch=None)

    def test_optional_department_and_date_filters_narrow_results(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ) as get_all:
            list_issue_authorizations(
                branch="Branch A",
                department="DEPT-1",
                from_date="2026-08-01",
                to_date="2026-08-31",
            )

        _, kwargs = get_all.call_args
        self.assertEqual(
            kwargs["filters"],
            {
                "branch": "Branch A",
                "department": "DEPT-1",
                "creation": ["between", ["2026-08-01", "2026-08-31"]],
            },
        )


class TestRemainingEntitlementFormula(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_formula_matches_v3_30_contract(self):
        self.assertEqual(remaining_entitlement(10, 4, 1, 2), 5)

    def test_formula_floors_at_zero(self):
        self.assertEqual(remaining_entitlement(10, 12, 0, 0), 0)

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching the
# test_ury_cost_variance_attribution.py / test_ury_bom_compiler.py
# convention) -- no bench/Docker is available in this task's worktree. These
# were reviewed by hand (traced call-by-call against
# ury_department_profitability.py) rather than executed against a real
# site; see the task report for that walkthrough. Static validation
# performed: python3 -m py_compile and git diff --check.

import unittest
from unittest.mock import MagicMock, patch

import frappe

from ury.ury.api.ury_department_profitability import (
    DEPARTMENT_SCOPE_MISMATCH,
    MISSING_APPROVED_PLAN,
    MISSING_COST_ATTRIBUTION,
    UNATTRIBUTED_REVENUE,
    get_department_profitability,
    get_plan_vs_actual,
)


MOD = "ury.ury.api.ury_department_profitability"

SNAPSHOT_KITCHEN = {
    "items": [
        {"item_code": "Burger", "qty": 10, "department": "Kitchen", "production_policy": "Made to Order"}
    ]
}
SNAPSHOT_BAR = {
    "items": [
        {"item_code": "Mojito", "qty": 20, "department": "Bar", "production_policy": "Pre-Produced"}
    ]
}


def _plan(name="SP-001", company="URY Co", branch="URY Branch", snapshot=None, service_period="2026-08-28"):
    return {
        "name": name,
        "approval_snapshot": snapshot or SNAPSHOT_KITCHEN,
        "plan_date": None,
        "service_period": service_period,
    }


def _invoice_line(item_code="Burger", qty=5, net_revenue=500.0, parent="POS-INV-001"):
    return {"item_code": item_code, "qty": qty, "net_revenue": net_revenue, "parent": parent}


class _RolesPatch:
    """Context manager patching frappe.get_roles / frappe.session.user together."""

    def __init__(self, roles, user="user@ury.test"):
        self.roles = roles
        self.user = user
        self._patches = []

    def __enter__(self):
        p1 = patch(f"{MOD}.frappe.get_roles", return_value=self.roles)
        # frappe.session is None outside a real request context in this
        # bare unit-test run, so patch.object(frappe.session, "user", ...)
        # fails (can't set an attribute on None). Replace the whole
        # frappe.session attribute with a stand-in that has a .user
        # instead, matching the pattern used elsewhere in this test suite
        # family (e.g. test_ury_reservation_service.py's mock_session).
        p2 = patch(f"{MOD}.frappe.session", MagicMock(user=self.user))
        self._patches = [p1, p2]
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *exc):
        for p in self._patches:
            p.stop()


def _base_patches(plans=None, invoice_lines=None, employee=None):
    """Common set of patches shared by most tests below.

    `plans` -> frappe.get_all(SALES_PLAN...) return value.
    `invoice_lines` -> _read_pos_invoice_lines return value.
    `employee` -> frappe.db.get_value("Employee", ...) return value.
    """
    plans = plans if plans is not None else [_plan()]
    invoice_lines = invoice_lines if invoice_lines is not None else [_invoice_line()]

    def get_value_side_effect(doctype, *args, **kwargs):
        if doctype == "Branch":
            return "URY Co"
        if doctype == "Employee":
            return employee
        return None

    return [
        patch(f"{MOD}.frappe.get_all", return_value=plans),
        patch(f"{MOD}.frappe.db.get_value", side_effect=get_value_side_effect),
        patch(f"{MOD}._read_pos_invoice_lines", return_value=invoice_lines),
    ]


def _start_all(patches):
    for p in patches:
        p.start()


def _stop_all(patches):
    for p in patches:
        p.stop()


class TestPermissionTiers(unittest.TestCase):
    def setUp(self):
        # get_department_profitability()/get_plan_vs_actual() call
        # frappe.utils.now(), which otherwise chains into
        # get_system_settings() -> get_cached_doc("System Settings")
        # -- a real DB/cache path these unit tests do not stub, and
        # some tests here mock frappe.db.get_value with a blanket
        # return_value that corrupts that internal lookup. Fix the
        # clock instead of chasing every internal call site.
        now_patcher = patch(f"{MOD}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_cashier_denied_outright(self):
        patches = _base_patches()
        _start_all(patches)
        try:
            with _RolesPatch(["Cashier"]):
                with self.assertRaises(frappe.PermissionError):
                    get_department_profitability("URY Co", "URY Branch", "2026-08-28")
        finally:
            _stop_all(patches)

    def test_captain_denied_outright(self):
        patches = _base_patches()
        _start_all(patches)
        try:
            with _RolesPatch(["Captain"]):
                with self.assertRaises(frappe.PermissionError):
                    get_department_profitability("URY Co", "URY Branch", "2026-08-28")
        finally:
            _stop_all(patches)

    @patch(f"{MOD}.compute_variance")
    def test_chef_gets_quantities_only_cost_keys_absent(self, mock_variance):
        mock_variance.return_value = {
            "item_code": "Burger",
            "qty": 5,
            "company": "URY Co",
            "theoretical_cost": 100.0,
            "posted_cost": 100.0,
        }
        patches = _base_patches()
        _start_all(patches)
        try:
            with _RolesPatch(["Chef"]):
                result = get_department_profitability("URY Co", "URY Branch", "2026-08-28")
        finally:
            _stop_all(patches)

        self.assertEqual(len(result["rows"]), 1)
        row = result["rows"][0]
        for field in ("posted_cost", "theoretical_cost", "posted_gross_profit", "theoretical_gross_profit", "variance"):
            self.assertNotIn(field, row, f"{field} must be absent, not zeroed, for Chef/Production tier")
        self.assertIn("item_or_component", row)
        self.assertIn("department", row)

    @patch(f"{MOD}.compute_variance")
    def test_finance_gets_full_cost_fields(self, mock_variance):
        mock_variance.return_value = {
            "item_code": "Burger",
            "qty": 5,
            "company": "URY Co",
            "theoretical_cost": 100.0,
            "posted_cost": 100.0,
        }
        patches = _base_patches()
        _start_all(patches)
        try:
            with _RolesPatch(["Finance"]):
                result = get_department_profitability("URY Co", "URY Branch", "2026-08-28")
        finally:
            _stop_all(patches)

        row = result["rows"][0]
        self.assertEqual(row["posted_cost"], 100.0)
        self.assertEqual(row["posted_gross_profit"], 500.0 - 100.0)
        self.assertEqual(row["variance"], 0.0)


class TestBranchAndCompanyScope(unittest.TestCase):
    def setUp(self):
        # get_department_profitability()/get_plan_vs_actual() call
        # frappe.utils.now(), which otherwise chains into
        # get_system_settings() -> get_cached_doc("System Settings")
        # -- a real DB/cache path these unit tests do not stub, and
        # some tests here mock frappe.db.get_value with a blanket
        # return_value that corrupts that internal lookup. Fix the
        # clock instead of chasing every internal call site.
        now_patcher = patch(f"{MOD}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_ury_manager_own_branch_ok(self):
        patches = _base_patches(employee=None)
        # URY Manager assigned branch matches requested branch.
        def get_value_side_effect(doctype, *args, **kwargs):
            if doctype == "Branch":
                return "URY Co"
            if doctype == "Employee":
                return "URY Branch"
            return None

        with patch(f"{MOD}.frappe.get_all", return_value=[_plan()]), \
             patch(f"{MOD}.frappe.db.get_value", side_effect=get_value_side_effect), \
             patch(f"{MOD}._read_pos_invoice_lines", return_value=[]), \
             _RolesPatch(["URY Manager"]):
            result = get_department_profitability("URY Co", "URY Branch", "2026-08-28")
        self.assertEqual(result["branch"], "URY Branch")

    def test_ury_manager_other_branch_fails_closed(self):
        def get_value_side_effect(doctype, *args, **kwargs):
            if doctype == "Branch":
                return "URY Co"
            if doctype == "Employee":
                return "URY Branch"  # assigned to a DIFFERENT branch than requested
            return None

        with patch(f"{MOD}.frappe.get_all", return_value=[_plan()]), \
             patch(f"{MOD}.frappe.db.get_value", side_effect=get_value_side_effect), \
             patch(f"{MOD}._read_pos_invoice_lines", return_value=[]), \
             _RolesPatch(["URY Manager"]):
            with self.assertRaises(frappe.PermissionError) as ctx:
                get_department_profitability("URY Co", "Other Branch", "2026-08-28")
        self.assertIn(DEPARTMENT_SCOPE_MISMATCH, str(ctx.exception))

    def test_branch_not_in_company_fails_closed(self):
        """Branch exists but belongs to a different company than requested."""
        def get_value_side_effect(doctype, *args, **kwargs):
            if doctype == "Branch":
                return "Other Co"  # branch's actual company differs from requested company
            if doctype == "Employee":
                return "URY Branch"
            return None

        with patch(f"{MOD}.frappe.get_all", return_value=[_plan()]), \
             patch(f"{MOD}.frappe.db.get_value", side_effect=get_value_side_effect), \
             patch(f"{MOD}._read_pos_invoice_lines", return_value=[]), \
             _RolesPatch(["Finance"]):
            with self.assertRaises(frappe.ValidationError) as ctx:
                get_department_profitability("URY Co", "URY Branch", "2026-08-28")
        self.assertIn(DEPARTMENT_SCOPE_MISMATCH, str(ctx.exception))

    @patch(f"{MOD}.compute_variance")
    def test_same_branch_name_two_companies_does_not_aggregate(self, mock_variance):
        """Plans/invoice reads are filtered by company in the frappe.get_all
        filters dict / SQL params -- this test asserts the company filter is
        actually passed through, so a same-named branch in another company
        can never be aggregated in."""
        mock_variance.return_value = {"theoretical_cost": 10.0, "posted_cost": 10.0}
        mock_get_all = MagicMock(return_value=[_plan(company="Company A")])
        with patch(f"{MOD}.frappe.get_all", mock_get_all), \
             patch(f"{MOD}.frappe.db.get_value", return_value="Company A"), \
             patch(f"{MOD}._read_pos_invoice_lines", return_value=[_invoice_line()]) as mock_read, \
             _RolesPatch(["Finance"]):
            get_department_profitability("Company A", "Shared Branch Name", "2026-08-28")

        plan_call_filters = mock_get_all.call_args.kwargs["filters"]
        self.assertEqual(plan_call_filters["company"], "Company A")
        mock_read.assert_called_once_with("Company A", "Shared Branch Name", "2026-08-28")


class TestDepartmentManagerScope(unittest.TestCase):
    def setUp(self):
        # get_department_profitability()/get_plan_vs_actual() call
        # frappe.utils.now(), which otherwise chains into
        # get_system_settings() -> get_cached_doc("System Settings")
        # -- a real DB/cache path these unit tests do not stub, and
        # some tests here mock frappe.db.get_value with a blanket
        # return_value that corrupts that internal lookup. Fix the
        # clock instead of chasing every internal call site.
        now_patcher = patch(f"{MOD}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    @patch(f"{MOD}.compute_variance")
    def test_department_manager_sees_only_own_department(self, mock_variance):
        mock_variance.return_value = {"theoretical_cost": 10.0, "posted_cost": 10.0}

        def get_value_side_effect(doctype, *args, **kwargs):
            if doctype == "Branch":
                return "URY Co"
            if doctype == "Employee":
                return {"branch": "URY Branch", "department": "Kitchen"}
            return None

        plans = [_plan(snapshot=SNAPSHOT_KITCHEN)]
        with patch(f"{MOD}.frappe.get_all", return_value=plans), \
             patch(f"{MOD}.frappe.db.get_value", side_effect=get_value_side_effect), \
             patch(f"{MOD}._read_pos_invoice_lines", return_value=[_invoice_line(item_code="Burger")]), \
             _RolesPatch(["Department Manager"]):
            result = get_department_profitability("URY Co", "URY Branch", "2026-08-28")

        self.assertEqual(result["department"], "Kitchen")
        for row in result["rows"]:
            self.assertEqual(row["department"], "Kitchen")

    def test_department_manager_other_branch_fails_closed(self):
        def get_value_side_effect(doctype, *args, **kwargs):
            if doctype == "Branch":
                return "URY Co"
            if doctype == "Employee":
                return {"branch": "URY Branch", "department": "Kitchen"}  # assigned branch differs
            return None

        with patch(f"{MOD}.frappe.get_all", return_value=[_plan()]), \
             patch(f"{MOD}.frappe.db.get_value", side_effect=get_value_side_effect), \
             patch(f"{MOD}._read_pos_invoice_lines", return_value=[]), \
             _RolesPatch(["Department Manager"]):
            with self.assertRaises(frappe.PermissionError) as ctx:
                get_department_profitability("URY Co", "Other Branch", "2026-08-28")
        self.assertIn(DEPARTMENT_SCOPE_MISMATCH, str(ctx.exception))

    def test_department_manager_requesting_other_department_fails_closed(self):
        def get_value_side_effect(doctype, *args, **kwargs):
            if doctype == "Branch":
                return "URY Co"
            if doctype == "Employee":
                return {"branch": "URY Branch", "department": "Kitchen"}
            return None

        with patch(f"{MOD}.frappe.get_all", return_value=[_plan()]), \
             patch(f"{MOD}.frappe.db.get_value", side_effect=get_value_side_effect), \
             patch(f"{MOD}._read_pos_invoice_lines", return_value=[]), \
             _RolesPatch(["Department Manager"]):
            with self.assertRaises(frappe.ValidationError) as ctx:
                get_department_profitability("URY Co", "URY Branch", "2026-08-28", department="Bar")
        self.assertIn(DEPARTMENT_SCOPE_MISMATCH, str(ctx.exception))


class TestUnattributedAndMissingCost(unittest.TestCase):
    def setUp(self):
        # get_department_profitability()/get_plan_vs_actual() call
        # frappe.utils.now(), which otherwise chains into
        # get_system_settings() -> get_cached_doc("System Settings")
        # -- a real DB/cache path these unit tests do not stub, and
        # some tests here mock frappe.db.get_value with a blanket
        # return_value that corrupts that internal lookup. Fix the
        # clock instead of chasing every internal call site.
        now_patcher = patch(f"{MOD}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_missing_department_mapping_returns_unattributed_revenue(self):
        # Invoice line for an item that is NOT present in any approved plan's
        # frozen item mapping for this grain.
        patches = _base_patches(
            plans=[_plan(snapshot=SNAPSHOT_KITCHEN)],
            invoice_lines=[_invoice_line(item_code="Untracked Soda", net_revenue=50.0)],
        )
        _start_all(patches)
        try:
            with _RolesPatch(["Finance"]):
                result = get_department_profitability("URY Co", "URY Branch", "2026-08-28")
        finally:
            _stop_all(patches)

        self.assertEqual(result["rows"], [])
        self.assertEqual(len(result["unattributed_revenue"]), 1)
        self.assertEqual(result["unattributed_revenue"][0]["reason"], UNATTRIBUTED_REVENUE)
        self.assertEqual(result["unattributed_revenue"][0]["item_or_component"], "Untracked Soda")

    @patch(f"{MOD}.compute_variance")
    def test_missing_cost_attribution_marks_row_provisional(self, mock_variance):
        mock_variance.side_effect = frappe.ValidationError("No active BOM")
        patches = _base_patches(plans=[_plan(snapshot=SNAPSHOT_KITCHEN)], invoice_lines=[_invoice_line()])
        _start_all(patches)
        try:
            with _RolesPatch(["Finance"]):
                result = get_department_profitability("URY Co", "URY Branch", "2026-08-28")
        finally:
            _stop_all(patches)

        self.assertEqual(len(result["rows"]), 1)
        row = result["rows"][0]
        self.assertEqual(row["reason"], MISSING_COST_ATTRIBUTION)
        self.assertTrue(row["provisional"])
        # A fabricated cost number must never be present when attribution is missing.
        self.assertNotIn("posted_cost", row)
        self.assertNotIn("theoretical_cost", row)

    def test_no_approved_plan_fails_closed(self):
        patches = _base_patches(plans=[])
        _start_all(patches)
        try:
            with _RolesPatch(["Finance"]):
                result = get_department_profitability("URY Co", "URY Branch", "2026-08-28")
        finally:
            _stop_all(patches)

        self.assertEqual(result["reason"], MISSING_APPROVED_PLAN)
        self.assertTrue(result["provisional"])
        self.assertEqual(result["rows"], [])


class TestMissingScope(unittest.TestCase):
    def setUp(self):
        # get_department_profitability()/get_plan_vs_actual() call
        # frappe.utils.now(), which otherwise chains into
        # get_system_settings() -> get_cached_doc("System Settings")
        # -- a real DB/cache path these unit tests do not stub, and
        # some tests here mock frappe.db.get_value with a blanket
        # return_value that corrupts that internal lookup. Fix the
        # clock instead of chasing every internal call site.
        now_patcher = patch(f"{MOD}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_missing_company_fails_closed(self):
        with self.assertRaises(frappe.ValidationError):
            get_department_profitability(None, "URY Branch", "2026-08-28")

    def test_missing_branch_fails_closed(self):
        with self.assertRaises(frappe.ValidationError):
            get_department_profitability("URY Co", None, "2026-08-28")


class TestPlanVsActual(unittest.TestCase):
    def setUp(self):
        # get_department_profitability()/get_plan_vs_actual() call
        # frappe.utils.now(), which otherwise chains into
        # get_system_settings() -> get_cached_doc("System Settings")
        # -- a real DB/cache path these unit tests do not stub, and
        # some tests here mock frappe.db.get_value with a blanket
        # return_value that corrupts that internal lookup. Fix the
        # clock instead of chasing every internal call site.
        now_patcher = patch(f"{MOD}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_plan_vs_actual_compares_planned_and_sold_qty(self):
        plans = [_plan(snapshot=SNAPSHOT_KITCHEN)]
        invoice_lines = [_invoice_line(item_code="Burger", qty=7, net_revenue=700.0)]
        patches = _base_patches(plans=plans, invoice_lines=invoice_lines)
        _start_all(patches)
        try:
            with _RolesPatch(["Finance"]):
                result = get_plan_vs_actual("URY Co", "URY Branch", "2026-08-28")
        finally:
            _stop_all(patches)

        self.assertEqual(len(result["rows"]), 1)
        row = result["rows"][0]
        self.assertEqual(row["planned_qty"], 10)
        self.assertEqual(row["actual_qty"], 7)
        self.assertEqual(row["qty_variance"], -3)

    def test_plan_vs_actual_missing_plan_fails_closed(self):
        patches = _base_patches(plans=[])
        _start_all(patches)
        try:
            with _RolesPatch(["Finance"]):
                result = get_plan_vs_actual("URY Co", "URY Branch", "2026-08-28")
        finally:
            _stop_all(patches)

        self.assertEqual(result["reason"], MISSING_APPROVED_PLAN)


if __name__ == "__main__":
    unittest.main()

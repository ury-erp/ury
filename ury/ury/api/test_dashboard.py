import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury.api.dashboard import (
    get_dashboard_summary,
    get_recent_transactions,
    get_module_records,
)

MOD = "ury.ury.api.dashboard"


class TestGetDashboardSummaryPermissions(FrappeTestCase):
    @patch(f"{MOD}.frappe.has_permission")
    def test_denies_without_read_permission(self, mock_has_permission):
        mock_has_permission.return_value = False

        with self.assertRaises(frappe.PermissionError):
            get_dashboard_summary(branch="Branch 1")

        mock_has_permission.assert_called_once_with("POS Invoice", "read")

    @patch(f"{MOD}.frappe.db.count")
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.db.sql")
    @patch(f"{MOD}.frappe.has_permission")
    def test_zero_invoices_no_division_error(self, mock_has_permission, mock_sql, mock_exists, mock_count):
        mock_has_permission.return_value = True
        mock_exists.return_value = True
        # First call: the as_dict invoice summary row. Second call: the raw
        # (non-as_dict) active_cashiers scalar query on the branch path.
        mock_sql.side_effect = [
            [frappe._dict({"total_invoices": 0, "grand_total": None})],
            [[0]],
        ]
        mock_count.return_value = 0

        result = get_dashboard_summary(branch="Branch 1")

        self.assertEqual(result["today_sales"], 0)
        self.assertEqual(result["today_orders"], 0)
        self.assertEqual(result["avg_order_value"], 0)


class TestGetRecentTransactionsPermissions(FrappeTestCase):
    @patch(f"{MOD}.frappe.has_permission")
    def test_denies_without_read_permission(self, mock_has_permission):
        mock_has_permission.return_value = False

        with self.assertRaises(frappe.PermissionError):
            get_recent_transactions(branch="Branch 1")

    @patch(f"{MOD}.frappe.get_list")
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.has_permission")
    def test_branch_filter_is_actually_applied(self, mock_has_permission, mock_exists, mock_get_list):
        """Regression test: the original implementation had a bare `pass`
        where the branch filter should have been, so every caller silently
        saw every branch's transactions regardless of the `branch` argument."""
        mock_has_permission.return_value = True
        mock_exists.return_value = True
        mock_get_list.return_value = []

        get_recent_transactions(branch="Branch 1", limit=5)

        _, kwargs = mock_get_list.call_args
        self.assertEqual(kwargs["filters"]["branch"], "Branch 1")

    @patch(f"{MOD}.frappe.get_list")
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.has_permission")
    def test_all_branch_applies_no_branch_filter(self, mock_has_permission, mock_exists, mock_get_list):
        mock_has_permission.return_value = True
        mock_exists.return_value = True
        mock_get_list.return_value = []

        get_recent_transactions(branch="all", limit=5)

        _, kwargs = mock_get_list.call_args
        self.assertNotIn("branch", kwargs["filters"])


class TestGetModuleRecordsAccessControl(FrappeTestCase):
    def test_rejects_doctype_not_on_allow_list(self):
        """The old implementation ran `frappe.get_all(doctype, fields=["*"])`
        for *any* client-supplied doctype name with `ignore_permissions=True`
        baked into `get_all` — a full, unauthenticated-role-check table dump
        of e.g. "User" or any other doctype. This must be rejected before
        any query runs."""
        with self.assertRaises(frappe.PermissionError):
            get_module_records("Payment Entry")

    @patch(f"{MOD}.frappe.has_permission")
    def test_denies_without_read_permission_even_if_allow_listed(self, mock_has_permission):
        mock_has_permission.return_value = False

        with self.assertRaises(frappe.PermissionError):
            get_module_records("Item")

    @patch(f"{MOD}.frappe.get_list")
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.has_permission")
    def test_user_doctype_never_queried_with_wildcard_fields(
        self, mock_has_permission, mock_exists, mock_get_list
    ):
        mock_has_permission.return_value = True
        mock_exists.return_value = True
        mock_get_list.return_value = []

        get_module_records("User")

        _, kwargs = mock_get_list.call_args
        self.assertNotIn("*", kwargs["fields"])

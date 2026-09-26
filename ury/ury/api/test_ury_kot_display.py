import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock
from datetime import datetime
from ury.ury.api.ury_kot_display import (
    confirm_cancel_kot,
    serve_kot,
    _get_cancel_confirmed_original_kots,
)


class TestServeKotBlocksCancelled(FrappeTestCase):

    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.request", None)
    def test_serve_rejects_cancelled_kot(self, mock_get_doc, mock_has_permission, mock_set_value, mock_get_branch):
        mock_doc = MagicMock()
        mock_doc.type = "Cancelled"
        mock_doc.branch = "Branch A"
        mock_get_doc.return_value = mock_doc
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"

        with self.assertRaisesRegex(frappe.ValidationError, "KOT has been cancelled and cannot be served"):
            serve_kot("KOT-001")

        mock_set_value.assert_not_called()

    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.request", None)
    def test_serve_rejects_partially_cancelled_kot(self, mock_get_doc, mock_has_permission, mock_set_value, mock_get_branch):
        mock_doc = MagicMock()
        mock_doc.type = "Partially cancelled"
        mock_doc.branch = "Branch A"
        mock_get_doc.return_value = mock_doc
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"

        with self.assertRaisesRegex(frappe.ValidationError, "KOT has been cancelled and cannot be served"):
            serve_kot("KOT-001")

        mock_set_value.assert_not_called()

    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.get_datetime")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.request", None)
    def test_serve_allows_non_cancelled_kot(self, mock_get_doc, mock_has_permission, mock_set_value, mock_get_datetime, mock_get_branch):
        mock_doc = MagicMock()
        mock_doc.type = "New Order"
        mock_doc.creation = datetime(2024, 1, 1)
        mock_doc.branch = "Branch A"
        mock_get_doc.return_value = mock_doc
        mock_get_datetime.return_value = datetime(2024, 1, 1, 0, 5)
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"

        serve_kot("KOT-001")

        mock_set_value.assert_any_call("URY KOT", "KOT-001", "order_status", "Served")

    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.request", None)
    def test_serve_kot_rejects_cross_branch_kot(self, mock_get_doc, mock_has_permission, mock_set_value, mock_get_branch):
        mock_doc = MagicMock()
        mock_doc.type = "New Order"
        mock_doc.branch = "Branch B"
        mock_get_doc.return_value = mock_doc
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"  # Mismatched branch

        with self.assertRaisesRegex(frappe.PermissionError, "You do not have permission to modify KOTs from other branches"):
            serve_kot("KOT-001")

        mock_set_value.assert_not_called()

    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.get_datetime")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.request", None)
    def test_serve_kot_allows_same_branch_kot(self, mock_get_doc, mock_has_permission, mock_set_value, mock_get_datetime, mock_get_branch):
        mock_doc = MagicMock()
        mock_doc.type = "New Order"
        mock_doc.branch = "Branch A"
        mock_doc.creation = datetime(2024, 1, 1)
        mock_get_doc.return_value = mock_doc
        mock_get_datetime.return_value = datetime(2024, 1, 1, 0, 5)
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"

        serve_kot("KOT-001")

        mock_set_value.assert_any_call("URY KOT", "KOT-001", "order_status", "Served")

    @patch("ury.ury.api.ury_kot_display.frappe.get_roles")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.get_datetime")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.request", None)
    def test_serve_kot_administrator_bypasses_branch(self, mock_get_doc, mock_has_permission, mock_set_value, mock_get_datetime, mock_get_branch, mock_session, mock_get_roles):
        mock_doc = MagicMock()
        mock_doc.type = "New Order"
        mock_doc.branch = "Branch C"
        mock_doc.creation = datetime(2024, 1, 1)
        mock_get_doc.return_value = mock_doc
        mock_get_datetime.return_value = datetime(2024, 1, 1, 0, 5)
        mock_has_permission.return_value = True
        mock_get_branch.side_effect = frappe.ValidationError("No branch")
        mock_session.user = "Administrator"
        mock_get_roles.return_value = ["Administrator"]

        serve_kot("KOT-001")

        mock_set_value.assert_any_call("URY KOT", "KOT-001", "order_status", "Served")


class TestGetCancelConfirmedOriginalKots(FrappeTestCase):

    @patch("ury.ury.api.ury_kot_display.frappe.get_all")
    def test_collects_and_splits_original_kot_names(self, mock_get_all):
        mock_get_all.return_value = [
            {"original_kot": "KOT-001,KOT-002"},
            {"original_kot": "KOT-003"},
            {"original_kot": None},
        ]

        result = _get_cancel_confirmed_original_kots("Branch A")

        self.assertEqual(result, {"KOT-001", "KOT-002", "KOT-003"})
        filters = mock_get_all.call_args.kwargs["filters"]
        self.assertEqual(filters["branch"], "Branch A")
        self.assertEqual(filters["verified"], 1)
        self.assertEqual(filters["type"], ["in", ["Cancelled", "Partially cancelled"]])

    @patch("ury.ury.api.ury_kot_display.frappe.get_all")
    def test_no_cancel_confirmed_kots_returns_empty_set(self, mock_get_all):
        mock_get_all.return_value = []

        result = _get_cancel_confirmed_original_kots("Branch A")

        self.assertEqual(result, set())


class TestURYKOTDisplaySEC06(FrappeTestCase):

    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.get_roles")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_normal_user_without_manager_role(self, mock_session, mock_get_roles, mock_get_doc, mock_has_permission, mock_get_branch, mock_set_value):
        mock_session.user = "normal_user@test.com"
        mock_get_roles.return_value = ["Cashier"]
        
        with self.assertRaisesRegex(frappe.PermissionError, "Only a manager can confirm a cancelled KOT"):
            confirm_cancel_kot("KOT-001")

    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.get_roles")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_manager_success(self, mock_session, mock_get_roles, mock_get_doc, mock_has_permission, mock_get_branch, mock_set_value):
        mock_session.user = "manager@test.com"
        mock_get_roles.return_value = ["URY Manager"]
        
        mock_doc = MagicMock()
        mock_doc.branch = "Branch A"
        mock_get_doc.return_value = mock_doc
        
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"
        
        confirm_cancel_kot("KOT-001")
        
        # Verify set_value was called to set verified and verified_by
        self.assertEqual(mock_set_value.call_count, 2)
        mock_set_value.assert_any_call("URY KOT", "KOT-001", "verified", 1)
        mock_set_value.assert_any_call("URY KOT", "KOT-001", "verified_by", "manager@test.com")

    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.get_roles")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_document_permission_fails(self, mock_session, mock_get_roles, mock_get_doc, mock_has_permission, mock_get_branch, mock_set_value):
        mock_session.user = "manager@test.com"
        mock_get_roles.return_value = ["URY Manager"]
        
        mock_doc = MagicMock()
        mock_get_doc.return_value = mock_doc
        
        mock_has_permission.return_value = False # Document permission denied
        
        with self.assertRaisesRegex(frappe.PermissionError, "You do not have permission to modify this KOT"):
            confirm_cancel_kot("KOT-001")

    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.get_roles")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_branch_permission_fails(self, mock_session, mock_get_roles, mock_get_doc, mock_has_permission, mock_get_branch, mock_set_value):
        mock_session.user = "manager@test.com"
        mock_get_roles.return_value = ["URY Manager"]
        
        mock_doc = MagicMock()
        mock_doc.branch = "Branch B"
        mock_get_doc.return_value = mock_doc
        
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A" # Mismatched branch
        
        with self.assertRaisesRegex(frappe.PermissionError, "You do not have permission to modify KOTs from other branches"):
            confirm_cancel_kot("KOT-001")

    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.get_roles")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_administrator_bypasses_branch(self, mock_session, mock_get_roles, mock_get_doc, mock_has_permission, mock_get_branch, mock_set_value):
        mock_session.user = "Administrator"
        mock_get_roles.return_value = ["Administrator"]
        
        mock_doc = MagicMock()
        mock_doc.branch = "Branch C"
        mock_get_doc.return_value = mock_doc
        
        mock_has_permission.return_value = True
        mock_get_branch.side_effect = frappe.ValidationError("No branch")
        
        confirm_cancel_kot("KOT-001")
        
        # Verify set_value was called to set verified and verified_by
        self.assertEqual(mock_set_value.call_count, 2)
        mock_set_value.assert_any_call("URY KOT", "KOT-001", "verified", 1)
        mock_set_value.assert_any_call("URY KOT", "KOT-001", "verified_by", "Administrator")

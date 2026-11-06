import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock
from ury.ury.api.ury_kot_display import confirm_cancel_kot

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

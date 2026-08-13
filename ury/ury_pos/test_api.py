import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock
from ury.ury_pos.api import searchPosInvoice

class TestSearchPosInvoiceBranchScoping(FrappeTestCase):

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api._enrich_split_group_meta")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.session")
    def test_normal_user_branch_a(self, mock_session, mock_get_branch, mock_enrich, mock_get_all):
        # Normal Branch A user → sees only Branch A invoices.
        mock_session.user = "cashier@branch_a.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_all.return_value = [{"name": "INV-001"}]
        mock_enrich.side_effect = lambda x: x
        
        result = searchPosInvoice("INV", "Recently Paid")
        
        self.assertEqual(result["data"][0]["name"], "INV-001")
        
        # Verify get_all was called with "branch": "Branch A"
        called_args = mock_get_all.call_args[1]
        self.assertEqual(called_args["filters"]["branch"], "Branch A")
        self.assertEqual(called_args["filters"]["status"], "Paid")

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api._enrich_split_group_meta")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.session")
    def test_normal_user_branch_b_unbilled(self, mock_session, mock_get_branch, mock_enrich, mock_get_all):
        # Normal Branch B user → sees only Branch B invoices.
        mock_session.user = "cashier@branch_b.com"
        mock_get_branch.return_value = "Branch B"
        mock_get_all.return_value = []
        mock_enrich.side_effect = lambda x: x
        
        searchPosInvoice("CUST", "Unbilled")
        
        # Verify get_all was called with "branch": "Branch B" and unbilled statuses
        called_args = mock_get_all.call_args[1]
        self.assertEqual(called_args["filters"]["branch"], "Branch B")
        self.assertEqual(called_args["filters"]["status"], "draft")
        self.assertEqual(called_args["filters"]["invoice_printed"], 0)

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api._enrich_split_group_meta")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.session")
    def test_search_text_cannot_bypass_branch(self, mock_session, mock_get_branch, mock_enrich, mock_get_all):
        # Search text cannot bypass the branch filter.
        mock_session.user = "cashier@branch_a.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_all.return_value = []
        mock_enrich.side_effect = lambda x: x
        
        # User tries to search for a branch B invoice explicitly
        searchPosInvoice("Branch B Invoice", "Draft")
        
        # The filter must still forcefully include branch A
        called_args = mock_get_all.call_args[1]
        self.assertEqual(called_args["filters"]["branch"], "Branch A")
        
        # Ensure the query went into or_filters, not the main branch filters
        self.assertEqual(called_args["or_filters"][0][2], "%branch b invoice%")

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api._enrich_split_group_meta")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_administrator_without_branch(self, mock_session, mock_get_roles, mock_get_branch, mock_enrich, mock_get_all):
        # Administrator without branch mapping should not have branch filter
        mock_session.user = "Administrator"
        mock_get_roles.return_value = ["Administrator"]
        mock_get_branch.side_effect = frappe.ValidationError("No branch")
        mock_get_all.return_value = []
        mock_enrich.side_effect = lambda x: x
        
        searchPosInvoice("TEST", "Recently Paid")
        
        called_args = mock_get_all.call_args[1]
        # Should NOT contain branch in filters
        self.assertNotIn("branch", called_args["filters"])
# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury_pos.api import get_split_group, getPosInvoiceItems

class TestURYPosAPI(FrappeTestCase):
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.get_doc")
    def test_get_split_group_unauthorized(self, mock_get_doc, mock_has_permission, mock_getBranch):
        mock_invoice = MagicMock()
        mock_invoice.branch = "Test Branch"
        mock_get_doc.return_value = mock_invoice
        
        # Scenario 1: No read permission
        mock_has_permission.return_value = False
        with self.assertRaises(frappe.PermissionError) as context:
            get_split_group("POS-INV-001")
        self.assertIn("Not permitted to view this order", str(context.exception))
        
        # Scenario 2: Wrong branch
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Other Branch"
        with self.assertRaises(frappe.PermissionError) as context:
            get_split_group("POS-INV-001")
        self.assertIn("outside your active branch", str(context.exception))
        
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.get_doc")
    def test_getPosInvoiceItems_unauthorized(self, mock_get_doc, mock_has_permission, mock_getBranch):
        mock_invoice = MagicMock()
        mock_invoice.branch = "Test Branch"
        mock_get_doc.return_value = mock_invoice
        
        # Scenario 1: No read permission
        mock_has_permission.return_value = False
        with self.assertRaises(frappe.PermissionError) as context:
            getPosInvoiceItems("POS-INV-001")
        self.assertIn("Not permitted to view this order", str(context.exception))
        
        # Scenario 2: Wrong branch
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Other Branch"
        with self.assertRaises(frappe.PermissionError) as context:
            getPosInvoiceItems("POS-INV-001")
        self.assertIn("outside your active branch", str(context.exception))
import frappe
import unittest
from ury.ury_pos.api import create_customer

class TestUryPosApi(unittest.TestCase):
    def setUp(self):
        # Create a test user without Customer creation rights
        if not frappe.db.exists("User", "test_unauthorized_user@example.com"):
            user = frappe.get_doc({
                "doctype": "User",
                "email": "test_unauthorized_user@example.com",
                "first_name": "Test Unauthorized",
                "send_welcome_email": 0
            })
            user.insert(ignore_permissions=True)
            # Remove any roles to ensure no permissions
            user.roles = []
            user.save(ignore_permissions=True)

        # Create a test user with Customer creation rights
        if not frappe.db.exists("User", "test_authorized_user@example.com"):
            user = frappe.get_doc({
                "doctype": "User",
                "email": "test_authorized_user@example.com",
                "first_name": "Test Authorized",
                "send_welcome_email": 0
            })
            user.insert(ignore_permissions=True)
            user.add_roles("System Manager")

    def tearDown(self):
        frappe.set_user("Administrator")
        
        # Cleanup created customers
        if frappe.db.exists("Customer", "Test Auth Customer"):
            frappe.delete_doc("Customer", "Test Auth Customer", ignore_permissions=True, force=1)

    def test_unauthorized_create_customer(self):
        frappe.set_user("test_unauthorized_user@example.com")
        
        with self.assertRaises(frappe.PermissionError):
            create_customer("Test Unauth Customer", "1234567890")
            
        self.assertFalse(frappe.db.exists("Customer", "Test Unauth Customer"))

    def test_authorized_create_customer(self):
        frappe.set_user("Administrator")
        
        result = create_customer("Test Auth Customer", "+919876543210")
        
        self.assertEqual(result.get("status"), "success")
        self.assertTrue(frappe.db.exists("Customer", "Test Auth Customer"))

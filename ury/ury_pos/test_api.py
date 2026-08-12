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

# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury.doctype.ury_order.ury_order import split_bill

class TestSplitBillSEC08(FrappeTestCase):
    
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.new_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    def test_split_bill_unauthorized_user(self, mock_get_roles, mock_session, mock_new_doc, mock_get_doc, mock_has_permission, mock_getBranch):
        mock_invoice = MagicMock()
        mock_get_doc.return_value = mock_invoice
        
        # Unauthorized User
        mock_has_permission.return_value = False
        with self.assertRaises(frappe.PermissionError) as context:
            split_bill("POS-INV-001", [])
        self.assertIn("Not permitted to split this invoice", str(context.exception))
        
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    def test_split_bill_wrong_branch(self, mock_get_doc, mock_has_permission, mock_getBranch):
        mock_invoice = MagicMock()
        mock_invoice.branch = "Branch A"
        mock_get_doc.return_value = mock_invoice
        mock_has_permission.return_value = True
        
        mock_getBranch.return_value = "Branch B"
        with self.assertRaises(frappe.PermissionError) as context:
            split_bill("POS-INV-001", [])
        self.assertIn("from another branch", str(context.exception))
        
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    def test_split_bill_administrator(self, mock_get_roles, mock_session, mock_get_doc, mock_has_permission, mock_getBranch):
        mock_invoice = MagicMock()
        mock_invoice.branch = "Branch A"
        mock_invoice.docstatus = 1  # Not draft to trigger docstatus error instead of branch error
        mock_get_doc.return_value = mock_invoice
        mock_has_permission.return_value = True
        
        # Administrator branch fallback
        mock_getBranch.side_effect = frappe.ValidationError
        mock_session.user = "Administrator"
        mock_get_roles.return_value = ["Administrator"]
        
        # It should bypass the branch check and hit the docstatus check
        with self.assertRaises(frappe.exceptions.ValidationError) as context:
            split_bill("POS-INV-001", [])
        self.assertIn("Only draft invoices", str(context.exception))

class TestURYOrder(FrappeTestCase):
    pass

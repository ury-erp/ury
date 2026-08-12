# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury.doctype.ury_order.ury_order import table_transfer, captain_transfer

class TestURYOrderSEC12(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    def test_table_transfer_unauthorized_role(self, mock_get_doc, mock_get_roles, mock_has_permission):
        mock_invoice = MagicMock()
        mock_get_doc.return_value = mock_invoice
        
        # User has write permission on the invoice...
        mock_has_permission.return_value = True
        
        # ...but lacks the required roles
        mock_get_roles.return_value = ["URY Waiter", "Guest"]
        
        with self.assertRaises(frappe.PermissionError) as context:
            table_transfer("Table 1", "Table 2", "POS-INV-001")
            
        self.assertIn("Only Cashiers and Managers can perform table transfers", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    def test_table_transfer_unauthorized_invoice(self, mock_get_doc, mock_has_permission):
        mock_invoice = MagicMock()
        mock_get_doc.return_value = mock_invoice
        
        # User lacks write permission on the invoice
        mock_has_permission.return_value = False
        
        with self.assertRaises(frappe.PermissionError) as context:
            table_transfer("Table 1", "Table 2", "POS-INV-001")
            
        self.assertIn("Not permitted to modify this order", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    def test_captain_transfer_unauthorized_role(self, mock_get_doc, mock_get_roles, mock_has_permission):
        mock_invoice = MagicMock()
        mock_get_doc.return_value = mock_invoice
        
        mock_has_permission.return_value = True
        mock_get_roles.return_value = ["URY Waiter"]
        
        with self.assertRaises(frappe.PermissionError) as context:
            captain_transfer("Capt 1", "Capt 2", "POS-INV-001")
            
        self.assertIn("Only Cashiers and Managers can perform captain transfers", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    def test_captain_transfer_unauthorized_invoice(self, mock_get_doc, mock_has_permission):
        mock_invoice = MagicMock()
        mock_get_doc.return_value = mock_invoice
        
        mock_has_permission.return_value = False
        
        with self.assertRaises(frappe.PermissionError) as context:
            captain_transfer("Capt 1", "Capt 2", "POS-INV-001")
            
        self.assertIn("Not permitted to modify this order", str(context.exception))

# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


from unittest.mock import patch, MagicMock
from ury.ury.doctype.ury_order.ury_order import get_order_invoice

class TestURYOrderSEC11(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_all")
    def test_get_order_invoice_unauthorized(self, mock_get_all, mock_get_value, mock_get_doc, mock_has_permission, mock_getBranch):
        mock_invoice = MagicMock()
        mock_invoice.branch = "Test Branch"
        mock_get_doc.return_value = mock_invoice
        mock_get_value.return_value = "POS-INV-001"
        
        # When table is not passed, but invoiceNo is passed
        mock_has_permission.return_value = False
        with self.assertRaises(frappe.PermissionError) as context:
            get_order_invoice(invoiceNo="POS-INV-001")
        self.assertIn("Not permitted to view this order", str(context.exception))
        
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Other Branch"
        with self.assertRaises(frappe.PermissionError) as context:
            get_order_invoice(invoiceNo="POS-INV-001")
        self.assertIn("outside your active branch", str(context.exception))

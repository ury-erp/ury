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

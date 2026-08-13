# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury.doctype.ury_order.ury_order import sync_order

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
class TestURYOrder(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_sync_order_authorized(self, mock_session, mock_get_doc, mock_get_value, mock_has_permission, mock_get_order_invoice):
        # Setup mock invoice
        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-001"
        mock_invoice.branch = "Test Branch"
        mock_invoice.restaurant_table = "Table 1"
        mock_invoice.invoice_printed = 0
        mock_invoice.items = []
        mock_invoice.waiter = "existing_waiter"
        
        mock_get_order_invoice.return_value = mock_invoice
        
        # Setup mock pos profile
        mock_pos_profile = MagicMock()
        mock_pos_profile.custom_enable_multiple_cashier = 0
        mock_pos_profile.applicable_for_users = []
        mock_get_doc.return_value = mock_pos_profile
        
        # Setup session user
        mock_session.user = "authorized@example.com"
        
        # Setup has_permission to return True
        mock_has_permission.return_value = True

        # Call sync_order
        try:
            # We mock frappe.db.sql as well in another patch if needed
            with patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql") as mock_sql:
                # We expect this to not raise a PermissionError
                # It might raise other errors due to missing items etc, but we just want to ensure
                # it passes the permission check.
                # Actually, let's catch everything and just assert has_permission was called.
                try:
                    sync_order(
                        items="[]",
                        cashier="fake_cashier",
                        owner="fake_owner",
                        mode_of_payment="Cash",
                        customer="Test Customer",
                        no_of_pax=2,
                        last_invoice=None,
                        waiter="fake_waiter",
                        pos_profile="Test Profile"
                    )
                except Exception as e:
                    pass
                
                mock_has_permission.assert_called_once_with("POS Invoice", "write", doc=mock_invoice)
                
                # Verify fake cashier/waiter were ignored
                self.assertEqual(mock_invoice.cashier, "authorized@example.com")
                # Waiter should remain "existing_waiter" because it was an existing invoice and we don't overwrite
                self.assertEqual(mock_invoice.waiter, "existing_waiter")
        except Exception as e:
            self.fail(f"Test failed with {e}")

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    def test_sync_order_unauthorized(self, mock_has_permission, mock_get_order_invoice):
        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-001"
        mock_get_order_invoice.return_value = mock_invoice
        
        # Setup has_permission to return False
        mock_has_permission.return_value = False
        
        with self.assertRaises(frappe.PermissionError):
            sync_order(
                items="[]",
                cashier="fake_cashier",
                owner="fake_owner",
                mode_of_payment="Cash",
                customer="Test Customer",
                no_of_pax=2,
                last_invoice=None,
                waiter="fake_waiter",
                pos_profile="Test Profile"
            )

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_sync_order_fake_cashier_waiter_new_invoice(self, mock_session, mock_get_doc, mock_get_value, mock_has_permission, mock_get_order_invoice):
        # Setup new invoice
        mock_invoice = MagicMock()
        mock_invoice.name = None # New invoice
        mock_invoice.branch = "Test Branch"
        mock_invoice.restaurant_table = "Table 1"
        mock_invoice.invoice_printed = 0
        mock_invoice.items = []
        mock_invoice.waiter = None # Not set yet
        
        mock_get_order_invoice.return_value = mock_invoice
        
        mock_pos_profile = MagicMock()
        mock_pos_profile.custom_enable_multiple_cashier = 0
        mock_pos_profile.applicable_for_users = []
        mock_get_doc.return_value = mock_pos_profile
        
        mock_session.user = "newuser@example.com"
        
        with patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql") as mock_sql:
            try:
                sync_order(
                    items="[]",
                    cashier="fake_cashier",
                    owner="fake_owner",
                    mode_of_payment="Cash",
                    customer="Test Customer",
                    no_of_pax=2,
                    last_invoice=None,
                    waiter="fake_waiter",
                    pos_profile="Test Profile"
                )
            except Exception:
                pass
            
            # Waiter and cashier should be set to session user, ignoring "fake_waiter" and "fake_cashier"
            self.assertEqual(mock_invoice.cashier, "newuser@example.com")
            self.assertEqual(mock_invoice.waiter, "newuser@example.com")

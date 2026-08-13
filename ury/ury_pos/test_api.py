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

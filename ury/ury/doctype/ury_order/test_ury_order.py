# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from ury.ury_pos.api import fav_items
from ury.ury.doctype.ury_order.ury_order import customer_favourite_item

class TestURYOrder(FrappeTestCase):
    def setUp(self):
        # Create a test customer
        if not frappe.db.exists("Customer", "Test Fav Customer"):
            doc = frappe.new_doc("Customer")
            doc.customer_name = "Test Fav Customer"
            doc.customer_group = "All Customer Groups"
            doc.territory = "All Territories"
            doc.insert(ignore_permissions=True)
            
        # Create test items
        for i in [1, 2]:
            if not frappe.db.exists("Item", f"Test Fav Item {i}"):
                item = frappe.new_doc("Item")
                item.item_code = f"Test Fav Item {i}"
                item.item_group = "Products"
                item.is_stock_item = 0
                item.insert(ignore_permissions=True)
                
        # Create a test authorized user in Branch A
        if not frappe.db.exists("User", "test_auth@example.com"):
            user = frappe.new_doc("User")
            user.email = "test_auth@example.com"
            user.first_name = "Test Auth"
            user.send_welcome_email = 0
            user.insert(ignore_permissions=True)
        user = frappe.get_doc("User", "test_auth@example.com")
        for role in ["System Manager", "Sales User", "POS User", "Accounts User"]:
            try:
                if frappe.db.exists("Role", role) and role not in [r.role for r in user.roles]:
                    user.append("roles", {"role": role})
            except Exception:
                pass
        user.save(ignore_permissions=True)
            
        # Create a test user without customer read permission
        if not frappe.db.exists("User", "test_unauth@example.com"):
            user = frappe.new_doc("User")
            user.email = "test_unauth@example.com"
            user.first_name = "Test Unauth"
            user.send_welcome_email = 0
            user.insert(ignore_permissions=True)
            
        # Create Branch A and Branch B
        if not frappe.db.exists("Branch", "Test Branch A"):
            b_a = frappe.new_doc("Branch")
            b_a.branch = "Test Branch A"
            b_a.append("user", {"user": "test_auth@example.com"})
            b_a.insert(ignore_permissions=True)
            
        if not frappe.db.exists("Branch", "Test Branch B"):
            b_b = frappe.new_doc("Branch")
            b_b.branch = "Test Branch B"
            b_b.append("user", {"user": "test_unauth@example.com"})
            b_b.insert(ignore_permissions=True)
            
        # Create a POS Invoice for the customer in Branch A
        self.invoice = frappe.new_doc("POS Invoice")
        self.invoice.customer = "Test Fav Customer"
        self.invoice.is_pos = 1
        self.invoice.branch = "Test Branch A"
        self.invoice.company = frappe.defaults.get_user_default("Company") or "_Test Company"
        self.invoice.append("items", {
            "item_code": "Test Fav Item 1",
            "item_name": "Test Fav Item 1 Name",
            "qty": 5,
            "rate": 100
        })
        self.invoice.db_insert()
        for item in self.invoice.items:
            item.parent = self.invoice.name
            item.parenttype = "POS Invoice"
            item.parentfield = "items"
            item.db_insert()
            
        # Create a POS Invoice for the customer in Branch B
        self.invoice_b = frappe.new_doc("POS Invoice")
        self.invoice_b.customer = "Test Fav Customer"
        self.invoice_b.is_pos = 1
        self.invoice_b.branch = "Test Branch B"
        self.invoice_b.company = frappe.defaults.get_user_default("Company") or "_Test Company"
        self.invoice_b.append("items", {
            "item_code": "Test Fav Item 2",
            "item_name": "Test Fav Item 2 Name",
            "qty": 10,
            "rate": 100
        })
        self.invoice_b.db_insert()
        for item in self.invoice_b.items:
            item.parent = self.invoice_b.name
            item.parenttype = "POS Invoice"
            item.parentfield = "items"
            item.db_insert()

    def tearDown(self):
        frappe.set_user("Administrator")
        frappe.delete_doc("POS Invoice", self.invoice.name, force=1, ignore_missing=True)
        frappe.delete_doc("POS Invoice", self.invoice_b.name, force=1, ignore_missing=True)
        frappe.delete_doc("Customer", "Test Fav Customer", force=1, ignore_missing=True)
        frappe.delete_doc("Item", "Test Fav Item 1", force=1, ignore_missing=True)
        frappe.delete_doc("Item", "Test Fav Item 2", force=1, ignore_missing=True)
        frappe.delete_doc("User", "test_unauth@example.com", force=1, ignore_missing=True)
        frappe.delete_doc("User", "test_auth@example.com", force=1, ignore_missing=True)
        frappe.delete_doc("Branch", "Test Branch A", force=1, ignore_missing=True)
        frappe.delete_doc("Branch", "Test Branch B", force=1, ignore_missing=True)

    def test_fav_items_unauthorized(self):
        frappe.set_user("test_unauth@example.com")
        self.assertRaises(frappe.PermissionError, fav_items, "Test Fav Customer")
        self.assertRaises(frappe.PermissionError, customer_favourite_item, "Test Fav Customer")
        frappe.set_user("Administrator")
        
    def test_fav_items_authorized(self):
        frappe.set_user("Administrator")
        
        # Test fav_items (Administrator sees all branches, so both items should be here)
        favs = fav_items("Test Fav Customer")
        item1_found = any(f["item_name"] == "Test Fav Item 1 Name" and f["qty"] == 5 for f in favs)
        item2_found = any(f["item_name"] == "Test Fav Item 2 Name" and f["qty"] == 10 for f in favs)
        self.assertTrue(item1_found, "Administrator should see Branch A items")
        self.assertTrue(item2_found, "Administrator should see Branch B items")
        
        # Test customer_favourite_item
        c_favs = customer_favourite_item("Test Fav Customer")
        item1_found = any(f["item_name"] == "Test Fav Item 1 Name" and f["qty"] == 5 for f in c_favs)
        item2_found = any(f["item_name"] == "Test Fav Item 2 Name" and f["qty"] == 10 for f in c_favs)
        self.assertTrue(item1_found)
        self.assertTrue(item2_found)

    def test_fav_items_branch_isolation(self):
        # Normal authorized user assigned to Branch A
        frappe.set_user("test_auth@example.com")
        
        # Test fav_items
        favs = fav_items("Test Fav Customer")
        item1_found = any(f["qty"] == 5 for f in favs)
        item2_found = any(f["qty"] == 10 for f in favs)
        self.assertTrue(item1_found, "Branch A item should be visible")
        self.assertFalse(item2_found, "Branch B item should be hidden")
        
        # Test customer_favourite_item
        c_favs = customer_favourite_item("Test Fav Customer")
        item1_found = any(f["qty"] == 5 for f in c_favs)
        item2_found = any(f["qty"] == 10 for f in c_favs)
        self.assertTrue(item1_found, "Branch A item should be visible")
        self.assertFalse(item2_found, "Branch B item should be hidden")
        
        frappe.set_user("Administrator")

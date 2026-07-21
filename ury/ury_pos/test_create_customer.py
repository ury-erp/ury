# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury_pos.api import create_customer


class TestCreateCustomerPermissions(FrappeTestCase):
    def tearDown(self):
        frappe.set_user("Administrator")
        super().tearDown()

    def test_rejects_user_without_customer_create_permission(self):
        # Guest has no Customer create permission; the endpoint must raise
        # PermissionError before any insert is attempted.
        frappe.set_user("Guest")
        self.assertRaises(
            frappe.PermissionError,
            create_customer,
            "Test Unauthorized Customer",
            "9999999999",
        )
        self.assertFalse(
            frappe.db.exists("Customer", {"customer_name": "Test Unauthorized Customer"})
        )

    def test_authorized_user_can_create_customer(self):
        # Administrator has Customer create permission; creation succeeds and
        # the existing success response shape is preserved.
        frappe.set_user("Administrator")
        customer_name = "Test Authorized Customer"
        # Patch commit so the test transaction can still roll back cleanly.
        with patch("frappe.db.commit"):
            result = create_customer(customer_name, "9999999998")
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["message"], "Customer created successfully")
        self.assertEqual(result["customer_name"], customer_name)
        self.assertTrue(frappe.db.exists("Customer", {"customer_name": customer_name}))

import logging
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe

# ERPNext's imports initialise a PDF logger; no bench logs/site are needed here.
with patch("frappe.logger", return_value=logging.getLogger(__name__)):
    from ury.ury.doctype.ury_order import ury_order


class TestSyncOrderCustomer(unittest.TestCase):
    def setUp(self):
        self.profile = SimpleNamespace(
            customer="Walk-in Customer",
            role_allowed_for_billing=[],
            transfer_role_permissions=[],
            role_restricted_for_table_order=[],
            custom_enable_multiple_cashier=0,
            applicable_for_users=[],
        )
        self.invoice = MagicMock()
        self.invoice.name = None
        self.invoice.customer = None
        self.invoice.waiter = None
        self.invoice.invoice_printed = 0
        self.invoice.restaurant_table = None
        self.invoice.order_type = "Take Away"
        self.invoice.invoice_created = 1
        self.invoice.items = []
        self.invoice.branch = "Salama"
        self.invoice.selling_price_list = "Standard Selling"
        self.invoice.custom_merged_tables = ""

        self.frappe = MagicMock()
        self.frappe.PermissionError = frappe.PermissionError
        self.frappe.get_roles.return_value = ["URY Captain"]
        self.frappe.session.user = "waiter@example.com"
        self.frappe.get_doc.side_effect = self.get_doc
        self.frappe.throw.side_effect = self.throw
        self.customer_lookups = []

        for target, replacement in (
            ("frappe", self.frappe),
            ("_", lambda message: message),
            ("get_order_invoice", MagicMock(return_value=self.invoice)),
            ("price_items_for_invoice", MagicMock(return_value=[])),
            ("kot_execute", MagicMock()),
        ):
            patcher = patch.object(ury_order, target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)

    def get_doc(self, doctype, name):
        if doctype == "POS Profile":
            self.assertEqual(name, "Salama POS")
            return self.profile
        self.assertEqual(doctype, "Customer")
        self.customer_lookups.append(name)
        return SimpleNamespace(mobile_number="")

    @staticmethod
    def throw(message, exception=frappe.ValidationError):
        raise exception(message)

    def send(self, customer, **kwargs):
        return ury_order.sync_order(
            items="[]",
            cashier="ignored@example.com",
            owner="ignored@example.com",
            mode_of_payment="Cash",
            customer=customer,
            no_of_pax=2,
            last_invoice=kwargs.pop("last_invoice", None),
            waiter="ignored@example.com",
            pos_profile="Salama POS",
            **kwargs,
        )

    def send_existing(self, customer):
        self.invoice.name = "POS-INV-001"
        self.invoice.waiter = self.frappe.session.user
        self.invoice.modified = "2026-10-01 08:00:00"
        try:
            return self.send(
                customer,
                last_invoice=self.invoice.name,
                last_modified_time=self.invoice.modified,
            )
        except frappe.ValidationError as error:
            self.fail(f"A valid existing or default customer must allow sending: {error}")

    def test_empty_customer_uses_profile_customer(self):
        for customer in ("", None):
            with self.subTest(customer=customer):
                self.invoice.customer = None
                try:
                    self.send(customer)
                except frappe.ValidationError as error:
                    self.fail(f"A configured walk-in customer must allow sending: {error}")
                self.assertEqual(self.invoice.customer, "Walk-in Customer")
                self.assertEqual(self.customer_lookups[-1], "Walk-in Customer")
                self.assertEqual(self.invoice.no_of_pax, 2)
        self.assertEqual(self.invoice.save.call_count, 2)

    def test_explicit_customer_overrides_profile_customer(self):
        self.send("Named Customer")
        self.assertEqual(self.invoice.customer, "Named Customer")
        self.assertEqual(self.customer_lookups, ["Named Customer"])
        self.invoice.save.assert_called_once()

    def test_explicit_customer_overrides_existing_invoice_and_profile(self):
        self.invoice.customer = "Existing Customer"
        self.send_existing("Named Customer")
        self.assertEqual(self.invoice.customer, "Named Customer")
        self.assertEqual(self.customer_lookups, ["Named Customer"])
        self.invoice.save.assert_called_once()

    def test_empty_customer_preserves_existing_invoice_customer(self):
        self.invoice.customer = "Existing Customer"
        self.send_existing("")
        self.assertEqual(self.invoice.customer, "Existing Customer")
        self.assertEqual(self.customer_lookups, ["Existing Customer"])
        self.invoice.save.assert_called_once()

    def test_existing_customer_does_not_require_profile_default(self):
        self.invoice.customer = "Existing Customer"
        self.profile.customer = None
        self.send_existing(None)
        self.assertEqual(self.invoice.customer, "Existing Customer")
        self.assertEqual(self.customer_lookups, ["Existing Customer"])
        self.invoice.save.assert_called_once()

    def test_existing_invoice_without_customer_uses_profile_customer(self):
        self.send_existing("")
        self.assertEqual(self.invoice.customer, "Walk-in Customer")
        self.assertEqual(self.customer_lookups, ["Walk-in Customer"])
        self.invoice.save.assert_called_once()

    def test_explicit_customer_does_not_require_profile_default(self):
        self.profile.customer = None
        self.send("Named Customer")
        self.assertEqual(self.invoice.customer, "Named Customer")

    def test_missing_customer_and_default_explain_how_to_fix(self):
        self.profile.customer = None
        with self.assertRaisesRegex(
            frappe.ValidationError,
            "Select a customer or set a default customer in the POS Profile",
        ):
            self.send("")
        self.assertEqual(self.customer_lookups, [])
        self.invoice.save.assert_not_called()

    def test_profile_default_does_not_bypass_order_permission(self):
        self.invoice.name = "POS-INV-001"
        self.frappe.has_permission.return_value = False
        with self.assertRaises(frappe.PermissionError):
            self.send("")
        self.assertEqual(self.customer_lookups, [])
        self.invoice.save.assert_not_called()

    def test_profile_default_does_not_bypass_occupied_table_guard(self):
        self.invoice.name = "POS-INV-001"
        self.invoice.waiter = self.frappe.session.user
        self.assertEqual(self.send(""), {"status": "Failure"})
        self.assertEqual(self.customer_lookups, [])
        self.invoice.save.assert_not_called()

    def test_profile_default_does_not_bypass_stale_update_guard(self):
        self.invoice.name = "POS-INV-001"
        self.invoice.waiter = self.frappe.session.user
        self.frappe.db.get_value.side_effect = [0, "2026-10-01 08:10:00"]
        self.assertEqual(
            self.send(
                "",
                last_invoice="POS-INV-001",
                last_modified_time="2026-10-01 08:00:00",
            ),
            {"status": "Failure"},
        )
        self.assertEqual(self.customer_lookups, [])
        self.invoice.save.assert_not_called()

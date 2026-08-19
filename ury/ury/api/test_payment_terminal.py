# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import unittest

import frappe

from ury.ury.api.payment_terminal import (
    PaymentTerminalProvider,
    get_payment_terminal_provider,
    register_payment_terminal_provider,
)


class TestPaymentTerminalInterface(unittest.TestCase):
    def tearDown(self):
        from ury.ury.api import payment_terminal
        payment_terminal._payment_terminal_provider = payment_terminal._NoOpPaymentTerminalProvider()

    def test_default_provider_is_honest_not_silent(self):
        provider = get_payment_terminal_provider()
        with self.assertRaises(frappe.ValidationError):
            provider.start_transaction("POS-INV-100", 100, "INR")

    def test_register_rejects_non_conforming_provider(self):
        with self.assertRaises(Exception):
            register_payment_terminal_provider(object())

    def test_register_accepts_real_subclass(self):
        class FakeVendorProvider(PaymentTerminalProvider):
            def start_transaction(self, invoice_name, amount, currency):
                return {"transaction_id": "TXN-1", "status": "Pending"}

            def get_transaction_status(self, transaction_id):
                return {"status": "Approved", "reference": "REF-1"}

            def cancel_transaction(self, transaction_id):
                return {"status": "Cancelled"}

        register_payment_terminal_provider(FakeVendorProvider())
        provider = get_payment_terminal_provider()
        result = provider.start_transaction("POS-INV-100", 100, "INR")
        self.assertEqual(result["status"], "Pending")

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import unittest

import frappe

from ury.ury.api.payment_terminal import (
    PaymentTerminalProvider,
    _SimulatedPaymentTerminalProvider,
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


class TestSimulatedPaymentTerminalProvider(unittest.TestCase):
    """Covers the demo/testing stub provider -- it must behave like a real
    (if instant) terminal: start -> Approved, status reflects it, cancel
    flips it to Cancelled. It is never the default provider in production."""

    def setUp(self):
        self.terminal = frappe.get_doc(
            {
                "doctype": "URY Payment Terminal",
                "terminal_id": frappe.generate_hash(length=8),
                "provider": "Simulated",
                "status": "Idle",
            }
        ).insert(ignore_permissions=True)
        register_payment_terminal_provider(_SimulatedPaymentTerminalProvider())

    def tearDown(self):
        from ury.ury.api import payment_terminal

        payment_terminal._payment_terminal_provider = payment_terminal._NoOpPaymentTerminalProvider()
        frappe.db.delete(
            "URY Payment Terminal Transaction", {"terminal": self.terminal.name}
        )
        frappe.delete_doc(
            "URY Payment Terminal", self.terminal.name, force=1, ignore_permissions=True
        )

    def test_start_transaction_is_instantly_approved(self):
        provider = get_payment_terminal_provider()
        result = provider.start_transaction("POS-INV-SIM-1", 250, "INR")
        self.assertEqual(result["status"], "Approved")
        self.assertTrue(result["transaction_id"])

    def test_get_transaction_status_reflects_approval(self):
        provider = get_payment_terminal_provider()
        started = provider.start_transaction("POS-INV-SIM-2", 100, "INR")
        status = provider.get_transaction_status(started["transaction_id"])
        self.assertEqual(status["status"], "Approved")

    def test_cancel_transaction_marks_cancelled(self):
        provider = get_payment_terminal_provider()
        started = provider.start_transaction("POS-INV-SIM-3", 100, "INR")
        result = provider.cancel_transaction(started["transaction_id"])
        self.assertEqual(result["status"], "Cancelled")

        status = provider.get_transaction_status(started["transaction_id"])
        self.assertEqual(status["status"], "Cancelled")

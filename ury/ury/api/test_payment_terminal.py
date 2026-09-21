# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# See license.txt
"""Tests for payment_terminal.py's provider registration/switching logic
(COVERAGE_GAP_ANALYSIS.md Table 1: `register_simulated_terminal_provider`,
"HIGH -- cashier/payment reconciliation", had zero test reference; the
`ury_payment_terminal` / `ury_payment_terminal_transaction` doctypes are
also empty stubs -- Top 15 item #9).

Scope: this module is explicitly documented (see its module docstring) as
an interface-only abstraction with a no-op default provider and an opt-in
simulated provider for testing/demo. The registration/dispatch logic
(`register_payment_terminal_provider`, `register_simulated_terminal_
provider`, `get_payment_terminal_provider`) is pure Python state
management -- tested directly, no mocking needed. `_SimulatedPaymentTerminal
Provider.start_transaction()`'s real DB write (a `URY Payment Terminal
Transaction` insert) is exercised separately below with mocked `frappe.db`/
`frappe.new_doc` calls, matching this track's mock-for-read/write-adjacent-
logic convention -- a real insert would need a `URY Payment Terminal`
fixture, deferred to a follow-up IntegrationTestCase session.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import payment_terminal as pt

MODULE = "ury.ury.api.payment_terminal"


class TestProviderRegistration(FrappeTestCase):
	def tearDown(self):
		# Registration mutates module-level global state; reset it after
		# every test so this suite never leaks a provider into another test.
		pt._payment_terminal_provider = pt._NoOpPaymentTerminalProvider()

	def test_default_provider_is_noop(self):
		pt._payment_terminal_provider = pt._NoOpPaymentTerminalProvider()
		self.assertIsInstance(
			pt.get_payment_terminal_provider(), pt._NoOpPaymentTerminalProvider
		)

	def test_register_simulated_terminal_provider_switches_active_provider(self):
		pt.register_simulated_terminal_provider()
		self.assertIsInstance(
			pt.get_payment_terminal_provider(), pt._SimulatedPaymentTerminalProvider
		)

	def test_register_payment_terminal_provider_rejects_non_provider(self):
		with self.assertRaises(frappe.ValidationError):
			pt.register_payment_terminal_provider(object())

	def test_register_payment_terminal_provider_accepts_valid_subclass(self):
		class _CustomProvider(pt.PaymentTerminalProvider):
			def start_transaction(self, invoice_name, amount, currency):
				return {"transaction_id": "x", "status": "Approved"}

			def get_transaction_status(self, transaction_id):
				return {"status": "Approved"}

			def cancel_transaction(self, transaction_id):
				return {"status": "Cancelled"}

		custom = _CustomProvider()
		pt.register_payment_terminal_provider(custom)
		self.assertIs(pt.get_payment_terminal_provider(), custom)


class TestNoOpProvider(FrappeTestCase):
	def test_start_transaction_throws_honest_error(self):
		provider = pt._NoOpPaymentTerminalProvider()
		with self.assertRaises(frappe.ValidationError):
			provider.start_transaction("INV-0001", 100, "INR")

	def test_get_transaction_status_throws(self):
		provider = pt._NoOpPaymentTerminalProvider()
		with self.assertRaises(frappe.ValidationError):
			provider.get_transaction_status("txn-1")

	def test_cancel_transaction_throws(self):
		provider = pt._NoOpPaymentTerminalProvider()
		with self.assertRaises(frappe.ValidationError):
			provider.cancel_transaction("txn-1")


class TestSimulatedProviderStartTransaction(FrappeTestCase):
	def test_start_transaction_creates_approved_transaction(self):
		provider = pt._SimulatedPaymentTerminalProvider()
		mock_txn = MagicMock()
		mock_txn.transaction_id = "sim-hash-123"
		mock_txn.status = "Approved"

		with patch(f"{MODULE}.frappe.db.get_value", return_value="TERM-001"), \
			patch(f"{MODULE}.frappe.new_doc", return_value=mock_txn) as mock_new_doc, \
			patch(f"{MODULE}.frappe.generate_hash", return_value="sim-hash-123"), \
			patch(f"{MODULE}.frappe.db.set_value") as mock_set_value:
			result = provider.start_transaction("INV-0001", 250.0, "INR")

		mock_new_doc.assert_called_once_with("URY Payment Terminal Transaction")
		mock_txn.insert.assert_called_once_with(ignore_permissions=True)
		self.assertEqual(mock_txn.invoice, "INV-0001")
		self.assertEqual(mock_txn.amount, 250.0)
		self.assertEqual(mock_txn.status, "Approved")
		mock_set_value.assert_called_once()
		self.assertEqual(
			result, {"transaction_id": "sim-hash-123", "status": "Approved"}
		)

	def test_start_transaction_skips_terminal_update_when_no_terminal_found(self):
		provider = pt._SimulatedPaymentTerminalProvider()
		mock_txn = MagicMock()
		mock_txn.transaction_id = "sim-hash-456"
		mock_txn.status = "Approved"

		with patch(f"{MODULE}.frappe.db.get_value", return_value=None), \
			patch(f"{MODULE}.frappe.new_doc", return_value=mock_txn), \
			patch(f"{MODULE}.frappe.generate_hash", return_value="sim-hash-456"), \
			patch(f"{MODULE}.frappe.db.set_value") as mock_set_value:
			provider.start_transaction("INV-0002", 100.0, "INR")

		mock_set_value.assert_not_called()


class TestSimulatedProviderGetAndCancelTransaction(FrappeTestCase):
	def test_get_transaction_status_returns_status(self):
		provider = pt._SimulatedPaymentTerminalProvider()
		with patch(f"{MODULE}.frappe.db.get_value", side_effect=["TXN-0001", "Approved"]):
			result = provider.get_transaction_status("sim-hash-123")
		self.assertEqual(result, {"status": "Approved", "reference": "sim-hash-123"})

	def test_get_transaction_status_raises_for_unknown_transaction(self):
		provider = pt._SimulatedPaymentTerminalProvider()
		with patch(f"{MODULE}.frappe.db.get_value", return_value=None):
			with self.assertRaises(frappe.ValidationError):
				provider.get_transaction_status("unknown-txn")

	def test_cancel_transaction_marks_cancelled(self):
		provider = pt._SimulatedPaymentTerminalProvider()
		with patch(f"{MODULE}.frappe.db.get_value", return_value="TXN-0001"), \
			patch(f"{MODULE}.frappe.db.set_value") as mock_set_value:
			result = provider.cancel_transaction("sim-hash-123")
		mock_set_value.assert_called_once_with(
			"URY Payment Terminal Transaction", "TXN-0001", "status", "Cancelled"
		)
		self.assertEqual(result, {"status": "Cancelled"})

	def test_cancel_transaction_raises_for_unknown_transaction(self):
		provider = pt._SimulatedPaymentTerminalProvider()
		with patch(f"{MODULE}.frappe.db.get_value", return_value=None):
			with self.assertRaises(frappe.ValidationError):
				provider.cancel_transaction("unknown-txn")

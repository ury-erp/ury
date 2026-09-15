# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Doctype-level coverage for URY Payment Terminal Transaction.

Like its parent `URY Payment Terminal`, this controller
(`ury_payment_terminal_transaction.py`) is a bare `pass` -- it is a
transaction log written by `PaymentTerminalProvider` implementations in
`ury.ury.api.payment_terminal`, not a doctype with its own hook logic. Per
TRACK.md Phase 2 item 2 this was confirmed a genuine stub (not "covered
elsewhere" -- `register_simulated_terminal_provider` in
`ury/ury/api/payment_terminal.py` is itself untested, per
COVERAGE_GAP_ANALYSIS.md Table 1). This file tests the JSON-declared data
integrity the doctype actually promises: the `transaction_id` uniqueness
constraint and the `status` Select default/options -- the two things a
payment-terminal reconciliation report would silently rely on.

`terminal`/`invoice` are mandatory Link fields at the JSON level, but wiring
a real `URY Payment Terminal` + `POS Invoice` fixture pair adds cost with no
signal for what this file is actually verifying (the transaction-log
doctype's own constraints, not the terminal/invoice relationship) -- so
mandatory-field enforcement is bypassed here deliberately via
`ignore_mandatory`, consistent with the existing mock-convention tests'
"unit, not full-fixture" scope split described in TRACK.md.
"""

import frappe
from frappe.tests.utils import FrappeTestCase


class TestURYPaymentTerminalTransaction(FrappeTestCase):
	def tearDown(self):
		frappe.db.rollback()

	def _make_transaction(self, **overrides):
		fields = {"doctype": "URY Payment Terminal Transaction"}
		fields.update(overrides)
		doc = frappe.get_doc(fields)
		doc.insert(ignore_permissions=True, ignore_mandatory=True)
		return doc

	def test_create_defaults_status_to_pending(self):
		txn = self._make_transaction()
		self.assertEqual(txn.status, "Pending")

	def test_autoname_is_random_hash(self):
		txn = self._make_transaction()
		# autoname: "hash" -- not derived from any field we set.
		self.assertTrue(txn.name)
		self.assertNotEqual(txn.name, "")

	def test_transaction_id_uniqueness_enforced(self):
		self._make_transaction(transaction_id="TXN-DUP-TEST")
		with self.assertRaises(frappe.UniqueValidationError):
			self._make_transaction(transaction_id="TXN-DUP-TEST")

	def test_status_transition_to_approved_persists(self):
		txn = self._make_transaction(status="Approved", amount=100)
		txn.reload()
		self.assertEqual(txn.status, "Approved")
		self.assertEqual(txn.amount, 100)

	def test_invalid_status_option_rejected(self):
		txn = self._make_transaction()
		txn.status = "NotARealStatus"
		with self.assertRaises(frappe.ValidationError):
			txn.save()

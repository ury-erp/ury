# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Doctype-level coverage for URY Payment Terminal.

Added for TRACK.md Phase 2 item 2 (sa-comprehensive-test-strategy): this
doctype's controller has no custom hooks at all (`ury_payment_terminal.py`
is a bare `pass` -- provider-driving logic lives in
`ury.ury.api.payment_terminal`, not here), so this file intentionally tests
only what the JSON metadata (`ury_payment_terminal.json`) actually declares
as enforced: the `terminal_id` uniqueness constraint and the `provider`/
`status` Select field defaults ("Simulated"/"Idle"). Payment-terminal
reconciliation is financial-critical (COVERAGE_GAP_ANALYSIS.md Table 3), so
even in the absence of controller logic it's worth confirming the doctype's
own data-integrity guarantees hold, and that they're not silently removed by
a future JSON edit.
"""

import frappe
from frappe.tests.utils import FrappeTestCase


class TestURYPaymentTerminal(FrappeTestCase):
	def tearDown(self):
		frappe.db.rollback()

	def _make_terminal(self, **overrides):
		terminal_id = overrides.pop("terminal_id", None) or frappe.generate_hash(length=10)
		fields = {
			"doctype": "URY Payment Terminal",
			# autoname is "prompt" -- Frappe requires an explicit `name` in
			# addition to the (also required) `terminal_id` data field; they
			# happen to carry the same value by convention here.
			"name": terminal_id,
			"terminal_id": terminal_id,
		}
		fields.update(overrides)
		return frappe.get_doc(fields).insert(ignore_permissions=True)

	def test_create_with_defaults(self):
		terminal = self._make_terminal()
		self.assertEqual(terminal.provider, "Simulated")
		self.assertEqual(terminal.status, "Idle")
		self.assertIsNone(terminal.last_transaction_id)
		self.assertIsNone(terminal.last_seen)

	def test_terminal_id_is_the_document_name(self):
		# autoname is "prompt" -- the name IS terminal_id, not a generated key.
		terminal = self._make_terminal(terminal_id="TERM-UNIT-TEST-1")
		self.assertEqual(terminal.name, "TERM-UNIT-TEST-1")

	def test_terminal_id_uniqueness_enforced(self):
		self._make_terminal(terminal_id="TERM-DUP-TEST")
		with self.assertRaises(frappe.DuplicateEntryError):
			self._make_terminal(terminal_id="TERM-DUP-TEST")

	def test_non_default_provider_and_status_are_preserved(self):
		terminal = self._make_terminal(provider="PAX", status="Offline")
		terminal.reload()
		self.assertEqual(terminal.provider, "PAX")
		self.assertEqual(terminal.status, "Offline")

	def test_invalid_status_option_rejected(self):
		terminal = self._make_terminal()
		terminal.status = "NotARealStatus"
		with self.assertRaises(frappe.ValidationError):
			terminal.save()

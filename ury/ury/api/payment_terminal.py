# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Phase 7 — payment terminal integration interface.
#
# This is intentionally an interface only, not a working integration.
# Physical card-terminal integrations are vendor-specific (each provider —
# e.g. Pine Labs, Razorpay POS, PayTM terminal, Ezetap — ships its own SDK/
# protocol) and need real hardware plus vendor credentials to build and
# verify against; neither is available in this environment. Building a
# fake implementation against unverifiable assumptions would be worse than
# no implementation — it would look done without being done.
#
# What this module DOES provide: the abstraction boundary a real
# vendor adapter should implement, and the no-op default that lets the
# rest of the self-ordering payment flow (create_payment_request(),
# get_payment_status() in ury/ury/api/self_ordering.py) exist independently
# of terminal hardware. A kiosk transaction using a real terminal should
# look like:
#
#   Customer confirms order
#       -> kiosk calls create_payment_terminal_transaction(session)
#       -> registered PaymentTerminalProvider.start_transaction(...)
#       -> vendor SDK drives the physical terminal
#       -> vendor SDK confirms/declines
#       -> settlement follows the same Payment Request path
#          create_payment_request()/get_payment_status() already use
#          (see self_ordering.py's Phase 6 payment module) --
#          a terminal transaction should resolve to the SAME settlement
#          primitive as a gateway/link payment, not a separate one.
#
# A future vendor integration should call register_payment_terminal_provider()
# from its own app's hooks.py (matching the register_communication_provider()
# pattern already established in self_ordering.py) rather than editing this
# module directly.

import frappe
from frappe import _


class PaymentTerminalProvider:
	"""Abstract interface a real vendor adapter must implement. All methods
	receive customer-safe, already-authorized inputs (the caller has
	already resolved the ordering session/invoice before calling here) --
	an adapter should never need to re-derive branch/table/permission
	itself.
	"""

	def start_transaction(self, invoice_name, amount, currency):
		"""Initiate a transaction on the physical terminal for `amount`
		`currency` against `invoice_name`. Must return a dict with at
		least {"transaction_id": str, "status": str} — status one of
		"Pending", "Approved", "Declined", "Error". Implementations
		should be non-blocking where the vendor SDK allows it (poll via
		get_transaction_status rather than blocking the request thread
		for however long a customer takes to tap/swipe/insert a card).
		"""
		raise NotImplementedError

	def get_transaction_status(self, transaction_id):
		"""Return {"status": ..., "reference": ...} for a previously
		started transaction. Called by the kiosk while it waits for the
		customer to complete the physical tap/swipe/insert."""
		raise NotImplementedError

	def cancel_transaction(self, transaction_id):
		"""Best-effort cancel of a pending terminal transaction (e.g. the
		customer walked away). Implementations should treat this as
		advisory — a terminal may have already captured payment by the
		time cancellation is requested."""
		raise NotImplementedError


class _NoOpPaymentTerminalProvider(PaymentTerminalProvider):
	"""Default provider: makes the interface's existence visible in
	behavior (a clear, honest error) rather than silently pretending a
	terminal is available."""

	def start_transaction(self, invoice_name, amount, currency):
		frappe.throw(
			_("No payment terminal is configured for this kiosk. Please use a card/UPI reader at the counter, or pay via the online payment option if enabled."),
			frappe.ValidationError,
		)

	def get_transaction_status(self, transaction_id):
		frappe.throw(_("No payment terminal is configured for this kiosk."), frappe.ValidationError)

	def cancel_transaction(self, transaction_id):
		frappe.throw(_("No payment terminal is configured for this kiosk."), frappe.ValidationError)


class _SimulatedPaymentTerminalProvider(PaymentTerminalProvider):
	"""Stub provider for testing/demo purposes only. It does NOT talk to any
	physical hardware -- it simply logs a URY Payment Terminal Transaction
	and marks it "Approved" instantly, so the rest of the kiosk payment flow
	(and its tests) has something real to exercise end-to-end while no real
	vendor adapter exists. Never registered by default -- opt in explicitly
	via register_simulated_terminal_provider() for testing/demo, never for
	production use."""

	def start_transaction(self, invoice_name, amount, currency):
		terminal_name = frappe.db.get_value(
			"URY Payment Terminal", {"provider": "Simulated"}, "name"
		)

		txn = frappe.new_doc("URY Payment Terminal Transaction")
		txn.terminal = terminal_name
		txn.invoice = invoice_name
		txn.amount = amount
		txn.currency = currency
		txn.transaction_id = frappe.generate_hash(length=12)
		txn.status = "Approved"
		txn.created_at = frappe.utils.now_datetime()
		txn.insert(ignore_permissions=True)

		if terminal_name:
			frappe.db.set_value(
				"URY Payment Terminal",
				terminal_name,
				{
					"last_transaction_id": txn.transaction_id,
					"last_seen": frappe.utils.now_datetime(),
				},
			)

		return {"transaction_id": txn.transaction_id, "status": txn.status}

	def get_transaction_status(self, transaction_id):
		txn_name = frappe.db.get_value(
			"URY Payment Terminal Transaction", {"transaction_id": transaction_id}, "name"
		)
		if not txn_name:
			frappe.throw(_("No such simulated terminal transaction."), frappe.ValidationError)

		status = frappe.db.get_value("URY Payment Terminal Transaction", txn_name, "status")
		return {"status": status, "reference": transaction_id}

	def cancel_transaction(self, transaction_id):
		txn_name = frappe.db.get_value(
			"URY Payment Terminal Transaction", {"transaction_id": transaction_id}, "name"
		)
		if not txn_name:
			frappe.throw(_("No such simulated terminal transaction."), frappe.ValidationError)

		frappe.db.set_value("URY Payment Terminal Transaction", txn_name, "status", "Cancelled")
		return {"status": "Cancelled"}


_payment_terminal_provider = _NoOpPaymentTerminalProvider()


@frappe.whitelist()
def register_simulated_terminal_provider():
	"""Opt-in helper for testing/demo: installs _SimulatedPaymentTerminalProvider
	as the active provider. Never called automatically -- the default stays
	_NoOpPaymentTerminalProvider so production kiosks fail honestly until a
	real vendor adapter is registered."""
	register_payment_terminal_provider(_SimulatedPaymentTerminalProvider())


def register_payment_terminal_provider(provider):
	"""Install a real vendor adapter: an instance of a PaymentTerminalProvider
	subclass. Call this from a future installed app's hooks.py rather than
	editing this module directly — mirrors
	ury.ury.api.self_ordering.register_communication_provider()."""
	global _payment_terminal_provider
	if not isinstance(provider, PaymentTerminalProvider):
		frappe.throw(_("Payment terminal provider must implement PaymentTerminalProvider"))
	_payment_terminal_provider = provider


def get_payment_terminal_provider():
	return _payment_terminal_provider

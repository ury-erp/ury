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


_payment_terminal_provider = _NoOpPaymentTerminalProvider()


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

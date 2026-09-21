# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

GATE_FIELDS = (
	"reservation_control_enabled",
	"realtime_production_posting_enabled",
	"closing_reconciliation_enabled",
)


class URYBranchStockPolicy(Document):
	"""Per-branch, per-concern gating of the URY POS stock authority tiers.

	See ARCHITECTURE_POS_STOCK_AUTHORITY.md section 3.4. The three gates are
	strictly ordered, which collapses the eight combinations to the four that
	are real operating configurations:

	1. all off                              -> Tier 1, pure native ERPNext.
	2. reservations only                    -> oversell protection, no ledger change.
	3. + real-time production posting       -> Tier 2 operating, verification advisory.
	4. + closing reconciliation             -> Tier 2 enforcing.

	The ordering is enforced here as a hard validation error, and *again*
	(fail-closed, not raising) in `ury.ury.api.ury_stock_policy`, so a row
	that somehow reached the database in an illegal state -- a direct SQL
	write, a partially-applied patch -- still cannot make a call site observe
	an illegal combination.

	No code path in this app may set these gates. The only way a gate becomes
	true in a real deployment is a human deliberately editing this document,
	which is why `enabled_by`/`enabled_on` are stamped on the transition.
	"""

	def validate(self):
		self._validate_gate_dependencies()
		self._stamp_enabling_actor()

	def _validate_gate_dependencies(self):
		if self.realtime_production_posting_enabled and not self.reservation_control_enabled:
			frappe.throw(
				_(
					"Realtime Production Posting requires Reservation Control to be enabled "
					"for branch {0}. Production postings assume the reservations they consume "
					"are being maintained."
				).format(self.branch or ""),
				frappe.ValidationError,
			)

		if self.closing_reconciliation_enabled and not self.realtime_production_posting_enabled:
			frappe.throw(
				_(
					"Closing Reconciliation requires Realtime Production Posting to be enabled "
					"for branch {0}. There is nothing to reconcile at closing until production "
					"postings are being written."
				).format(self.branch or ""),
				frappe.ValidationError,
			)

	def _stamp_enabling_actor(self):
		"""Record who turned a gate on, and when.

		This tracks the actual enabling *event*, not merely a document save:
		the stamp is only rewritten when at least one gate goes from off to
		on relative to the value currently in the database. Saving an
		unchanged document, or turning a gate back off, leaves the previous
		stamp untouched so the audit trail of the last enablement survives.
		"""
		if not self._any_gate_newly_enabled():
			return

		self.enabled_by = frappe.session.user
		self.enabled_on = now_datetime()

	def _any_gate_newly_enabled(self):
		# `get_doc_before_save()` is None for a document that has never been
		# saved, which is exactly right: every gate on a brand-new document is
		# a transition from off to on.
		before = self.get_doc_before_save()

		for fieldname in GATE_FIELDS:
			if not bool(self.get(fieldname)):
				continue
			previous = bool(before.get(fieldname)) if before else False
			if not previous:
				return True

		return False

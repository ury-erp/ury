# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.model.document import Document

from ury.ury.api.ury_sales_plan import (
	_validate_plan_scope,
	append_audit,
	flag_stale_bom_revisions,
	freeze_approval_snapshot,
	validate_no_overlapping_plan_scope,
	validate_plan_items,
)


class URYSalesPlan(Document):
	"""Storage-only record of a governed restaurant demand plan.

	Most lifecycle helpers (legality of a transition, approval-snapshot
	freezing, audit logging) live in ury.ury.api.ury_sales_plan so they can be
	unit tested without a live site. But those guardrails must fire on
	*every* status-changing save -- including a Workflow/Desk-driven
	transition on `/app/ury-sales-plan`, which flips `status` directly via
	Frappe's Workflow engine and never calls
	`ury.ury.api.ury_sales_plan.transition_sales_plan()` at all. `validate()`
	is the one hook every save path goes through, so the guardrails are
	invoked from here.
	"""

	def validate(self):
		self._guard_amend_scope()

		prev_status = self._previous_status()

		# Surface (never block on) rows whose requirement was computed from
		# a BOM yield standard that has since changed -- but only while the
		# plan can still be freely re-evaluated. Once approval_snapshot has
		# been frozen (see freeze_approval_snapshot, invoked below on the
		# Approved transition), the plan's numbers are locked historical
		# record and must not keep shifting on every subsequent save.
		if self.get("status") in ("Draft", "Proposed", "Submitted for Approval"):
			flag_stale_bom_revisions(self)

		if prev_status and prev_status != self.status:
			_validate_plan_scope(self)
			if self.status == "Approved":
				validate_plan_items(self)
				validate_no_overlapping_plan_scope(self)
				freeze_approval_snapshot(self)
			self._record_transition(prev_status)

	# ------------------------------------------------------------------
	# Audit coverage for the save paths that never call validate()
	# ------------------------------------------------------------------
	#
	# `URY Sales Plan` is submittable, and its Workflow maps
	# Approved/Locked for Production to doc_status 1 and
	# Superseded/Cancelled to doc_status 2. Frappe routes a save by
	# comparing the STORED docstatus against the in-memory one, and only
	# a plain "save" or a "submit" (docstatus 0 -> 0 or 0 -> 1) runs
	# validate() -- an "update_after_submit" (1 -> 1) or a "cancel"
	# (1 -> 2) does NOT. So for the two workflow hops that start from an
	# already-submitted plan --
	#
	#     Approved (1)            -> Locked for Production (1)
	#     Approved / Locked (1)   -> Superseded/Cancelled (2)
	#
	# -- validate() above never fires, and append_audit would silently
	# lose those hops from the audit trail. The two hooks below are the
	# _action-specific counterparts Frappe *does* call on those paths, so
	# the audit trail stays complete regardless of which docstatus edge a
	# transition crosses.
	#
	# The scope/item validation and snapshot freeze deliberately do NOT
	# run here: freeze_approval_snapshot is only meaningful on the
	# transition into "Approved", which is always a "save"/"submit" path
	# where validate() above still runs.
	#
	# Note also that `status` (the workflow_state_field, rewritten by
	# apply_workflow on every hop) and `audit_log` (rewritten here) both
	# carry `allow_on_submit: 1` in ury_sales_plan.json -- required
	# because an "update_after_submit" save rejects any field changed
	# without that flag. The cancel path skips that check entirely, so no
	# other field needs it.

	def before_update_after_submit(self):
		self._record_transition(self._previous_status())

	def before_cancel(self):
		self._record_transition(self._previous_status())

	def _previous_status(self):
		old = self.get_doc_before_save()
		return old.status if old else None

	def _guard_amend_scope(self):
		"""Reject amending a cancelled plan into a scope another LIVE plan
		already covers.

		Frappe's native Desk Cancel+Amend affordance (always available on a
		submittable doctype, entirely independent of the Workflow's own
		declared transitions) is what let a user hit exactly this: cancel one
		plan, then amend it, producing a second document for the same
		branch/company/plan_date -- a confusing pair when the branch/date
		already had (or later gets) a fresh Draft covering the same scope.
		Reuse the same overlap check approval already relies on
		(validate_no_overlapping_plan_scope) so an amend can't silently
		resurrect a scope something else is actively covering.
		"""
		if not self.get("amended_from") or not self.get("__islocal"):
			return
		existing = frappe.db.get_value(
			"URY Sales Plan",
			{
				"branch": self.branch,
				"company": self.company,
				"plan_date": self.plan_date,
				"name": ["!=", self.amended_from],
				"docstatus": ["!=", 2],
			},
			"name",
		)
		if existing:
			frappe.throw(
				frappe._(
					"Cannot amend {0}: {1} already covers this branch, company and date -- "
					"resolve or cancel it first instead of creating a second live plan for the "
					"same scope."
				).format(self.amended_from, existing),
				frappe.ValidationError,
			)

	def _record_transition(self, prev_status):
		"""Append one audit entry if `status` actually changed.

		`cancellation_reason` is stashed onto the in-memory doc by
		`transition_sales_plan()`'s `_guard_backward_transition()` right
		before it calls `apply_workflow()`, so it survives into whichever of
		validate() / before_update_after_submit() / before_cancel() actually
		fires for this particular docstatus edge and gets folded into the
		audit_log entry here. It is also a real, persisted field (see
		ury_sales_plan.json), so the reason for the most recent Return to
		Draft/Supersede-Cancel stays directly visible on the doc, not just
		buried inside the audit_log JSON blob.
		"""
		if not prev_status or prev_status == self.status:
			return
		reason = self.get("cancellation_reason")
		append_audit(self, prev_status, self.status, frappe.session.user, reason=reason)
		# audit_log is a Long Text (JSON) field -- append_audit leaves it
		# as a Python list in memory, which must be serialized back to a
		# string before Document.save() persists it.
		if isinstance(self.audit_log, list):
			self.audit_log = json.dumps(self.audit_log)

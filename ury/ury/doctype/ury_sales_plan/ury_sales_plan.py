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
	populate_item_production_context,
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
		old = self.get_doc_before_save()
		prev_status = old.status if old else None

		# Resolve item production context (department/production_unit/
		# production_policy/bom) server-side from URY Item Production
		# Configuration before anything else touches `bom` -- in particular
		# before flag_stale_bom_revisions() below, so BOM staleness checks
		# see the freshly-populated bom rather than a stale/missing value
		# supplied by the frontend.
		populate_item_production_context(self)

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
	# comparing the STORED docstatus against the in-memory one
	# (`Document.check_docstatus_transition`, whose `to_docstatus`
	# argument is actually the *previous*, database-side value -- see
	# `check_if_latest`, which passes `previous.docstatus`):
	#
	#     db 0 -> new 0 : _action "save"                -> runs validate()
	#     db 0 -> new 1 : _action "submit"              -> runs validate()
	#     db 1 -> new 1 : _action "update_after_submit" -> NO validate()
	#     db 1 -> new 2 : _action "cancel"              -> NO validate()
	#
	# (verified empirically against this Frappe build on a scratch core
	# submittable doctype.) So for the two workflow hops that start from
	# an already-submitted plan --
	#
	#     Approved (1)            -> Locked for Production (1)
	#     Approved / Locked (1)   -> Superseded/Cancelled (2)
	#
	# -- `validate()` above never fires, and `append_audit` would silently
	# lose those hops from the audit trail. The two hooks below are the
	# `_action`-specific counterparts Frappe *does* call on those paths
	# (`run_before_save_methods`), so the audit trail stays complete.
	#
	# The scope/item validation and snapshot freeze deliberately do NOT
	# run here: `freeze_approval_snapshot` is only meaningful on the
	# transition into "Approved", which is always an `_action == "submit"`
	# (db docstatus 0 -> 1) or plain "save" path where `validate()` above
	# still runs.
	#
	# Note also that `_save` only calls `validate_update_after_submit()`
	# for `_action == "update_after_submit"`. That check rejects any field
	# changed without `allow_on_submit: 1`, which is why `status` (the
	# workflow_state_field, rewritten by `apply_workflow` on every hop)
	# and `audit_log` (rewritten here) both carry `allow_on_submit: 1` in
	# ury_sales_plan.json. The cancel path skips that check entirely, so
	# no other field needs the flag.

	def before_update_after_submit(self):
		self._record_transition(self._previous_status())

	def before_cancel(self):
		self._record_transition(self._previous_status())

	def _previous_status(self):
		old = self.get_doc_before_save()
		return old.status if old else None

	def _record_transition(self, prev_status):
		"""Append one audit entry if `status` actually changed."""
		if not prev_status or prev_status == self.status:
			return
		append_audit(self, prev_status, self.status, frappe.session.user)
		# audit_log is a Long Text (JSON) field -- append_audit leaves it
		# as a Python list in memory, which must be serialized back to a
		# string before Document.save() persists it.
		if isinstance(self.audit_log, list):
			self.audit_log = json.dumps(self.audit_log)

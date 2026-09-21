# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.model.document import Document

from ury.ury.api.ury_sales_plan import (
	BACKWARD_OR_TERMINAL_TARGETS,
	FORWARD_FROM_DRAFT,
	_guard_backward_transition,
	prune_zero_qty_rows,
	validate_items_on_active_menu,
	_validate_plan_scope,
	append_audit,
	flag_stale_bom_revisions,
	freeze_approval_snapshot,
	populate_item_production_context,
	validate_no_overlapping_plan_scope,
	validate_plan_has_demand,
	validate_plan_items,
)
from ury.ury.api.ury_sales_plan_auto_production_plan import (
	maybe_create_production_plan_on_approval,
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

		# Resolve item production context (department/production_unit/
		# production_policy/bom) server-side from URY Item Production
		# Configuration before anything else touches `bom` -- in particular
		# before flag_stale_bom_revisions() below, so BOM staleness checks
		# see the freshly-populated bom rather than a stale/missing value
		# supplied by the frontend.
		populate_item_production_context(self)
		# Drafts: warn on off-menu items (plan-ahead is legitimate). Approved
		# re-saves are deliberately NOT re-checked -- a frozen plan must not be
		# bricked by a later menu change; approval below is the hard gate.
		if self.get("status") in ("Draft", "Proposed", "Submitted for Approval"):
			validate_items_on_active_menu(self, strict=False)

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
			# An empty plan is caught on the way OUT of Draft, not at
			# approval -- see validate_plan_has_demand's docstring. Like
			# every other guardrail here this has to sit in validate()
			# rather than in transition_sales_plan(), so Desk's own
			# workflow Actions button can't walk an empty plan forward
			# behind the frontend's back.
			if prev_status == "Draft" and self.status in FORWARD_FROM_DRAFT:
				validate_plan_has_demand(self)
			if self.status == "Approved":
				prune_zero_qty_rows(self)
				validate_items_on_active_menu(self, strict=True)
				validate_plan_items(self)
				validate_no_overlapping_plan_scope(self)
				freeze_approval_snapshot(self)
				# Track-Item N7: never let a bug here block the plan's own
				# approval save -- belt and suspenders on top of the
				# module-level try/except inside the function itself.
				try:
					maybe_create_production_plan_on_approval(self)
				except Exception:
					frappe.log_error(
						title="URY Sales Plan auto Production Plan call failed",
						message=frappe.get_traceback(),
					)
			# Hook-level backstop for _guard_backward_transition(): this
			# doctype's Workflow is also reachable from Desk's own workflow
			# Actions button, which flips `status` directly and never calls
			# transition_sales_plan() (see the module docstring above). The
			# "Draft" ("Return to Draft") edge is always a docstatus 0 -> 0
			# save, so it always reaches here regardless of which UI drove
			# it -- the "Superseded/Cancelled" edge is covered separately in
			# before_cancel() below, since that one crosses a docstatus
			# boundary validate() never sees.
			if self.status == "Draft":
				_guard_backward_transition(self, self.status, self.get("cancellation_reason"))
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
		# Hook-level backstop for _guard_backward_transition() on the
		# "Superseded/Cancelled" edge -- see the comment on the "Draft" case
		# in validate() above for why this needs its own call site.
		_guard_backward_transition(self, "Superseded/Cancelled", self.get("cancellation_reason"))
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

		`cancellation_reason` is written directly to the DB row by
		`transition_sales_plan()`'s `_guard_backward_transition()` right
		before it calls `apply_workflow()` (see that function's docstring for
		why it can't just be set on the in-memory doc), so it's already
		there by the time whichever of validate() / before_update_after_submit()
		/ before_cancel() fires for this particular docstatus edge reads it
		back here.

		Only fold it into THIS transition's audit entry when the transition
		actually landing right now is itself a backward/terminal one
		(`self.status in BACKWARD_OR_TERMINAL_TARGETS`) -- and clear the
		field on every OTHER transition. Without that: (a) a reason given for
		one Return to Draft would silently get attached to every later,
		unrelated transition's audit entry too (the field never resets on
		its own), and (b) a stale reason left over from a PRIOR Return to
		Draft would satisfy _guard_backward_transition's "reason required"
		check on Desk's native Actions button -- which supplies no reason of
		its own -- letting a second reopen through with no fresh
		explanation, silently defeating the requirement for exactly the
		bypass path the hook-level guard exists to close.
		"""
		if not prev_status or prev_status == self.status:
			return
		reason = self.get("cancellation_reason") if self.status in BACKWARD_OR_TERMINAL_TARGETS else None
		append_audit(self, prev_status, self.status, frappe.session.user, reason=reason)
		if self.get("cancellation_reason"):
			self.db_set("cancellation_reason", None, update_modified=False)
		# audit_log is a Long Text (JSON) field -- append_audit leaves it
		# as a Python list in memory, which must be serialized back to a
		# string before Document.save() persists it.
		if isinstance(self.audit_log, list):
			self.audit_log = json.dumps(self.audit_log)

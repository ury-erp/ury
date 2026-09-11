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

		# Surface (never block on) rows whose requirement was computed from
		# a BOM yield standard that has since changed -- but only while the
		# plan can still be freely re-evaluated. Once approval_snapshot has
		# been frozen (see freeze_approval_snapshot, invoked below on the
		# Approved transition), the plan's numbers are locked historical
		# record and must not keep shifting on every subsequent save.
		if not self.get("approval_snapshot"):
			flag_stale_bom_revisions(self)

		if prev_status and prev_status != self.status:
			_validate_plan_scope(self)
			if self.status == "Approved":
				validate_plan_items(self)
				freeze_approval_snapshot(self)
			append_audit(self, prev_status, self.status, frappe.session.user)
			# audit_log is a Long Text (JSON) field -- append_audit leaves it
			# as a Python list in memory, which must be serialized back to a
			# string before Document.save() persists it.
			if isinstance(self.audit_log, list):
				self.audit_log = json.dumps(self.audit_log)

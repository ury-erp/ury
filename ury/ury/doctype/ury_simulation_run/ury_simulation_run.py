# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from ury.ury.simulator.guards import TERMINAL_RUN_STATUSES, assert_uat_simulator_authorized


class URYSimulationRun(Document):
	"""Header record for one UAT simulation run of a branch business day.

	Every save goes through validate(), which is where both guardrails live:
	the simulator-wide authorization check (fail closed) and the
	single-flight check that prevents two live runs over the same
	(business_date, branch) scope.
	"""

	def validate(self):
		assert_uat_simulator_authorized()
		self._validate_no_active_duplicate()

	def _validate_no_active_duplicate(self):
		existing = frappe.db.get_all(
			"URY Simulation Run",
			filters={
				"business_date": self.business_date,
				"branch": self.branch,
				"status": ["not in", list(TERMINAL_RUN_STATUSES)],
				"name": ["!=", self.name],
			},
			pluck="name",
			limit=1,
		)
		if existing:
			frappe.throw(
				frappe._(
					"An active simulation run ({0}) already exists for branch {1} on "
					"{2}. Terminal runs (Failed / Closing Failed / Completed) do not "
					"block a new run."
				).format(existing[0], self.branch, self.business_date),
				frappe.ValidationError,
			)

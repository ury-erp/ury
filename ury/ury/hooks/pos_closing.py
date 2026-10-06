import frappe
from frappe import _
from datetime import datetime

from ury.ury_pos.api import (
	_goal_submitted_since,
	_phase_dependent_rows,
	_role_rank,
)


def validate_daily_checklists(doc, method):
	"""Closing runs Order Taker -> Cashier -> Restaurant Manager, and the
	POS Closing Entry is the FINAL step -- the cashier may close only after
	all three submitted their closing checklist for this shift (each review
	created since the shift opened). Role-level: one submission per role
	suffices no matter how many users hold it. A submitted checklist may
	contain FAIL objectives -- valid response, not a blocker."""
	pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
	branch = pos_profile.branch

	# Parse start date
	start_date = doc.period_start_date
	if isinstance(start_date, str):
		try:
			start_date = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S.%f")
		except ValueError:
			start_date = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S")

	non_completed_checklists = []

	def validate_and_throw(error_messages):
		if error_messages != []:
			error_list = [_("{}".format(msg)) for msg in error_messages]
			frappe.throw(error_list, title=_("Validation Error"), as_list=True)

	for row in _phase_dependent_rows(doc.pos_profile, "Closing"):
		if _goal_submitted_since(row.quality_checklist, branch, start_date):
			doc.append(
				"quality_checklist",
				{"checklist": row.quality_checklist, "check_2": 1},
			)
		elif _role_rank(row.role) is not None:
			# Every ranked role in the closing sequence gates the closing
			# document: Order Taker AND Cashier AND Restaurant Manager.
			non_completed_checklists.append(
				_("Pending checklist: {} ").format(
					frappe.bold(row.quality_checklist)
				)
			)

	validate_and_throw(non_completed_checklists)

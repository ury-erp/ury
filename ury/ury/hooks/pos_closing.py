import frappe
from frappe import _
from datetime import datetime

from ury.ury_pos.api import (
	POS_EVENT_ROLE_RANK,
	_goal_review_passed_since,
	_phase_dependent_rows,
	_role_rank,
)


def validate_daily_checklists(doc, method):
	"""Closing runs Order Taker -> Cashier -> RM. The POS Closing Entry is
	created at the Cashier step, so every role BEFORE the cashier in the
	closing sequence -- the Order Taker -- must have a fully-Passed closing
	checklist (review created since the shift opened) before the shift can
	close. Roles after the cashier (RM) close later and do not gate this
	document."""
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
		rank = _role_rank(row.role)
		if _goal_review_passed_since(row.quality_checklist, branch, start_date):
			doc.append(
				"quality_checklist",
				{"checklist": row.quality_checklist, "check_2": 1},
			)
		elif rank is not None and rank > POS_EVENT_ROLE_RANK:
			# Only roles before the Cashier step block the closing document.
			non_completed_checklists.append(
				_("Pending checklist: {} ").format(
					frappe.bold(row.quality_checklist)
				)
			)

	validate_and_throw(non_completed_checklists)

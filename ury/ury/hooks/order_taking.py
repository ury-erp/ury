import frappe
from frappe import _

from ury.ury_pos.api import (
	_checklist_blocker,
	_goal_submitted,
	_own_position_goals,
	_phase_dependent_rows,
)


@frappe.whitelist()
def ordertaker_checklist(branch, employee):
	"""Desk URY Order gate -- mirrors the POS/serve opening sequence so the
	desk flow cannot bypass it: every role before the user's must have a
	fully-Passed opening checklist for this branch/business day, and the
	user's own goals must be Passed too. A recorded FAIL is a valid
	submission but must NOT let the order taker through."""
	open_shift = frappe.get_all(
		"POS Opening Entry",
		fields=["posting_date"],
		filters={"branch": branch, "docstatus": 1, "status": "Open"},
		limit=1,
	)
	if not open_shift:
		# POS not open: the desk form's own rules apply.
		return 0, frappe.conf.url

	user = frappe.get_doc("User", employee)
	if user.role_profile_name == "Restaurant Manager":
		return 0, frappe.conf.url

	pos_profile_name = frappe.db.get_value("POS Profile", {"branch": branch}, "name")
	if not pos_profile_name:
		return 0, frappe.conf.url

	period_date = open_shift[0].posting_date
	rows = _phase_dependent_rows(pos_profile_name, "Opening")
	user_roles = [role.role for role in user.roles]

	blocker = _checklist_blocker(rows, "Opening", branch, period_date, user_roles)
	if blocker:
		frappe.msgprint(
			title="Message",
			indicator="red",
			msg=_("{0} Opening Checklist is not completed yet.").format(
				blocker["role_label"]
			),
		)
		return 2, frappe.conf.url

	for goal in _own_position_goals(rows, user_roles):
		if not _goal_submitted(goal, branch, period_date, owner=employee):
			frappe.msgprint(
				title="Message",
				indicator="red",
				msg=_("Complete Order Taker Checklist"),
			)
			return 2, frappe.conf.url

	return 0, frappe.conf.url

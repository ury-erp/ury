import frappe

from ury.ury_pos.api import (
	POS_EVENT_ROLE_RANK,
	_goal_submitted,
	_phase_dependent_rows,
	_role_rank,
)


def update_daily_checklists(doc, event):
	"""POS Opening Entry is created at the Cashier step of the opening
	sequence (RM -> Cashier -> Order Taker): every role BEFORE the cashier --
	the Restaurant Manager -- must have SUBMITTED its opening checklist for
	this branch/business day before the shift can open. A submitted checklist
	may contain FAIL objectives -- that is a valid response, not a blocker."""
	pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
	branch = pos_profile.branch

	pending = []
	for row in _phase_dependent_rows(doc.pos_profile, "Opening"):
		rank = _role_rank(row.role)
		if rank is None or rank >= POS_EVENT_ROLE_RANK:
			continue
		if not _goal_submitted(row.quality_checklist, branch, doc.posting_date):
			pending.append(row.quality_checklist)

	if pending:
		frappe.throw(
			title="Daily Checklists not completed",
			msg=("Pending:  {0}").format(",  ".join(pending)),
		)

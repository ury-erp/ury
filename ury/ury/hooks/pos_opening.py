import frappe

from ury.ury_pos.api import (
	_goal_submitted,
	_phase_dependent_rows,
	_role_rank,
)


def update_daily_checklists(doc, event):
	"""POS opening is only ready once the FULL opening hierarchy is
	submitted for this branch/business day: Restaurant Manager, then
	Cashier, then at least one eligible Order Taker. The POS Opening Entry
	is the last step of that sequence, so every configured opening goal
	must have a submitted review -- role-level, so one Order Taker
	satisfies the Order Taker step no matter how many Order Taker users
	exist. A submitted checklist may contain FAIL objectives -- that is a
	valid response, not a blocker."""
	pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
	branch = pos_profile.branch

	pending = []
	for row in _phase_dependent_rows(doc.pos_profile, "Opening"):
		if _role_rank(row.role) is None:
			continue
		if not _goal_submitted(row.quality_checklist, branch, doc.posting_date):
			pending.append(row.quality_checklist)

	if pending:
		frappe.throw(
			title="Daily Checklists not completed",
			msg=("Pending:  {0}").format(",  ".join(pending)),
		)

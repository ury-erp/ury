import frappe

from ury.ury.doctype.alert_settings.alert_settings import get_alert_rule


def _get_current_user_branch():
	"""Resolve the current session user's branch, the same way ury_pos.api.getBranch does,
	but without throwing when the user has no branch (e.g. System Manager doing
	back-office data entry). Returns None when a branch cannot be resolved.
	"""
	user = frappe.session.user

	if user == "Administrator":
		return None

	sql_query = """
		SELECT b.branch
		FROM `tabURY User` AS a
		INNER JOIN `tabBranch` AS b ON a.parent = b.name
		WHERE a.user = %s
	"""
	branch_array = frappe.db.sql(sql_query, user, as_dict=True)
	if not branch_array:
		return None

	return branch_array[0].get("branch")


def validate(doc, method):
	"""Enforce mobile number as required for Customer, based on the branch context
	of whoever is creating/saving the record - configurable per-branch (or globally)
	via Alert Settings' "Mobile Number Required" alert rule.

	Customer is a global doctype with no branch of its own, so the requirement is
	driven by the current session user's branch rather than a field on the doc.
	If no branch can be resolved for the user, the check is skipped silently so
	that non-POS users (e.g. System Manager) are never blocked.
	"""
	branch = _get_current_user_branch()
	if not branch:
		return

	rule = get_alert_rule("Mobile Number Required", branch=branch)
	if not rule:
		return

	if not doc.mobile_number:
		frappe.throw(f"Mobile Number is required for customers created for branch {branch}.")

import frappe

from ury.ury.doctype.alert_settings.alert_settings import get_alert_rule


def _get_current_user_branches():
	"""Resolve ALL branches the current session user belongs to, the same way
	ury_pos.api.getBranch does, but without throwing when the user has no branch
	(e.g. System Manager doing back-office data entry) and without truncating to
	a single branch when the user belongs to more than one. Returns a list,
	possibly empty.
	"""
	user = frappe.session.user

	if user == "Administrator":
		return []

	sql_query = """
		SELECT b.branch
		FROM `tabURY User` AS a
		INNER JOIN `tabBranch` AS b ON a.parent = b.name
		WHERE a.user = %s
	"""
	branch_array = frappe.db.sql(sql_query, user, as_dict=True)
	if not branch_array:
		return []

	return [row.get("branch") for row in branch_array if row.get("branch")]


def validate(doc, method):
	"""Enforce mobile number as required for Customer, based on the branch context
	of whoever is creating/saving the record - configurable per-branch (or globally)
	via Alert Settings' "Mobile Number Required" alert rule.

	Customer is a global doctype with no branch of its own, so the requirement is
	driven by the current session user's branch(es) rather than a field on the doc.
	If no branch can be resolved for the user, the check is skipped silently so
	that non-POS users (e.g. System Manager) are never blocked.

	The check only applies to new customers, or to an existing customer whose
	mobile_number is actively being cleared - editing unrelated fields on an
	existing customer that already has no mobile number is never blocked.

	Bulk operations (Data Import, migrate, patches, install) are always skipped
	to avoid breaking imports/migrations mid-run.
	"""
	if (
		frappe.flags.in_import
		or frappe.flags.in_migrate
		or frappe.flags.in_patch
		or frappe.flags.in_install
	):
		return

	is_clearing_existing_number = (
		not doc.is_new()
		and doc.has_value_changed("mobile_number")
		and not doc.mobile_number
	)

	if not (doc.is_new() or is_clearing_existing_number):
		return

	if doc.mobile_number:
		return

	branches = _get_current_user_branches()
	if not branches:
		return

	triggered_branches = [
		branch for branch in branches if get_alert_rule("Mobile Number Required", branch=branch)
	]
	if not triggered_branches:
		return

	branch_label = ", ".join(triggered_branches)
	frappe.throw(
		f"Your branch ({branch_label}) requires a mobile number for new customers."
	)

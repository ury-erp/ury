import frappe
from frappe import _


def document_branches(doc):
	branches = set()
	parent_branch = doc.get("custom_ury_branch") or doc.get("branch")
	if parent_branch:
		branches.add(parent_branch)
	if doc.get("cost_center"):
		branch = frappe.db.get_value("Cost Center", doc.cost_center, "branch")
		if branch:
			branches.add(branch)
	for row in doc.get_all_children():
		branch = row.get("custom_ury_branch") or row.get("branch")
		if branch:
			branches.add(branch)
		if row.get("cost_center"):
			branch = frappe.db.get_value("Cost Center", row.cost_center, "branch")
			if branch:
				branches.add(branch)
		if row.get("warehouse") and frappe.get_meta("Warehouse").has_field("branch"):
			branch = frappe.db.get_value("Warehouse", row.warehouse, "branch")
			if branch:
				branches.add(branch)
	return sorted(branches)


def approval_branch(doc):
	branches = document_branches(doc)
	doc.flags.ury_mixed_branches = branches if len(branches) > 1 else []
	return branches[0] if len(branches) == 1 else None


def validate_mixed_branch(doc, method=None):
	branches = document_branches(doc)
	if len(branches) < 2 or not any(master_enabled(branch) for branch in branches):
		return
	frappe.throw(
		_(
			"This transaction touches more than one branch ({0}). Split it into one document per branch before submission."
		).format(", ".join(branches))
	)


def master_enabled(branch):
	return bool(branch and frappe.db.get_value("Branch", branch, "custom_ury_master_approval_control"))

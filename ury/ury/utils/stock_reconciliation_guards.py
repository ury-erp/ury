import frappe


def validate(doc, method):
	"""Prevent creating multiple Draft Stock Reconciliations for the same branch.

	A Stock Reconciliation in Draft status represents work in progress for a branch.
	Only one draft per branch is allowed at a time to prevent reconciliation conflicts.
	"""
	draft_check = frappe.db.exists(
		"Stock Reconciliation",
		{"branch": doc.branch, "docstatus": 0}
	)
	if draft_check and draft_check != doc.name:
		frappe.throw(
			f"There is already a Stock Reconciliation in Draft status for branch {doc.branch}. "
			"Please complete or discard the existing reconciliation before creating a new one."
		)

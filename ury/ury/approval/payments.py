import frappe

from ury.ury.approval.config import control_enabled
from ury.ury.approval.documents import approval_branch, validate_mixed_branch
from ury.ury.approval.service import assert_approved, invalidate_requests, request_approval


def validate(doc, method=None):
	branch = approval_branch(doc)
	doc.flags.ury_payment_approval_required = False
	if not branch or doc.flags.ury_mixed_branches or not control_enabled(branch, "payment"):
		return
	amount = doc.get("advance_amount") if doc.doctype == "Employee Advance" else doc.get("base_paid_amount")
	request_approval(doc, "payment", branch, amount=amount)
	doc.flags.ury_payment_approval_required = True


def before_submit(doc, method=None):
	validate_mixed_branch(doc)
	branch = approval_branch(doc)
	if branch and control_enabled(branch, "payment") and doc.flags.ury_payment_approval_required:
		assert_approved(doc, "payment")
	if doc.doctype == "Payment Entry":
		_validate_linked_advances(doc)


def validate_advance_payment(doc, method=None):
	branch = approval_branch(doc)
	if not branch or not control_enabled(branch, "payment"):
		return
	if doc.get("paid_amount") and not doc.flags.ury_mixed_branches:
		assert_approved(doc, "payment")


def on_cancel(doc, method=None):
	branch = approval_branch(doc)
	if branch and control_enabled(branch, "payment"):
		invalidate_requests(doc, "payment", remarks="Source document cancelled")


def _validate_linked_advances(doc):
	for reference in doc.get("references") or []:
		if reference.reference_doctype != "Employee Advance":
			continue
		advance = frappe.get_doc("Employee Advance", reference.reference_name)
		branch = approval_branch(advance)
		if not branch:
			continue
		if control_enabled(branch, "payment"):
			assert_approved(advance, "payment")
		if control_enabled(branch, "expense") and frappe.db.exists(
			"URY Approval Request",
			{"reference_doctype": advance.doctype, "reference_name": advance.name, "control_type": "expense"},
		):
			assert_approved(advance, "expense")

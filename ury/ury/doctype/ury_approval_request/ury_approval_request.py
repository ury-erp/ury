import frappe
from frappe import _
from frappe.model.document import Document


class URYApprovalRequest(Document):
	def validate_workflow(self):
		if self.flags.ury_approval_internal:
			return
		super().validate_workflow()

	def validate(self):
		if not self.flags.ury_approval_internal:
			frappe.throw(
				_("Approval requests can only be created or changed through the URY approval API"),
				frappe.PermissionError,
			)

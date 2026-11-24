import frappe
from frappe import _
from frappe.model.document import Document


class URYApprovalRequest(Document):
	def validate(self):
		before = self.get_doc_before_save()
		if before and not self.flags.ury_approval_internal:
			frappe.throw(
				_("Approval requests can only be changed through the URY approval API"),
				frappe.PermissionError,
			)

import frappe
from frappe import _
from frappe.model.document import Document


class URYApprovalLog(Document):
	def validate(self):
		if not self.is_new() or not self.flags.ury_approval_internal:
			frappe.throw(_("URY Approval Log entries are append-only"), frappe.PermissionError)

	def on_trash(self):
		frappe.throw(_("URY Approval Log entries cannot be deleted"), frappe.PermissionError)

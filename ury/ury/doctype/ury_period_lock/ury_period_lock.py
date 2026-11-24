import frappe
from frappe import _
from frappe.model.document import Document


class URYPeriodLock(Document):
	def validate(self):
		if "Finance Head" not in frappe.get_roles():
			frappe.throw(_("Only the Finance Head can finalize or reopen a period"), frappe.PermissionError)
		if not self.flags.ury_period_lock_internal:
			frappe.throw(
				_("Periods can only be finalized or reopened through the URY period API"),
				frappe.PermissionError,
			)
		if self.period_start > self.period_end:
			frappe.throw(_("Period Start cannot be after Period End"))

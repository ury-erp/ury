import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate


class URYSalesTarget(Document):
	"""Net-sales target for one branch and period (normally one calendar month).

	Read by metric SAL-021 (MTD net sales vs target) and chairman slide 2.
	"""

	def validate(self):
		if getdate(self.period_end) < getdate(self.period_start):
			frappe.throw(_("Period End cannot be before Period Start"))
		if flt(self.target_amount) <= 0:
			frappe.throw(_("Target Amount must be greater than zero"))
		if not self.company:
			self.company = frappe.db.get_value("Branch", self.branch, "company")
		clash = frappe.db.exists(
			"URY Sales Target",
			{"branch": self.branch, "period_start": self.period_start, "name": ["!=", self.name]},
		)
		if clash:
			frappe.throw(_("A sales target for {0} starting {1} already exists").format(self.branch, self.period_start))

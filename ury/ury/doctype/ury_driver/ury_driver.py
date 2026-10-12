# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class URYDriver(Document):
	def validate(self):
		if not (self.driver_name or "").strip():
			frappe.throw(_("A driver needs a name."))
		if self.user and frappe.db.exists("URY Driver", {"user": self.user, "name": ["!=", self.name]}):
			# Two driver records against one login would split that person's
			# deliveries and their cash between two rows.
			frappe.throw(_("Another driver is already linked to this user."))

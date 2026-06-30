# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class URYReportSettings(Document):
	def validate(self):
		if self.extended_hours ==1 and self.hours == 0:
			frappe.throw(msg=('Value cannot be zero for URY Report Settings: <strong>No Of Hours<strong>'), title=("Zero Value"))

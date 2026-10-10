# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt


class URYDeliveryZone(Document):
	def validate(self):
		if flt(self.delivery_fee) < 0 or flt(self.minimum_order) < 0:
			frappe.throw(_("Fees and minimums cannot be negative."))
		if not 1 <= cint(self.estimated_minutes or 0) <= 240:
			# A zone quoted at four hours is a data entry error, and it would
			# be repeated to every customer who orders from it.
			frappe.throw(_("Estimated delivery time must be between 1 and 240 minutes."))

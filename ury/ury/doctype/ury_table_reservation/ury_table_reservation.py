# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class URYTableReservation(Document):
	def validate(self):
		self.set_defaults()
		self.validate_active_reservation()
	def set_defaults(self):
		if not self.reserved_at:
			self.reserved_at = now_datetime()
		if not self.reserved_by:
			self.reserved_by = frappe.session.user
	def validate_active_reservation(self):
		if self.status != "Active":
			return

		filters = {
			"reserved_table": self.reserved_table,
			"status": "Active",
			"name": ["!=", self.name],
		}

		existing = frappe.db.exists("URY Table Reservation", filters)

		if existing:
			frappe.throw(
				f"Table {self.reserved_table} already has an active reservation."
			)
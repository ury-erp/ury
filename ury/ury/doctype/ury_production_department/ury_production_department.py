# Copyright (c) 2024, Tridz Technologies Pvt. Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class URYProductionDepartment(Document):
	def validate(self):
		self.validate_company_ownership()

	def validate_company_ownership(self):
		if self.department_warehouse:
			warehouse_company = frappe.db.get_value("Warehouse", self.department_warehouse, "company")
			if warehouse_company and warehouse_company != self.company:
				frappe.throw(_("Warehouse {0} does not belong to Company {1}").format(
					frappe.bold(self.department_warehouse), frappe.bold(self.company)
				))

		if self.cost_center:
			cost_center_company = frappe.db.get_value("Cost Center", self.cost_center, "company")
			if cost_center_company and cost_center_company != self.company:
				frappe.throw(_("Cost Center {0} does not belong to Company {1}").format(
					frappe.bold(self.cost_center), frappe.bold(self.company)
				))

		if self.branch:
			branch_company = frappe.db.get_value("Branch", self.branch, "company")
			if branch_company and branch_company != self.company:
				frappe.throw(_("Branch {0} does not belong to Company {1}").format(
					frappe.bold(self.branch), frappe.bold(self.company)
				))

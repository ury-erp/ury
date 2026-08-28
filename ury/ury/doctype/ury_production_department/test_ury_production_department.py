# Copyright (c) 2024, Tridz Technologies Pvt. Ltd and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestURYProductionDepartment(FrappeTestCase):
	def make_company(self, company_name, company_abbr):
		if not frappe.db.exists("Company", company_name):
			frappe.get_doc({
				"doctype": "Company",
				"company_name": company_name,
				"default_currency": "INR",
				"abbr": company_abbr,
			}).insert()

	def make_branch(self, branch_name, company):
		if not frappe.db.exists("Branch", branch_name):
			frappe.get_doc({
				"doctype": "Branch",
				"branch": branch_name,
				"company": company,
				"user": [{"user": "Administrator"}],
			}).insert()

	def make_warehouse(self, warehouse_name, company):
		if not frappe.db.exists("Warehouse", warehouse_name):
			frappe.get_doc({"doctype": "Warehouse", "warehouse_name": warehouse_name, "company": company}).insert()

	def make_cost_center(self, cost_center_name, company):
		if not frappe.db.exists("Cost Center", cost_center_name):
			abbr = frappe.db.get_value("Company", company, "abbr")
			# Cost Center autoname appends " - <company_abbr>" itself, so the title
			# passed in must have that suffix stripped to avoid a doubled suffix.
			title = cost_center_name.rsplit(" - ", 1)[0]
			frappe.get_doc({
				"doctype": "Cost Center",
				"cost_center_name": title,
				"company": company,
				"parent_cost_center": f"{company} - {abbr}",
			}).insert()

	def make_department(self, department_name, company, branch, warehouse, cost_center):
		dept = frappe.new_doc("URY Production Department")
		dept.department_name = department_name
		dept.company = company
		dept.branch = branch
		dept.department_warehouse = warehouse
		dept.cost_center = cost_center
		dept.issue_control_policy = "Plan Controlled"
		return dept

	def test_company_ownership_validation_warehouse_on_insert(self):
		company1 = "Test Company 1 - T"
		company2 = "Test Company 2 - T"
		self.make_company(company1, "T1")
		self.make_company(company2, "T2")
		warehouse_name = "Test Warehouse 1 - T1"
		self.make_warehouse(warehouse_name, company1)
		cost_center_name = "Test Cost Center - T2"
		self.make_cost_center(cost_center_name, company2)

		dept = self.make_department("Test Dept 1", company2, "Test Branch", warehouse_name, cost_center_name)
		self.assertRaises(frappe.ValidationError, dept.insert)

	def test_company_ownership_validation_cost_center_on_save(self):
		company1 = "Test Company 1 - T"
		company2 = "Test Company 2 - T"
		self.make_company(company1, "T1")
		self.make_company(company2, "T2")
		warehouse_name = "Test Warehouse 2 - T1"
		self.make_warehouse(warehouse_name, company1)
		cost_center_name = "Test Cost Center 2 - T2"
		self.make_cost_center(cost_center_name, company2)
		foreign_cost_center = "Test Cost Center 2B - T2"
		self.make_cost_center(foreign_cost_center, company2)

		dept = self.make_department("Test Dept 2", company1, "Test Branch", warehouse_name, cost_center_name)
		dept.insert()
		dept.cost_center = foreign_cost_center

		self.assertRaises(frappe.ValidationError, dept.save)

	def test_company_ownership_validation_branch_on_insert(self):
		company1 = "Test Company 1 - T"
		company2 = "Test Company 2 - T"
		self.make_company(company1, "T1")
		self.make_company(company2, "T2")
		branch_name = "Test Branch - T1"
		self.make_branch(branch_name, company1)
		warehouse_name = "Test Warehouse Branch - T2"
		self.make_warehouse(warehouse_name, company2)
		cost_center_name = "Test Cost Center Branch - T2"
		self.make_cost_center(cost_center_name, company2)

		dept = self.make_department("Test Dept 3", company2, branch_name, warehouse_name, cost_center_name)
		self.assertRaises(frappe.ValidationError, dept.insert)

	def test_company_ownership_validation_branch_on_save(self):
		company1 = "Test Company 1 - T"
		company2 = "Test Company 2 - T"
		self.make_company(company1, "T1")
		self.make_company(company2, "T2")
		branch_name = "Test Branch Save - T1"
		self.make_branch(branch_name, company1)
		foreign_branch = "Test Branch Save 2 - T2"
		self.make_branch(foreign_branch, company2)
		warehouse_name = "Test Warehouse Save - T1"
		self.make_warehouse(warehouse_name, company1)
		cost_center_name = "Test Cost Center Save - T1"
		self.make_cost_center(cost_center_name, company1)

		dept = self.make_department("Test Dept 4", company1, branch_name, warehouse_name, cost_center_name)
		dept.insert()
		dept.branch = foreign_branch

		self.assertRaises(frappe.ValidationError, dept.save)

	def test_happy_path_insert_and_save(self):
		company1 = "Test Company 1 - T"
		self.make_company(company1, "T1")
		branch_name = "Test Branch Happy - T1"
		self.make_branch(branch_name, company1)
		warehouse_name = "Test Warehouse Happy - T1"
		self.make_warehouse(warehouse_name, company1)

		cost_center_name = "Test Cost Center Happy - T1"
		self.make_cost_center(cost_center_name, company1)

		dept = self.make_department("Test Dept Happy", company1, branch_name, warehouse_name, cost_center_name)
		dept.insert()
		self.assertEqual(dept.branch, branch_name)
		dept.save()

		self.assertTrue(frappe.db.exists("URY Production Department", dept.name))

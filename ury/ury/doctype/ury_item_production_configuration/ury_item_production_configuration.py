# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class URYItemProductionConfiguration(Document):
    def validate(self):
        self.validate_link_ownership()

    def validate_link_ownership(self):
        branch_company = self._get_branch_company()

        if self.bom:
            bom_item, bom_company = self._get_linked_pair("BOM", self.bom, ["item", "company"])
            if not bom_item:
                frappe.throw(_("BOM {0} is required").format(self.bom))
            if bom_item != self.item:
                frappe.throw(_("BOM {0} does not belong to Item {1}").format(self.bom, self.item))
            self._validate_company_scope("BOM", self.bom, bom_company, branch_company)

        if self.direct_retail_warehouse:
            warehouse_company = self._get_warehouse_company()
            if not warehouse_company:
                frappe.throw(_("Direct Retail Warehouse {0} is required").format(self.direct_retail_warehouse))
            self._validate_company_scope("Direct Retail Warehouse", self.direct_retail_warehouse, warehouse_company, branch_company)

        if self.department:
            dept_branch, dept_company = self._get_linked_pair(
                "URY Production Department", self.department, ["branch", "company"]
            )
            if not dept_branch:
                frappe.throw(_("Department {0} is required").format(self.department))
            if dept_branch != self.branch:
                frappe.throw(_("Department {0} does not belong to Branch {1}").format(self.department, self.branch))
            self._validate_company_scope("Department", self.department, dept_company, branch_company)

        if self.production_unit:
            unit_branch, unit_company = self._get_linked_pair("URY Production Unit", self.production_unit, ["branch", "company"])
            if not unit_branch:
                frappe.throw(_("Production Unit {0} is required").format(self.production_unit))
            if unit_branch != self.branch:
                frappe.throw(_("Production Unit {0} does not belong to Branch {1}").format(self.production_unit, self.branch))
            self._validate_company_scope("Production Unit", self.production_unit, unit_company, branch_company)

    def _get_branch_company(self):
        if not self.branch:
            return None

        return frappe.db.get_value("Branch", self.branch, "company")

    def _get_warehouse_company(self):
        return frappe.db.get_value("Warehouse", self.direct_retail_warehouse, "company")

    def _get_linked_pair(self, doctype, name, fields):
        value = frappe.db.get_value(doctype, name, fields)
        if not value:
            return None, None
        if isinstance(value, dict):
            return value.get(fields[0]), value.get(fields[1])
        return value[0], value[1]

    def _validate_company_scope(self, label, link_name, linked_company, branch_company):
        if not branch_company:
            frappe.throw(_("{0} {1} cannot be used until the Branch has a Company").format(label, link_name))

        if not linked_company:
            frappe.throw(_("{0} {1} must belong to Company {2}").format(label, link_name, branch_company))

        if linked_company != branch_company:
            frappe.throw(_("{0} {1} does not belong to Company {2}").format(label, link_name, branch_company))

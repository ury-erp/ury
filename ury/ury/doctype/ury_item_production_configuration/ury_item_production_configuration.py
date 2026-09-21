# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class URYItemProductionConfiguration(Document):
    def validate(self):
        self.validate_link_ownership()
        self.validate_no_cross_department_bom_components()

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

    def validate_no_cross_department_bom_components(self):
        """Enforce that BOM components are not shared across different production departments.

        A raw material (BOM component item) must never be configured for a different
        department than the top-level item's IPC. This validation applies only to
        MADE_TO_ORDER configurations that have a department assigned.
        """
        # Only validate MADE_TO_ORDER configurations with a department
        if not self.department:
            return

        production_policy = (self.production_policy or "").upper()
        if production_policy != "MADE_TO_ORDER":
            return

        # Resolve the active BOM for this item
        bom_name = self._resolve_active_bom()
        if not bom_name:
            return

        # Explode BOM components
        components = self._explode_bom_components(bom_name)
        if not components:
            return

        # For each component, check if it has an IPC with a different department
        company = frappe.db.get_value("Branch", self.branch, "company")
        for component_item in components:
            component_ipc = frappe.db.get_value(
                "URY Item Production Configuration",
                {
                    "item": component_item,
                    "branch": self.branch,
                    "active": 1,
                },
                ["department"],
            )

            if component_ipc:
                component_department = component_ipc[0] if isinstance(component_ipc, tuple) else component_ipc
                if component_department and component_department != self.department:
                    frappe.throw(
                        _("BOM component {0} is configured for department {1}, but this item is configured for department {2}. "
                          "Raw materials cannot be shared across different production departments.").format(
                            component_item, component_department, self.department
                        ),
                        frappe.ValidationError,
                    )

    def _resolve_active_bom(self):
        """Mirror the BOM resolution logic from ury_bom_compiler._resolve_active_bom()."""
        if not self.item:
            return None

        company = frappe.db.get_value("Branch", self.branch, "company")

        filters = {"item": self.item, "is_active": 1, "docstatus": 1}
        if company:
            filters["company"] = company

        # Try to get the default BOM first
        bom_name = frappe.db.get_value(
            "BOM", {**filters, "is_default": 1}, "name", order_by="modified desc"
        )
        if not bom_name:
            # Fall back to any active BOM
            bom_name = frappe.db.get_value("BOM", filters, "name", order_by="modified desc")

        return bom_name

    def _explode_bom_components(self, bom_name):
        """Extract component item codes from a BOM.

        Returns a set of component_item codes. Handles both BOM Explosion Item
        (preferred, already flattened) and falls back to manual BOM Item recursion.
        """
        components = set()

        # Try BOM Explosion Item first (already flattened by Frappe)
        explosion_rows = frappe.get_all(
            "BOM Explosion Item",
            filters={"parent": bom_name, "parenttype": "BOM", "docstatus": ("<", 2)},
            fields=["item_code"],
        )
        if explosion_rows:
            return {row.item_code for row in explosion_rows}

        # Fall back to manual BOM Item recursion
        self._explode_bom_recursive(bom_name, components, visited=set())
        return components

    def _explode_bom_recursive(self, bom_name, components, visited):
        """Recursively explode BOM Item rows, handling sub-assemblies."""
        if bom_name in visited:
            frappe.throw(
                _("Circular BOM reference detected at {0}").format(bom_name),
                frappe.ValidationError,
            )
        visited = visited | {bom_name}

        lines = frappe.get_all(
            "BOM Item",
            filters={"parent": bom_name, "parenttype": "BOM", "docstatus": ("<", 2)},
            fields=["item_code", "is_sub_assembly_item", "bom_no"],
        )

        for line in lines:
            if line.is_sub_assembly_item:
                # Recursively explode sub-assembly
                sub_bom = line.bom_no or self._resolve_active_bom_for_item(line.item_code)
                if sub_bom:
                    self._explode_bom_recursive(sub_bom, components, visited)
            else:
                # Non-sub-assembly: add to components
                components.add(line.item_code)

    def _resolve_active_bom_for_item(self, item_code):
        """Resolve active BOM for a given item (used during recursive BOM explosion)."""
        company = frappe.db.get_value("Branch", self.branch, "company")

        filters = {"item": item_code, "is_active": 1, "docstatus": 1}
        if company:
            filters["company"] = company

        bom_name = frappe.db.get_value(
            "BOM", {**filters, "is_default": 1}, "name", order_by="modified desc"
        )
        if not bom_name:
            bom_name = frappe.db.get_value("BOM", filters, "name", order_by="modified desc")

        return bom_name

import frappe


def checklist(self, event):
    self.inspected_by = frappe.session.user

import frappe


@frappe.whitelist()
def cancel_check():
    return frappe.permissions.has_permission("POS Invoice", "cancel", raise_exception=False)

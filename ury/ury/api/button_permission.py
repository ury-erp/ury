import frappe


@frappe.whitelist()
def cancel_check():
    if frappe.permissions.has_permission(
        "POS Invoice", "cancel", raise_exception=False
    ):
        permission = True
    else:
        permission = False
    return permission

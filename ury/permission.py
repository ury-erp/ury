import frappe

def check_app_permission():
    if frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles():
        return True
    return False
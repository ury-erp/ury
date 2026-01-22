import frappe

def check_app_permission():
	if frappe.session.user == "Administrator" or frappe.session.user == "System Manager" :
		return True
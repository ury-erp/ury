import frappe


def check_app_permission():
	"""Check if user can see URY in the app screen."""
	user = frappe.session.user
	if user == "Administrator":
		return True
	if "System Manager" in frappe.get_roles(user):
		return True
	# Check if user has any URY role
	if frappe.db.exists("URY User Role", {"user": user, "enabled": 1}):
		return True
	return False

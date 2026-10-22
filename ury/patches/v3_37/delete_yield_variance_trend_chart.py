import frappe


def execute():
	# Replaced by "Under-Yield Checks per Day": the signed average hid bad days by cancelling out.
	if frappe.db.exists("Dashboard Chart", "Yield Variance Trend"):
		frappe.delete_doc("Dashboard Chart", "Yield Variance Trend", force=True, ignore_permissions=True)

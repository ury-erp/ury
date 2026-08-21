import click
import frappe

from ury.setup_customizations import before_uninstall as remove_custom_fields


def uninstall():
	try:
		print("Removing customizations created by the Frappe URY app...")
		remove_custom_fields()
	except Exception as e:
		print(f"Failed To Remove Customizations: {e}")

	ROLES = ["URY Manager", "URY Captain", "URY Cashier"]

	frappe.db.delete("Custom DocPerm",{"role": ["in", ROLES]})

	print ("* removing URY Roles...")
	frappe.db.delete("Role", {"name": ["in", ROLES]})
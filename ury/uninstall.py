import click
import frappe

from ury.setup_customizations import before_uninstall as remove_custom_fields


def before_uninstall():
    try:
        print("Removing customizations created by the Frappe URY app...")
        # remove_custom_fields()

    except:
        print("Failed To Remove Customizations.")

def uninstall():
	try:
		print("Removing customizations created by the Frappe URY app...")
		remove_custom_fields()
	except Exception as e:
		print(f"Failed To Remove Customizations: {e}")

	ROLES = ["URY Manager", "URY Captain", "URY Cashier", "URY Admin"]

	frappe.db.delete("Custom DocPerm",{"role": ["in", ROLES]})

	print ("* removing URY Roles...")
	frappe.db.delete("Role", {"name": ["in", ROLES]})
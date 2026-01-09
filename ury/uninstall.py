import click
import frappe
from ury.setup import before_uninstall as remove_custom_fields


def before_uninstall():
    print("Removing customizations created by the Frappe URY app...")
    # remove_custom_fields()
    # Delete URY Roles  
    frappe.db.delete("Role", {"role_name": ["like", "URY %"]})

    # Delete Client Scripts (adjust pattern)
    frappe.db.delete("Client Script", {"name": ["like", "%URY%"]})

def after_uninstall():
    print("Frappe URY app uninstalled successfully.")
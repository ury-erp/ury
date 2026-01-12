import click
import frappe
from ury.setup import before_uninstall as remove_custom_fields
from ury.setup import get_roles


def before_uninstall():
    print("Removing customizations created by the Frappe URY app...")
    remove_custom_fields()

    # Delete URY Roles defined in setup.py
    role_names = [role.get("role_name") for role in get_roles()]
    
    if role_names:
        frappe.db.delete("Role", {"role_name": ["in", role_names]})
        print(f"Deleted Roles: {', '.join(role_names)}")

    # Delete Client Scripts (adjust pattern)
    frappe.db.delete("Client Script", {"name": ["like", "%URY%"]})

def after_uninstall():
    print("Frappe URY app uninstalled successfully.")
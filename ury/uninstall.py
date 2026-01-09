import click
import frappe

from ury.setup import before_uninstall as remove_custom_fields


def before_uninstall():
    print("Removing customizations created by the Frappe URY app...")
    # remove_custom_fields()
    # frappe.db.delete("Custom Field", {"name": ["in", field_names]})
    
    # # 2. Delete Property Setters
    # frappe.db.delete("Property Setter", {"name": ["in", ["POS Closing Entry Detail-closing_amount-label"]]})
    
    # 3. Delete URY Roles  
    frappe.db.delete("Role", {"role_name": ["like", "URY %"]})
    
    frappe.db.commit()
    frappe.clear_cache()
    frappe.log_error(" URY App cleanup completed", "Uninstall Hook")

def after_uninstall():
    print("Frappe URY app uninstalled successfully.")
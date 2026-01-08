import frappe

def before_uninstall():
    print(" Removing ALL URY custom fields...")

    ury_doctypes = [
        "POS Invoice", "Sales Invoice", "POS Profile", "Address", "item", "item_barcode",
        "POS Opening Entry", "Price List", "Branch", "POS Closing Entry", "Employee",
        "Customer", "POS Invoice Item", "Contact", "POS Closing Entry Detail", "POS Profile User"
    ]
    
    frappe.db.delete("Custom Field", {"name": ("like", "%URY%")})
    frappe.db.delete("Custom Field", {"fieldname": ("like", "%URY%")})
    frappe.db.delete("Custom Field", {"dt": ("in", ury_doctypes)})
    frappe.db.delete("Property Setter", {"doc_type": ("in", ury_doctypes)})

    frappe.db.delete("Role", {"name": ("like", "URY%")})
    frappe.db.delete("Has Role", {"role": ("like", "URY%")})
    frappe.db.delete("User Permission", {"allow": ("like", "URY%")})
    frappe.db.commit()

    frappe.clear_cache()
    print(" URY custom fields, property setters, roles deleted")
def after_uninstall():
    print(" Final cleanup after URY uninstall...")
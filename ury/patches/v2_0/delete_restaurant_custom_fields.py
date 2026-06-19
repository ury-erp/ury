import frappe

def execute():
    fields_to_delete = [
        'POS Invoice-restaurant',
        'Sales Invoice-restaurant',
        'POS Profile-restaurant',
        'POS Opening Entry-restaurant'
    ]
    
    for fieldname in fields_to_delete:
        if frappe.db.exists('Custom Field', fieldname):
            frappe.delete_doc('Custom Field', fieldname)
            print(f"Deleted {fieldname}")
    
    frappe.db.commit()

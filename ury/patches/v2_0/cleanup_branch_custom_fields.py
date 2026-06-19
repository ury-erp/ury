import frappe

def execute():
    fields_to_delete = [
        'Branch-company_and_menu_section',
        'Branch-column_break_4',
        'Branch-column_break_vo5jt',
        'Branch-address'
    ]
    
    for fieldname in fields_to_delete:
        if frappe.db.exists('Custom Field', fieldname):
            frappe.delete_doc('Custom Field', fieldname)
            print(f"Deleted {fieldname}")
    
    frappe.db.commit()
    frappe.clear_cache(doctype="Branch")

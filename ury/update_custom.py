import frappe

def execute():
    doc = frappe.get_doc('DocType', 'URY Merged POS Invoice Item')
    doc.custom = 0
    doc.save()
    print("DocType set to standard")

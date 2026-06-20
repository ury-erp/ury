import frappe

def execute():
    order_types = ["Dine In", "Take Away", "Delivery", "Phone In", "Aggregators"]
    for ot in order_types:
        if not frappe.db.exists("URY Order Type", ot):
            doc = frappe.new_doc("URY Order Type")
            doc.name1 = ot
            doc.is_active = 1
            doc.insert(ignore_permissions=True)

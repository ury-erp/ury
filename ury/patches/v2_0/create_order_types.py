import frappe

def execute():
	order_types = ["Dine In", "Take Away", "Delivery", "Phone In", "Aggregators"]
	for ot in order_types:
		if not frappe.db.exists("URY Order Type", ot):
			doc = frappe.new_doc("URY Order Type")
			doc.name1 = ot
			doc.is_active = 1
			doc.insert(ignore_permissions=True)
			
	custom_fields = frappe.get_all("Custom Field", filters={"fieldname": "order_type", "dt": ["in", ["POS Invoice", "Sales Invoice"]]})
	for cf in custom_fields:
		doc = frappe.get_doc("Custom Field", cf.name)
		if doc.fieldtype == "Link" and doc.options == "URY Order Type":
			continue
		doc.fieldtype = "Link"
		doc.options = "URY Order Type"
		doc.save()
	
	frappe.clear_cache(doctype="POS Invoice")
	frappe.clear_cache(doctype="Sales Invoice")
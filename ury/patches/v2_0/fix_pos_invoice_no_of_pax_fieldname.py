import frappe


def execute():
	"""Fix corrupt Custom Field where no_of_pax was saved with fieldname order_type."""
	name = "POS Invoice-no_of_pax"
	if not frappe.db.exists("Custom Field", name):
		return

	fieldname = frappe.db.get_value("Custom Field", name, "fieldname")
	if fieldname != "order_type":
		return

	doc = frappe.get_doc("Custom Field", name)
	doc.fieldname = "no_of_pax"
	doc.fieldtype = "Data"
	doc.options = ""
	doc.read_only = 0
	doc.save(ignore_permissions=True)
	frappe.clear_cache(doctype="POS Invoice")

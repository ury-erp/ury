import frappe
from frappe.permissions import add_permission, update_permission_property

# Same reason as v3_34: sites with Custom DocPerm rows ignore the doctype JSON permissions.
GRANTS = {
	"URY Issue Authorization": ("read", "report", "export", "print"),
	"URY Fulfilment Record": ("read", "report", "export", "print"),
}


def execute():
	for doctype, ptypes in GRANTS.items():
		if not frappe.db.exists("DocType", doctype):
			continue
		if not frappe.db.exists("Custom DocPerm", {"parent": doctype}):
			continue
		add_permission(doctype, "URY Manager", 0)
		for ptype in ptypes:
			update_permission_property(doctype, "URY Manager", 0, ptype, 1)

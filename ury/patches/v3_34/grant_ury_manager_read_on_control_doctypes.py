import frappe
from frappe.permissions import add_permission, update_permission_property

# Sites whose doctype has Custom DocPerm rows ignore the permissions in the doctype JSON,
# so the URY Manager rows added there never apply. Mirror them as Custom DocPerm.
GRANTS = {
	"URY Stock Reservation": ("read", "report", "export", "print"),
	"URY Stock Movement": ("read", "report", "export", "print"),
	"Bulk Production": ("read", "report", "export", "print"),
	"URY Fulfilment Posting Intent": ("read", "report", "export", "print"),
	"URY Feature Flags": ("read",),
	"Stock Correction": (
		"read", "write", "create", "submit", "cancel", "amend",
		"report", "export", "print", "email", "share",
	),
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

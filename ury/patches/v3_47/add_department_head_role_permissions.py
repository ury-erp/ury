"""Create the URY Department Head role and its DocType permissions.

Track ``sa-chef-ui-production-queue`` (decisions D1, D11). The role gates the
Production Board (``/ury/production-board``). It is granted its own permissions directly; the
ERPNext ``Manufacturing User`` role is not required. Prepare Production
inserts and submits Work Orders and Manufacture Stock Entries as the calling
user (``ury_production_plan_auto_work_order``, ``ignore_permissions=False``),
so those rights are part of the role.

Idempotent:

- the Role is inserted only when missing;
- ``add_permission`` returns early when the role already has a rule at that
  permlevel, and ``update_permission_property`` only sets flags, so a re-run
  re-asserts the same rows without duplicates;
- only rows for this role are touched. ``add_permission`` copies a DocType's
  standard permissions into Custom DocPerm before adding the first custom
  rule (``setup_custom_perms``), so other roles keep their access.

Also enables ``track_changes`` on Production Plan through a Property Setter so
Draft quantity edits and submits are kept as Version rows.

Called from ``ury.install.ensure_role_permissions`` as well, because a fresh
install marks patches complete without running them.
"""

import frappe
from frappe.core.doctype.doctype.doctype import validate_permissions_for_doctype
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.permissions import add_permission, update_permission_property

ROLE = "URY Department Head"

READ = {"select": 1, "read": 1}
READ_REPORT = {"select": 1, "read": 1, "report": 1, "export": 1, "print": 1}

PERMISSIONS = [
	("URY Production Department", READ),
	("URY Production Unit", READ),
	("URY Item Production Configuration", READ),
	("URY Production Settings", READ),
	("URY Sales Plan", READ_REPORT),
	("Production Plan", {**READ_REPORT, "write": 1, "submit": 1}),
	("Work Order", {**READ_REPORT, "write": 1, "create": 1, "submit": 1}),
	("Stock Entry", {**READ_REPORT, "write": 1, "create": 1, "submit": 1}),
	("Material Request", READ_REPORT),
	("Item", READ),
	("Item Group", READ),
	("BOM", READ),
	("Bin", READ),
	("Warehouse", READ),
	("UOM", READ),
	("Company", READ),
	("Branch", READ),
	("Workstation", READ),
]

PERMISSION_KEYS = {
	"select", "read", "write", "create", "delete", "submit", "cancel", "amend",
	"print", "email", "report", "import", "export", "share",
}


def execute():
	ensure_role()
	for doctype, perms in PERMISSIONS:
		if not frappe.db.exists("DocType", doctype):
			continue
		apply_role_permissions(doctype, perms)
	enable_production_plan_track_changes()


def ensure_role():
	if frappe.db.exists("Role", ROLE):
		return
	frappe.get_doc(
		{"doctype": "Role", "role_name": ROLE, "desk_access": 1, "is_custom": 0}
	).insert(ignore_permissions=True)


def apply_role_permissions(doctype, perms, permlevel=0):
	add_permission(doctype, ROLE, permlevel)
	for ptype, value in perms.items():
		if ptype in PERMISSION_KEYS:
			update_permission_property(
				doctype=doctype, role=ROLE, permlevel=permlevel, ptype=ptype, value=value, validate=False
			)
	validate_permissions_for_doctype(doctype)


def enable_production_plan_track_changes():
	if not frappe.db.exists("DocType", "Production Plan"):
		return
	make_property_setter(
		"Production Plan",
		None,
		"track_changes",
		1,
		"Check",
		for_doctype=True,
		validate_fields_for_doctype=False,
	)

"""Grant permlevel-1 write on Item's yield-standard fields to manager roles.

F2 follow-up (PR #435 adversarial review): custom_yield_percent,
custom_yield_tracked, custom_yield_check_cadence and
custom_yield_check_interval_days were raised to permlevel: 1 in
fixtures/custom_field.json (this patch runs in post_model_sync, after that
fixture has already synced). Raising the permlevel alone blocks *every* role
from writing those fields until an explicit permlevel-1 perm row grants it
back -- so this patch adds that row for URY Manager and System Manager,
matching the existing pattern in patches/v2_0/default_permissions.py (e.g.
its ("User", {"permlevel": 1, ...}) rows for URY Captain/Cashier/Manager).

Without this, update_yield_standards() would still call require_manager()
correctly, but doc.save() would silently drop the four fields for anyone
without permlevel-1 write access -- including managers -- because Frappe's
permlevel enforcement filters out disallowed fields rather than raising.
"""

import frappe
from frappe.permissions import add_permission, update_permission_property
from frappe.core.doctype.doctype.doctype import validate_permissions_for_doctype

DOCTYPE = "Item"
PERMLEVEL = 1
ROLES = ("URY Manager", "System Manager")


def execute():
	if not frappe.db.exists("DocType", DOCTYPE):
		return

	for role in ROLES:
		add_permission(DOCTYPE, role, PERMLEVEL)
		for ptype, value in {"read": 1, "write": 1}.items():
			update_permission_property(
				doctype=DOCTYPE,
				role=role,
				permlevel=PERMLEVEL,
				ptype=ptype,
				value=value,
				validate=False,
			)

	validate_permissions_for_doctype(DOCTYPE)
	frappe.clear_cache(doctype=DOCTYPE)

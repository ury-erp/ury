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

Also defensively (re-)grants ordinary permlevel-0 read/write/create on Item
to the same roles. URY Manager's permlevel-0 Item write is *supposed* to
already exist via patches/v2_0/default_permissions.py, and it does on
long-lived sites -- but a CI run on a freshly migrated site surfaced a real
PermissionError on doc.save() for a URY Manager test user with no other
role, i.e. permlevel-0 write was missing at check_permission() time even
before permlevel-1 came into it. Re-asserting it here (idempotent -- these
calls no-op if the row/property already matches) makes this patch
self-sufficient rather than silently depending on patch-ordering/caching
behavior of an unrelated older patch.
"""

import frappe
from frappe.permissions import add_permission, update_permission_property
from frappe.core.doctype.doctype.doctype import validate_permissions_for_doctype

DOCTYPE = "Item"
PERMLEVEL_1 = 1
PERMLEVEL_0 = 0
ROLES = ("URY Manager", "System Manager")


def execute():
	if not frappe.db.exists("DocType", DOCTYPE):
		return

	for role in ROLES:
		# Defensive re-assertion of base permlevel-0 access (see docstring).
		add_permission(DOCTYPE, role, PERMLEVEL_0)
		for ptype, value in {"read": 1, "write": 1, "create": 1}.items():
			update_permission_property(
				doctype=DOCTYPE,
				role=role,
				permlevel=PERMLEVEL_0,
				ptype=ptype,
				value=value,
				validate=False,
			)

		# The actual point of this patch: permlevel-1 access to the four
		# yield-standard fields, now that they're gated off from plain
		# Item-write roles.
		add_permission(DOCTYPE, role, PERMLEVEL_1)
		for ptype, value in {"read": 1, "write": 1}.items():
			update_permission_property(
				doctype=DOCTYPE,
				role=role,
				permlevel=PERMLEVEL_1,
				ptype=ptype,
				value=value,
				validate=False,
			)

	validate_permissions_for_doctype(DOCTYPE)
	frappe.clear_cache(doctype=DOCTYPE)

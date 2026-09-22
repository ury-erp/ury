"""Grant write on URY Stock Reservation to Captain and Cashier.

Order updates reconcile reservations by releasing the previous group and
recreating at the new qty. Release uses doc.save(), which needs write —
not only create. Captain/Cashier already had create (new orders worked)
but lacked write, so qty increases on existing table orders failed with
PermissionError before create_reservation could raise Insufficient capacity.

DocType JSON is updated in the same change; this patch applies write on
existing sites that already synced the DocType without that property.
"""

from frappe.permissions import add_permission, update_permission_property
from frappe.core.doctype.doctype.doctype import validate_permissions_for_doctype

import frappe

DOCTYPE = "URY Stock Reservation"
ROLES = ("URY Captain", "URY Cashier")
PERMLEVEL = 0


def execute():
	if not frappe.db.exists("DocType", DOCTYPE):
		return

	for role in ROLES:
		add_permission(DOCTYPE, role, PERMLEVEL)
		for ptype, value in {"read": 1, "create": 1, "write": 1}.items():
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

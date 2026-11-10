"""Cashier-only Desk detection and the Daily Operations workspace constants.

A user is "cashier-only" when `URY Cashier` is their only business role. Any
additional role (URY Manager, URY Admin, URY Owner, URY Captain, System Manager,
Accounts/HR roles, ...) means the user keeps the normal Desk experience.

Kept free of request-specific state so it can be unit tested with a patched
`frappe.get_roles`.
"""

import frappe

CASHIER_ROLE = "URY Cashier"

# Roles that are ignored when deciding whether a user is cashier-only, on top of
# Frappe's automatic roles (Guest, All, Desk User, Administrator). Empty on
# purpose: every additional role counts as a reason to keep the full Desk.
NEUTRAL_ROLES = frozenset()

WORKSPACE_NAME = "Daily Operations"
SHELL_SLUG = "ury"
WORKSPACE_SLUG = "daily-operations"
WORKSPACE_ROUTE = f"/desk/{SHELL_SLUG}/{WORKSPACE_SLUG}"

# Roles allowed to call the Daily Operations dashboard endpoints.
DASHBOARD_ROLES = frozenset({"URY Cashier", "URY Manager", "URY Admin", "URY Owner", "System Manager"})
# Roles that may see every branch when they are not assigned to one.
ELEVATED_ROLES = frozenset({"URY Manager", "URY Admin", "URY Owner", "System Manager"})


def is_cashier_only(user=None):
	"""True when `URY Cashier` is the user's only business role."""
	user = user or frappe.session.user
	if not user or user in ("Administrator", "Guest"):
		return False

	from frappe.permissions import AUTOMATIC_ROLES

	roles = set(frappe.get_roles(user)) - set(AUTOMATIC_ROLES) - set(NEUTRAL_ROLES)
	return roles == {CASHIER_ROLE}

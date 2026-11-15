"""Who may do what in URY, in one place.

URY's roles nest: each level can do everything the level below can.

    Waiter  (URY Captain)  take orders on their own tables, print the bill
    Cashier (URY Cashier)  + take payment, open and close the till,
                             transfer tables and see every table
    Manager (URY Manager)  + cancel orders and remove sent items without
                             approval, reports, staff and PINs
    Admin   (URY Admin)    + setup and accounting in the Desk

The POS Profile's role tables can grant a capability to extra roles
("Allowed for Billing", "Transfer Role Permissions"), but never take one
away from a level that already has it. "Restricted for Table Order" still
restricts.

Use these helpers instead of comparing role names, so the POS screens
(via pos_capabilities) and the server checks always agree.
"""

import frappe

WAITER = 1
CASHIER = 2
MANAGER = 3
ADMIN = 4

ROLE_LEVELS = {
	"URY Captain": WAITER,
	"URY Cashier": CASHIER,
	"URY Manager": MANAGER,
	"URY Admin": ADMIN,
	"System Manager": ADMIN,
}

# How each URY role is shown to people.
ROLE_LABELS = {
	"URY Captain": "Waiter",
	"URY Cashier": "Cashier",
	"URY Manager": "Manager",
	"URY Admin": "Admin",
}


def _roles(user_roles=None, user=None):
	if user_roles is not None:
		return set(user_roles)
	return set(frappe.get_roles(user))


def level(user_roles=None, user=None) -> int:
	"""Highest URY level among the roles; 0 for none."""
	if (user or frappe.session.user) == "Administrator" and user_roles is None:
		return ADMIN
	return max((ROLE_LEVELS.get(role, 0) for role in _roles(user_roles, user)), default=0)


def _granted_by_profile(roles, rows) -> bool:
	return any(row.role in roles for row in (rows or []))


def can_bill(user_roles=None, pos_profile=None, user=None) -> bool:
	"""Take payment and settle bills."""
	roles = _roles(user_roles, user)
	return level(user_roles, user) >= CASHIER or _granted_by_profile(
		roles, pos_profile and pos_profile.get("role_allowed_for_billing")
	)


def can_manage_tables(user_roles=None, pos_profile=None, user=None) -> bool:
	"""Transfer tables and orders between waiters, and see every table."""
	roles = _roles(user_roles, user)
	return level(user_roles, user) >= CASHIER or _granted_by_profile(
		roles, pos_profile and pos_profile.get("transfer_role_permissions")
	)


def is_restricted_from_table_orders(user_roles=None, pos_profile=None, user=None) -> bool:
	return _granted_by_profile(
		_roles(user_roles, user), pos_profile and pos_profile.get("role_restricted_for_table_order")
	)


def is_manager(user_roles=None, user=None) -> bool:
	return level(user_roles, user) >= MANAGER


def is_admin(user_roles=None, user=None) -> bool:
	return level(user_roles, user) >= ADMIN


def require_manager(message=None):
	if not is_manager():
		frappe.throw(message or "Only a manager can do this.", frappe.PermissionError)


def assignable_roles(user=None) -> list[str]:
	"""URY roles this user may give to staff: managers hand out Waiter,
	Cashier and Manager; only an admin hands out Admin."""
	user_level = level(user=user)
	if user_level >= ADMIN:
		return ["URY Captain", "URY Cashier", "URY Manager", "URY Admin"]
	if user_level >= MANAGER:
		return ["URY Captain", "URY Cashier", "URY Manager"]
	return []


def check_can_assign(role, user=None):
	if role not in assignable_roles(user):
		frappe.throw(
			frappe._("You are not allowed to give the role {0}.").format(role), frappe.PermissionError
		)


def pos_capabilities(pos_profile=None, user=None) -> dict:
	"""What the POS should offer this user. Server checks use the same rules."""
	roles = _roles(None, user)
	user_level = level(None, user)
	billing = can_bill(roles, pos_profile) or user_level >= CASHIER
	return {
		"level": user_level,
		"role_label": next(
			(ROLE_LABELS[r] for r in sorted(ROLE_LABELS, key=ROLE_LEVELS.get, reverse=True) if r in roles),
			None,
		),
		"canTakeTableOrders": not is_restricted_from_table_orders(roles, pos_profile),
		"canAccessOtherCaptainsTables": can_manage_tables(roles, pos_profile) or billing,
		"canTransferCaptain": can_manage_tables(roles, pos_profile),
		"canSettlePayment": billing,
		"canApplyDiscount": billing,
		"canOpenPOS": user_level >= CASHIER,
		"canClosePOS": user_level >= CASHIER,
		# Cashiers can request these; a manager approves (see order approvals).
		"canCancelOrder": billing,
		"cancelNeedsApproval": user_level < MANAGER,
		# Removing items already sent to the kitchen: always possible, with a
		# manager's approval PIN below manager (see ury.ury.approvals).
		"canRemoveSentItems": True,
		"removeNeedsApproval": user_level < MANAGER,
		"isManager": user_level >= MANAGER,
	}

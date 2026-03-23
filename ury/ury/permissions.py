# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""
URY Permissions — Capability Engine

Three-layer permission system:
1. Capability Layer — Fine-grained capabilities checked everywhere
2. URY Role Layer — Named roles owning sets of capabilities
3. Frappe Role Layer — Backing Frappe roles for DocType-level enforcement
"""

import frappe
from frappe import _

# ---------------------------------------------------------------------------
# Capability Catalogue
# ---------------------------------------------------------------------------
# Maps capability key → human-readable label
CAPABILITIES = {
	# Users
	"users.create": "Create Users",
	"users.edit": "Edit Users",
	"users.manage": "Manage Users",

	# Roles
	"roles.assign": "Assign Roles",
	"roles.manage": "Manage Roles",

	# Orders
	"orders.create": "Create Orders",
	"orders.edit": "Edit Orders",
	"orders.view_own": "View Own Orders",
	"orders.view_branch": "View Branch Orders",
	"orders.view_all": "View All Orders",
	"orders.cancel": "Cancel Orders",

	# Payments
	"payments.collect": "Collect Payment",
	"payments.refund": "Refund / Void",
	"payments.view_reports": "View Payment Reports",

	# Kitchen
	"kitchen.view": "View Kitchen Tickets",
	"kitchen.manage": "Manage Kitchen",

	# Dispatch
	"dispatch.view": "View Dispatch",
	"dispatch.manage": "Manage Dispatch",

	# Reports
	"reports.view_branch": "View Branch Reports",
	"reports.view_global": "View Global Reports",

	# Settings
	"settings.manage_branch": "Manage Branch Settings",
	"settings.manage_global": "Manage Global Settings",
	"settings.manage_system": "Manage System Settings",

	# Branches
	"branches.manage": "Manage Branches",

	# Shifts
	"shifts.manage": "Manage Shifts",

	# Menu / Catalog
	"menu.manage": "Manage Menu / Catalog",
}

# ---------------------------------------------------------------------------
# URY Role → Frappe Role mapping
# ---------------------------------------------------------------------------
URY_ROLE_FRAPPE_ROLE_MAP = {
	# Desk-capable roles
	"URY Admin": "System Manager",
	"URY Ops Admin": "URY Ops Admin",
	"URY Manager": "URY Manager",
	"URY Purchase Manager": "URY Purchase Manager",
	"URY Sales Manager": "URY Sales Manager",
	"URY Accountant": "URY Accountant",
	"URY Analyst": "URY Analyst",
	"URY Director": "URY Director",
	# Frontend-only roles
	"URY Cashier": "URY Cashier",
	"URY Captain": "URY Captain",
	"URY Servicer": "URY Servicer",
	"URY Chef": "URY Chef",
	"URY Store Manager": "URY Store Manager",
	"URY Store Admin": "URY Store Admin",
	"URY Store Accountant": "URY Store Accountant",
}

# ---------------------------------------------------------------------------
# Default Role → Capability sets
# Mapped from the role matrix screenshot:
# Platform Admin, Ops Admin, Manager → desk; Service Lead, Order Staff,
# Cashier, Kitchen Staff, Dispatch Staff, Back Office → frontend/desk
# ---------------------------------------------------------------------------
DEFAULT_ROLE_CAPABILITIES = {
	"URY Admin": list(CAPABILITIES.keys()),  # All capabilities

	"URY Ops Admin": list(CAPABILITIES.keys()),  # All capabilities

	"URY Manager": [
		"users.create", "users.edit",
		"roles.assign",
		"orders.create", "orders.edit", "orders.view_branch", "orders.view_all", "orders.cancel",
		"payments.collect", "payments.refund", "payments.view_reports",
		"kitchen.view", "kitchen.manage",
		"dispatch.view", "dispatch.manage",
		"reports.view_branch", "reports.view_global",
		"settings.manage_branch",
		"branches.manage",
		"shifts.manage",
		"menu.manage",
	],

	"URY Director": [
		"users.create", "users.edit",
		"roles.assign",
		"orders.view_all", "orders.view_branch",
		"payments.view_reports",
		"kitchen.view",
		"dispatch.view",
		"reports.view_branch", "reports.view_global",
		"settings.manage_branch", "settings.manage_global",
		"branches.manage",
	],

	"URY Purchase Manager": [
		"orders.view_branch", "orders.view_all",
		"reports.view_branch", "reports.view_global",
		"settings.manage_branch",
		"menu.manage",
	],

	"URY Sales Manager": [
		"orders.create", "orders.edit", "orders.view_branch", "orders.view_all",
		"payments.collect", "payments.view_reports",
		"reports.view_branch", "reports.view_global",
		"menu.manage",
	],

	"URY Accountant": [
		"orders.view_branch", "orders.view_all",
		"payments.collect", "payments.refund", "payments.view_reports",
		"reports.view_branch", "reports.view_global",
		"shifts.manage",
	],

	"URY Analyst": [
		"orders.view_branch", "orders.view_all",
		"payments.view_reports",
		"reports.view_branch", "reports.view_global",
	],

	# Frontend-only roles
	"URY Captain": [
		"orders.create", "orders.edit", "orders.view_own", "orders.view_branch",
		"kitchen.view",
	],

	"URY Servicer": [
		"orders.create", "orders.edit", "orders.view_own", "orders.view_branch",
		"orders.cancel",
		"kitchen.view", "kitchen.manage",
		"dispatch.view", "dispatch.manage",
		"payments.collect",
		"reports.view_branch",
	],

	"URY Cashier": [
		"orders.view_own", "orders.view_branch",
		"orders.edit",
		"payments.collect", "payments.refund", "payments.view_reports",
		"shifts.manage",
		"reports.view_branch",
	],

	"URY Chef": [
		"kitchen.view", "kitchen.manage",
		"orders.view_branch",
	],

	"URY Store Manager": [
		"users.create", "users.edit",
		"roles.assign",
		"orders.create", "orders.edit", "orders.view_branch", "orders.view_all", "orders.cancel",
		"payments.collect", "payments.refund", "payments.view_reports",
		"kitchen.view", "kitchen.manage",
		"dispatch.view", "dispatch.manage",
		"reports.view_branch",
		"settings.manage_branch",
		"shifts.manage",
		"menu.manage",
	],

	"URY Store Admin": [
		"users.create", "users.edit",
		"roles.assign",
		"orders.create", "orders.edit", "orders.view_branch", "orders.view_all", "orders.cancel",
		"payments.collect", "payments.refund", "payments.view_reports",
		"kitchen.view", "kitchen.manage",
		"dispatch.view", "dispatch.manage",
		"reports.view_branch", "reports.view_global",
		"settings.manage_branch",
		"branches.manage",
		"shifts.manage",
		"menu.manage",
	],

	"URY Store Accountant": [
		"orders.view_branch",
		"payments.collect", "payments.refund", "payments.view_reports",
		"reports.view_branch",
		"shifts.manage",
	],
}

# Desk-access roles (these users can access ERPNext/Frappe Desk)
DESK_ACCESS_ROLES = {
	"URY Admin", "URY Ops Admin", "URY Manager",
	"URY Purchase Manager", "URY Sales Manager",
	"URY Accountant", "URY Analyst", "URY Director",
}

# Role descriptions
ROLE_DESCRIPTIONS = {
	"URY Admin": "Full control over the entire system. Platform-level superuser.",
	"URY Ops Admin": "Operational superuser across all branches. Full business control.",
	"URY Manager": "Branch manager with full operational control over one branch.",
	"URY Director": "Founder/director with strategic oversight and reporting access.",
	"URY Purchase Manager": "Manages purchasing, inventory, and supplier operations.",
	"URY Sales Manager": "Manages sales operations, pricing, and revenue tracking.",
	"URY Accountant": "Financial operations, payments, reconciliation, and reporting.",
	"URY Analyst": "Read-only access to reports, analytics, and business data.",
	"URY Captain": "Order taker — creates and manages orders on the floor.",
	"URY Servicer": "Floor/counter supervisor — oversees service and operations.",
	"URY Cashier": "Handles billing, payments, and settlement.",
	"URY Chef": "Kitchen staff — manages preparation and kitchen tickets.",
	"URY Store Manager": "Runs a store/outlet with staff and operational management.",
	"URY Store Admin": "Store-level admin with broader settings and branch control.",
	"URY Store Accountant": "Store-level financial and payment management.",
}

# Cache TTL in seconds
CACHE_TTL = 300


# ---------------------------------------------------------------------------
# Public Functions
# ---------------------------------------------------------------------------

def get_user_ury_role(user=None):
	"""Get the URY role name for a user. Returns None if not assigned."""
	user = user or frappe.session.user

	cached = frappe.cache().get_value(f"ury_role_{user}")
	if cached:
		return cached

	role = frappe.db.get_value(
		"URY User Role",
		{"user": user, "enabled": 1},
		"ury_role"
	)

	if role:
		frappe.cache().set_value(f"ury_role_{user}", role, expires_in_sec=CACHE_TTL)

	return role


def get_user_capabilities(user=None):
	"""Get the list of capability keys for a user. Cached for CACHE_TTL seconds."""
	user = user or frappe.session.user

	# System Manager / Administrator gets all capabilities
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return list(CAPABILITIES.keys())

	cached = frappe.cache().get_value(f"ury_caps_{user}")
	if cached:
		return cached

	ury_role = get_user_ury_role(user)
	if not ury_role:
		return []

	caps = frappe.get_all(
		"URY Role Permission",
		filters={"parent": ury_role, "parenttype": "URY Role"},
		pluck="capability"
	)

	frappe.cache().set_value(f"ury_caps_{user}", caps, expires_in_sec=CACHE_TTL)
	return caps


def has_capability(user, capability):
	"""Check if a user has a specific capability. Central check function."""
	caps = get_user_capabilities(user)
	return capability in caps


@frappe.whitelist()
def get_me():
	"""Return current user info with URY role and capabilities."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Not logged in"), frappe.AuthenticationError)

	ury_role = get_user_ury_role(user)
	capabilities = get_user_capabilities(user)
	full_name = frappe.db.get_value("User", user, "full_name") or user

	return {
		"user": user,
		"full_name": full_name,
		"ury_role": ury_role,
		"capabilities": capabilities,
	}

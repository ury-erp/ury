# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""
URY Permissions API — Whitelisted endpoints for user and role management.
All endpoints guard with _require(capability).
"""

import frappe
from frappe import _
from frappe.utils import now_datetime

from ury.ury.permissions import (
	has_capability,
	CAPABILITIES,
	get_user_capabilities,
	get_user_ury_role,
)


def _require(capability):
	"""Guard: raise PermissionError if current user lacks the capability."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Not logged in"), frappe.AuthenticationError)
	if not has_capability(user, capability):
		frappe.throw(
			_("You do not have the required permission: {0}").format(capability),
			frappe.PermissionError,
		)


# ---------------------------------------------------------------------------
# User Management APIs
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_users():
	"""Get all URY user role assignments."""
	_require("users.manage")

	users = frappe.get_all(
		"URY User Role",
		fields=["user", "full_name", "ury_role", "enabled", "invited_by", "invited_on"],
		order_by="creation desc",
	)

	# Enrich with email
	for u in users:
		u["email"] = u["user"]

	return users


@frappe.whitelist()
def invite_user(email, full_name, ury_role):
	"""Create a new user and assign a URY role."""
	_require("users.create")

	if not email or not full_name or not ury_role:
		frappe.throw(_("Email, full name, and role are required."))

	# Validate role exists
	if not frappe.db.exists("URY Role", ury_role):
		frappe.throw(_("Invalid URY Role: {0}").format(ury_role))

	# Check if URY User Role already exists
	if frappe.db.exists("URY User Role", email):
		frappe.throw(_("User {0} already has a URY role assigned.").format(email))

	# Create Frappe User if not exists
	if not frappe.db.exists("User", email):
		user_doc = frappe.new_doc("User")
		user_doc.email = email
		user_doc.first_name = full_name.split(" ")[0]
		if len(full_name.split(" ")) > 1:
			user_doc.last_name = " ".join(full_name.split(" ")[1:])
		user_doc.send_welcome_email = 1
		user_doc.flags.ignore_permissions = True
		user_doc.insert()
	else:
		# Update full name if user exists
		frappe.db.set_value("User", email, "full_name", full_name, update_modified=False)

	# Create URY User Role
	ury_user_role = frappe.new_doc("URY User Role")
	ury_user_role.user = email
	ury_user_role.ury_role = ury_role
	ury_user_role.enabled = 1
	ury_user_role.flags.ignore_permissions = True
	ury_user_role.insert()

	frappe.db.commit()
	return {"message": _("User {0} invited successfully.").format(email)}


@frappe.whitelist()
def update_user_role(user, ury_role):
	"""Change a user's URY role."""
	_require("users.manage")

	if not frappe.db.exists("URY User Role", user):
		frappe.throw(_("No URY role assignment found for user: {0}").format(user))

	if not frappe.db.exists("URY Role", ury_role):
		frappe.throw(_("Invalid URY Role: {0}").format(ury_role))

	doc = frappe.get_doc("URY User Role", user)
	doc.ury_role = ury_role
	doc.flags.ignore_permissions = True
	doc.save()

	frappe.db.commit()
	return {"message": _("Role updated successfully.")}


@frappe.whitelist()
def set_user_enabled(user, enabled):
	"""Enable or disable a user's URY role."""
	_require("users.manage")

	if not frappe.db.exists("URY User Role", user):
		frappe.throw(_("No URY role assignment found for user: {0}").format(user))

	enabled = int(enabled)
	doc = frappe.get_doc("URY User Role", user)
	doc.enabled = enabled
	doc.flags.ignore_permissions = True
	doc.save()

	frappe.db.commit()
	return {"message": _("User {0}.").format("enabled" if enabled else "disabled")}


# ---------------------------------------------------------------------------
# Role Management APIs
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_ury_roles():
	"""Get all URY roles with their capabilities."""
	user = frappe.session.user
	if not (has_capability(user, "users.manage") or has_capability(user, "roles.manage")):
		frappe.throw(_("Insufficient permissions."), frappe.PermissionError)

	roles = frappe.get_all(
		"URY Role",
		fields=["role_name", "description", "is_system_role", "desk_access", "frappe_role"],
		order_by="is_system_role desc, role_name asc",
	)

	for role in roles:
		role["capabilities"] = frappe.get_all(
			"URY Role Permission",
			filters={"parent": role["role_name"], "parenttype": "URY Role"},
			fields=["capability", "label"],
		)

	return roles


@frappe.whitelist()
def get_capabilities_catalogue():
	"""Return the full capability catalogue."""
	_require("roles.manage")
	return CAPABILITIES


@frappe.whitelist()
def create_ury_role(role_name, description=None, capabilities=None, desk_access=0):
	"""Create a custom URY role."""
	_require("roles.manage")

	if not role_name:
		frappe.throw(_("Role name is required."))

	if frappe.db.exists("URY Role", role_name):
		frappe.throw(_("Role {0} already exists.").format(role_name))

	capabilities = frappe.parse_json(capabilities) if isinstance(capabilities, str) else (capabilities or [])

	# Validate capabilities
	for cap in capabilities:
		if cap not in CAPABILITIES:
			frappe.throw(_("Unknown capability: {0}").format(cap))

	doc = frappe.new_doc("URY Role")
	doc.role_name = role_name
	doc.description = description
	doc.is_system_role = 0
	doc.desk_access = int(desk_access)

	for cap in capabilities:
		doc.append("permissions", {
			"capability": cap,
			"label": CAPABILITIES[cap],
		})

	doc.flags.ignore_permissions = True
	doc.insert()

	frappe.db.commit()
	return {"message": _("Role {0} created successfully.").format(role_name)}


@frappe.whitelist()
def update_ury_role(role_name, capabilities=None, description=None):
	"""Update capabilities or description of a URY role."""
	_require("roles.manage")

	if not frappe.db.exists("URY Role", role_name):
		frappe.throw(_("Role {0} does not exist.").format(role_name))

	doc = frappe.get_doc("URY Role", role_name)

	if description is not None:
		doc.description = description

	if capabilities is not None:
		capabilities = frappe.parse_json(capabilities) if isinstance(capabilities, str) else capabilities

		# Validate capabilities
		for cap in capabilities:
			if cap not in CAPABILITIES:
				frappe.throw(_("Unknown capability: {0}").format(cap))

		doc.permissions = []
		for cap in capabilities:
			doc.append("permissions", {
				"capability": cap,
				"label": CAPABILITIES[cap],
			})

	doc.flags.ignore_permissions = True
	doc.save()

	frappe.db.commit()
	return {"message": _("Role {0} updated successfully.").format(role_name)}


@frappe.whitelist()
def delete_ury_role(role_name):
	"""Delete a custom URY role (not system roles)."""
	_require("roles.manage")

	if not frappe.db.exists("URY Role", role_name):
		frappe.throw(_("Role {0} does not exist.").format(role_name))

	doc = frappe.get_doc("URY Role", role_name)
	if doc.is_system_role:
		frappe.throw(_("Cannot delete system role: {0}").format(role_name))

	# Check if any users are assigned this role
	users_with_role = frappe.get_all(
		"URY User Role",
		filters={"ury_role": role_name},
		pluck="user",
	)
	if users_with_role:
		frappe.throw(
			_("Cannot delete role {0}. It is assigned to {1} user(s): {2}").format(
				role_name, len(users_with_role), ", ".join(users_with_role[:5])
			)
		)

	doc.flags.ignore_permissions = True
	doc.delete()

	frappe.db.commit()
	return {"message": _("Role {0} deleted successfully.").format(role_name)}

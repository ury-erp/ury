# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Which URY Production Departments a user may see and act on.

Used by the Chef UI (``ury.ury.api.ury_chef_ui``). Every read and every
action resolves the department from stored data and checks it here; a
department or branch sent by the client can only narrow the result.

Rules (track ``sa-chef-ui-production-queue``, decision D2):

- URY Manager, URY Admin, System Manager and Administrator are unrestricted.
- A user with Frappe User Permissions on ``URY Production Department`` sees
  exactly those departments.
- A user without such User Permissions sees every enabled department of the
  branches they belong to. Branches come from User Permissions on
  ``Branch`` when present, otherwise from the ``URY User`` rows on Branch.
- Results are always limited to enabled departments and, when a branch is
  given, to that branch.
"""

from __future__ import annotations

import frappe
from frappe import _

DEPARTMENT_DOCTYPE = "URY Production Department"
BRANCH_DOCTYPE = "Branch"

ELEVATED_ROLES = frozenset({"URY Manager", "URY Admin", "System Manager"})
DEPARTMENT_HEAD_ROLE = "URY Department Head"
CHEF_UI_ROLES = ELEVATED_ROLES | {DEPARTMENT_HEAD_ROLE}


def is_elevated(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	return bool(ELEVATED_ROLES & set(frappe.get_roles(user)))


def has_chef_ui_access(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	return bool(CHEF_UI_ROLES & set(frappe.get_roles(user)))


def require_chef_ui_access(user=None):
	if not has_chef_ui_access(user):
		frappe.throw(_("You are not permitted to use the Chef UI."), frappe.PermissionError)


def _user_permission_values(user, doctype):
	"""Allowed names from Frappe User Permissions, or ``None`` if the user has
	no User Permission rows for ``doctype``."""
	rows = (frappe.permissions.get_user_permissions(user) or {}).get(doctype)
	if not rows:
		return None
	return {row.get("doc") if isinstance(row, dict) else row for row in rows} - {None}


def get_user_branches(user=None):
	"""Branches the user belongs to: Branch User Permissions if any, else the
	``URY User`` child rows on Branch."""
	user = user or frappe.session.user
	permitted = _user_permission_values(user, BRANCH_DOCTYPE)
	if permitted is not None:
		return sorted(permitted)
	rows = frappe.get_all(
		"URY User",
		filters={"user": user, "parenttype": BRANCH_DOCTYPE},
		pluck="parent",
		ignore_permissions=True,
	)
	return sorted(set(rows))


def get_allowed_departments(user=None, branch=None):
	"""Department names the user may access, or ``None`` when unrestricted.

	``None`` is returned only for elevated users and means "no department
	restriction" -- callers still apply ``branch`` themselves. For everyone
	else the result is a (possibly empty) sorted list of enabled departments,
	already limited to ``branch`` when one is given.
	"""
	user = user or frappe.session.user
	if is_elevated(user):
		return None

	filters = {"enabled": 1}
	permitted = _user_permission_values(user, DEPARTMENT_DOCTYPE)
	if permitted is not None:
		if not permitted:
			return []
		filters["name"] = ["in", sorted(permitted)]
	else:
		branches = get_user_branches(user)
		if not branches:
			return []
		filters["branch"] = ["in", branches]

	if branch:
		filters.setdefault("branch", branch)
		if isinstance(filters["branch"], list):
			if branch not in filters["branch"][1]:
				return []
			filters["branch"] = branch

	return sorted(
		frappe.get_all(DEPARTMENT_DOCTYPE, filters=filters, pluck="name", ignore_permissions=True)
	)


def assert_department_access(department, user=None):
	"""Raise ``frappe.PermissionError`` unless ``user`` may access ``department``."""
	if not department:
		frappe.throw(_("No Production Department is set on this record."), frappe.PermissionError)
	allowed = get_allowed_departments(user)
	if allowed is not None and department not in allowed:
		frappe.throw(
			_("You are not permitted to access Production Department {0}.").format(frappe.bold(department)),
			frappe.PermissionError,
		)

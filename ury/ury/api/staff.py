"""Managers adding and editing restaurant staff from the /ury app.

Frappe protects a user's roles at a higher permission level, so a URY
Manager cannot set them through the standard document API (they are
silently dropped). Granting that level would let a manager hand out any
role, System Manager included. These endpoints instead accept only the
URY roles the caller may give (ury.ury.roles.assignable_roles).
"""

import frappe
from frappe import _

from ury.ury import roles

URY_ROLES = ("URY Captain", "URY Cashier", "URY Manager", "URY Admin")


@frappe.whitelist()
def get_assignable_roles():
	return [{"role": role, "label": roles.ROLE_LABELS[role]} for role in roles.assignable_roles()]


@frappe.whitelist(methods=["POST"])
def save_staff_user(email, first_name, role, last_name=None, enabled=1, name=None):
	"""Create a staff user, or update one, with exactly one URY role."""
	roles.require_manager(_("Only a manager can add or change staff."))
	roles.check_can_assign(role)

	if name:
		user = frappe.get_doc("User", name)
		if roles.level(user=user.name) > roles.level():
			frappe.throw(_("You cannot change a user above your own level."), frappe.PermissionError)
		if user.name == frappe.session.user and roles.ROLE_LEVELS[role] < roles.level():
			frappe.throw(_("You cannot lower your own role."))
	else:
		email = (email or "").strip().lower()
		if not email:
			frappe.throw(_("Enter an email address."))
		if frappe.db.exists("User", email):
			frappe.throw(_("A user with this email already exists."))
		user = frappe.new_doc("User")
		user.email = email
		user.send_welcome_email = 1

	user.first_name = (first_name or "").strip()
	user.last_name = (last_name or "").strip() or None
	user.enabled = 1 if frappe.utils.cint(enabled) else 0

	# Replace the URY role; leave any non-URY roles the user has untouched.
	user.set("roles", [row for row in user.get("roles") if row.role not in URY_ROLES])
	user.append("roles", {"role": role})

	user.flags.ignore_permissions = True
	user.save()
	return {"name": user.name, "role": role}

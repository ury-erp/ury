"""Create a waiter: User, role, Branch row, POS Profile row and PIN."""

import re

import frappe
from frappe import _

from ury.ury.station import eligibility, pin as pin_rules

MANAGER_ROLES = {"System Manager", "URY Manager"}


@frappe.whitelist(methods=["POST"])
def create_waiter(full_name, pin, branch=None, pos_profile=None):
	if not MANAGER_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only a manager can add waiters."), frappe.PermissionError)

	full_name = (full_name or "").strip()
	if not full_name:
		frappe.throw(_("Enter the waiter's name."))
	pin = str(pin or "")
	# Check the PIN before creating anything, so a bad PIN leaves no user behind.
	pin_rules.validate_format(pin)
	pin_rules.ensure_unique(pin)

	branch = branch or _only("Branch", {}, _("Choose a Branch."))
	pos_profile = pos_profile or _only(
		"POS Profile", {"branch": branch, "disabled": 0}, _("Choose a POS Profile.")
	)
	if frappe.db.get_value("POS Profile", pos_profile, "branch") != branch:
		frappe.throw(_("POS Profile {0} does not belong to Branch {1}.").format(pos_profile, branch))

	user = _create_user(full_name)
	_append_once("Branch", branch, "user", user.name)
	_append_once("POS Profile", pos_profile, "applicable_for_users", user.name)

	frappe.get_doc({"doctype": "URY Waiter PIN", "user": user.name, "enabled": 1, "new_pin": pin}).insert(
		ignore_permissions=True
	)
	return {"user": user.name, "full_name": user.full_name, "branch": branch, "pos_profile": pos_profile}


def _only(doctype, filters, message):
	names = frappe.get_all(doctype, filters=filters, pluck="name", limit=2)
	if len(names) != 1:
		frappe.throw(message)
	return names[0]


def _create_user(full_name):
	domain = pin_rules.get_settings().waiter_email_domain or "waiters.invalid"
	slug = re.sub(r"[^a-z0-9]+", ".", full_name.lower()).strip(".") or "waiter"
	email, counter = f"{slug}@{domain}", 1
	while frappe.db.exists("User", email):
		counter += 1
		email = f"{slug}{counter}@{domain}"

	first, _sep, last = full_name.partition(" ")
	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": first,
			"last_name": last.strip() or None,
			"enabled": 1,
			# No welcome mail and no password: the only way in is a station PIN.
			"send_welcome_email": 0,
			"roles": [{"role": eligibility.ORDER_ROLE}],
		}
	)
	user.insert(ignore_permissions=True)
	return user


def _append_once(doctype, name, table_field, user):
	"""Add the user as the LAST row. Existing rows keep their order, so the
	first POS Profile row (the cashier) is untouched."""
	doc = frappe.get_doc(doctype, name)
	if any(row.user == user for row in doc.get(table_field)):
		return
	doc.append(table_field, {"user": user})
	doc.flags.ignore_permissions = True
	doc.save()

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


# Frappe roles managed by URY that we sync onto users
URY_MANAGED_FRAPPE_ROLES = {
	"URY Admin", "URY Ops Admin", "URY Manager",
	"URY Purchase Manager", "URY Sales Manager",
	"URY Accountant", "URY Analyst", "URY Director",
	"URY Cashier", "URY Captain", "URY Servicer", "URY Chef",
	"URY Store Manager", "URY Store Admin", "URY Store Accountant",
}


class URYUserRole(Document):
	def before_insert(self):
		self.invited_on = now_datetime()
		self.invited_by = frappe.session.user

	def after_insert(self):
		self._sync_frappe_role()

	def on_update(self):
		self._sync_frappe_role()
		_bust_cache(self.user)

	def on_trash(self):
		self._remove_all_ury_frappe_roles()
		_bust_cache(self.user)

	def _sync_frappe_role(self):
		"""Add/remove Frappe roles to match the URY role assignment."""
		target_frappe_role = frappe.db.get_value(
			"URY Role", self.ury_role, "frappe_role"
		)
		if not target_frappe_role:
			return

		user_doc = frappe.get_doc("User", self.user)
		current_roles = {r.role for r in user_doc.roles}

		if self.enabled:
			# Add target role
			if target_frappe_role not in current_roles:
				user_doc.append("roles", {"role": target_frappe_role})

			# Remove other URY-managed roles (handles role switching)
			for r in list(user_doc.roles):
				if (
					r.role in URY_MANAGED_FRAPPE_ROLES
					and r.role != target_frappe_role
					and r.role != "System Manager"
				):
					user_doc.roles.remove(r)
		else:
			# Disabled: strip all URY-managed roles except System Manager
			for r in list(user_doc.roles):
				if r.role in URY_MANAGED_FRAPPE_ROLES and r.role != "System Manager":
					user_doc.roles.remove(r)

		user_doc.flags.ignore_permissions = True
		user_doc.save()

	def _remove_all_ury_frappe_roles(self):
		"""Remove all URY-managed Frappe roles from the user."""
		try:
			user_doc = frappe.get_doc("User", self.user)
			for r in list(user_doc.roles):
				if r.role in URY_MANAGED_FRAPPE_ROLES and r.role != "System Manager":
					user_doc.roles.remove(r)
			user_doc.flags.ignore_permissions = True
			user_doc.save()
		except Exception:
			frappe.log_error("URY: Failed to remove Frappe roles on URY User Role delete")


def _bust_cache(user):
	frappe.cache().delete_value(f"ury_caps_{user}")
	frappe.cache().delete_value(f"ury_role_{user}")

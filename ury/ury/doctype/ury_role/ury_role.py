# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class URYRole(Document):
	def validate(self):
		"""Reject unknown capabilities not in CAPABILITIES catalog."""
		from ury.ury.permissions import CAPABILITIES
		for row in self.permissions:
			if row.capability not in CAPABILITIES:
				frappe.throw(
					_("Unknown capability: {0}").format(row.capability),
					title=_("Invalid Capability")
				)

	def on_trash(self):
		"""Block deletion of system roles."""
		if self.is_system_role:
			frappe.throw(
				_("Cannot delete system role: {0}").format(self.role_name),
				title=_("Not Allowed")
			)

	def on_update(self):
		"""Bust capability cache for all users with this role."""
		users = frappe.get_all(
			"URY User Role",
			filters={"ury_role": self.role_name, "enabled": 1},
			pluck="user"
		)
		for user in users:
			_bust_cache(user)


def _bust_cache(user):
	frappe.cache().delete_value(f"ury_caps_{user}")
	frappe.cache().delete_value(f"ury_role_{user}")

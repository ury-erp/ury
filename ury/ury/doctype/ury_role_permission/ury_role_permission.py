# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class URYRolePermission(Document):
	def before_save(self):
		"""Auto-populate label from capability catalog."""
		from ury.ury.permissions import CAPABILITIES
		if self.capability and self.capability in CAPABILITIES:
			self.label = CAPABILITIES[self.capability]

import frappe
from frappe.model.document import Document

from ury.ury.api import chairman_wa_identity as ident


class ChairmanWhatsAppLink(Document):
	def validate(self):
		self.wa_number = ident.normalize_wa_number(self.wa_number)
		if not self.wa_number:
			frappe.throw("Invalid WhatsApp number. Use international format, 8-15 digits.")
		ident.assert_user_allowed(self.user)
		if self.status == "Active" and not self.consented_at:
			frappe.throw("An Active link requires recorded consent (consented_at).")
		if self.status == "Revoked" and not self.revoked_on:
			self.revoked_on = frappe.utils.now_datetime()
		if not self.is_new() and self.has_value_changed("wa_number") and self.status == "Active":
			# number change invalidates the verification
			self.status = "Revoked"
			self.revoked_on = frappe.utils.now_datetime()
			self.revoked_reason = "Number changed"

import frappe
from frappe import _
from frappe.model.document import Document

from ury.ury import roles
from ury.ury.station import pin as pin_rules


class URYManagerPIN(Document):
	def validate(self):
		new_pin = self.new_pin
		# Clear it before anything is written, so the PIN itself never
		# reaches the database, the password store or the version log.
		self.new_pin = None

		if not roles.is_manager(user=self.user):
			frappe.throw(_("Only a manager or admin can have an approval PIN."))
		if self.user != frappe.session.user and not roles.is_admin():
			# Otherwise one manager could set another's PIN and approve in their name.
			frappe.throw(_("You can only set your own approval PIN."), frappe.PermissionError)

		if new_pin:
			pin_rules.validate_format(new_pin)
			pin_rules.ensure_unique(
				new_pin, exclude=self.name if not self.is_new() else None, doctype=pin_rules.MANAGER_PINS
			)
			self.pin_hash = pin_rules.hash_pin(new_pin)
		elif not self.pin_hash:
			frappe.throw(_("Set an approval PIN."))

		if self.enabled and self.has_value_changed("enabled") and not new_pin and not self.is_new():
			frappe.throw(_("Set a new PIN when enabling an approval PIN again."))

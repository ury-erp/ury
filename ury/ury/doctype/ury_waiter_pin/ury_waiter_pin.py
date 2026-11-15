import frappe
from frappe import _
from frappe.model.document import Document

from ury.ury.station import pin as pin_rules


class URYWaiterPIN(Document):
	def validate(self):
		new_pin = self.new_pin
		# Clear it before anything is written, so the PIN itself never
		# reaches the database, the password store or the version log.
		self.new_pin = None

		if new_pin:
			pin_rules.validate_format(new_pin)
			pin_rules.ensure_unique(new_pin, exclude=self.name if not self.is_new() else None)
			self.pin_hash = pin_rules.hash_pin(new_pin)
		elif not self.pin_hash:
			frappe.throw(_("Set a PIN for this waiter."))

		if self.enabled and self.has_value_changed("enabled") and not new_pin and not self.is_new():
			# Re-enabling: the old PIN may have been given to someone else meanwhile.
			frappe.throw(_("Set a new PIN when enabling a waiter again."))

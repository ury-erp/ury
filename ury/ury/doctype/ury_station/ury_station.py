import hashlib
import secrets

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, now_datetime

ACTIVATION_MINUTES = 10


class URYStation(Document):
	def validate(self):
		self.code = (self.code or "").strip().upper()
		if not self.code.isalnum():
			frappe.throw(_("A station code may only contain letters and digits."))

	@frappe.whitelist()
	def new_activation_code(self):
		"""One-time code a manager types on the screen to bind it to this station."""
		self.check_permission("write")
		code = f"{secrets.randbelow(10**6):06d}"
		self.db_set(
			{
				"activation_code_hash": hashlib.sha256(f"{self.name}:{code}".encode()).hexdigest(),
				"activation_expires": add_to_date(now_datetime(), minutes=ACTIVATION_MINUTES),
			},
			update_modified=False,
		)
		return {"code": code, "minutes": ACTIVATION_MINUTES}

	@frappe.whitelist()
	def deactivate_screen(self):
		self.check_permission("write")
		self.db_set({"device_token_hash": None, "device_activated_on": None}, update_modified=False)

	@frappe.whitelist()
	def unlock(self):
		self.check_permission("write")
		from ury.ury.station import lockout

		lockout.clear(self.name)

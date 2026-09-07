# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, now
from frappe.utils.password import check_password, delete_all_passwords_for, update_password


PIN_AUTH_FIELD = "pos_pin"
PIN_MIN_LENGTH = 4
PIN_MAX_LENGTH = 6
POS_ROLES = {"URY Cashier", "URY Captain", "URY Manager"}


def has_pos_pin(settings_name: str) -> bool:
	"""Return whether a non-reversible PIN hash exists for this settings row."""
	return bool(
		frappe.db.sql(
			"""
			SELECT 1
			FROM `__Auth`
			WHERE doctype = %s AND name = %s AND fieldname = %s AND encrypted = 0
			LIMIT 1
			""",
			("URY POS PIN Settings", settings_name, PIN_AUTH_FIELD),
		)
	)


def validate_pin_format(pin: str) -> str:
	pin = str(pin or "").strip()
	if not pin.isdigit() or not PIN_MIN_LENGTH <= len(pin) <= PIN_MAX_LENGTH:
		frappe.throw(_("POS PIN must contain 4 to 6 digits."))
	return pin


def is_eligible_pos_user(user: str) -> bool:
	"""PIN login is deliberately limited to active, branch-assigned URY staff."""
	if not user or user in {"Administrator", "Guest"}:
		return False

	user_info = frappe.db.get_value(
		"User", user, ["enabled", "user_type"], as_dict=True
	)
	if not user_info or not cint(user_info.enabled) or user_info.user_type != "System User":
		return False

	if POS_ROLES.isdisjoint(frappe.get_roles(user)):
		return False

	return bool(frappe.db.exists("URY User", {"user": user}))


def _pin_matches(settings_name: str, pin: str) -> bool:
	try:
		check_password(
			settings_name,
			pin,
			doctype="URY POS PIN Settings",
			fieldname=PIN_AUTH_FIELD,
			delete_tracker_cache=False,
		)
		return True
	except frappe.AuthenticationError:
		return False


def _ensure_pin_is_unique(pin: str, current_name: str) -> None:
	for row in frappe.get_all("URY POS PIN Settings", fields=["name"]):
		if row.name != current_name and _pin_matches(row.name, pin):
			frappe.throw(
				_("This PIN is already assigned to another POS account. Choose a different PIN.")
			)


class URYPOSPINSettings(Document):
	def validate(self):
		pin = str(self.get("new_pin") or "").strip()
		# Frappe can send a masked Password field back unchanged. A PIN itself can
		# never contain asterisks, so this is safe to treat as "no new value".
		if pin and set(pin) == {"*"}:
			pin = ""

		if cint(self.enabled) and not is_eligible_pos_user(self.user):
			frappe.throw(
				_(
					"PIN login can only be enabled for an active System User with a URY POS role and a Branch assignment."
				)
			)

		if pin:
			pin = validate_pin_format(pin)
			_ensure_pin_is_unique(pin, self.name or self.user)
			self.flags.new_pos_pin = pin

		# Never let the submitted PIN reach the document table or Frappe's
		# reversible Password-field storage. on_update() writes only a strong hash.
		self.new_pin = None

		settings_name = self.name or self.user
		if cint(self.enabled) and not pin and not has_pos_pin(settings_name):
			frappe.throw(_("Set a PIN before enabling PIN login for this account."))

	def after_insert(self):
		self._save_pin_hash()

	def on_update(self):
		self._save_pin_hash()

	def on_trash(self):
		delete_all_passwords_for(self.doctype, self.name)

	def _save_pin_hash(self):
		pin = getattr(self.flags, "new_pos_pin", None)
		if not pin:
			return

		update_password(
			user=self.name,
			pwd=pin,
			doctype=self.doctype,
			fieldname=PIN_AUTH_FIELD,
		)
		changed_at = now()
		frappe.db.set_value(
			self.doctype,
			self.name,
			"last_pin_change",
			changed_at,
			update_modified=False,
		)
		self.last_pin_change = changed_at
		self.flags.new_pos_pin = None

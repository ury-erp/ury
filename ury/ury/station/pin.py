"""PIN hashing, format rules and lookup.

A PIN is never stored, logged or returned. Only a salted hash is kept, so
finding the waiter for a typed PIN means checking it against every hash.
"""

import frappe
from frappe import _
from frappe.utils import cint
from frappe.utils.password import passlibctx


def get_settings():
	"""Station settings, with field defaults filled in for values never saved.

	A single doctype has no stored values until someone saves it, and the
	safe defaults (activated screens only, lockout) must apply before that.
	"""
	settings = frappe.get_cached_doc("URY Station Settings")
	# Ask the database what was stored: an unsaved checkbox reads as 0,
	# which would silently switch a protection off.
	stored = frappe.db.get_singles_dict("URY Station Settings")
	for field in settings.meta.fields:
		if field.default is not None and field.fieldname not in stored:
			settings.set(field.fieldname, field.default)
	return settings


def pin_length_range() -> tuple[int, int]:
	settings = get_settings()
	low = max(cint(settings.min_pin_length) or 4, 4)
	high = max(cint(settings.max_pin_length) or 6, low)
	return low, high


def is_well_formed(pin) -> bool:
	low, high = pin_length_range()
	return isinstance(pin, str) and pin.isdigit() and low <= len(pin) <= high


def validate_format(pin):
	if not is_well_formed(pin):
		low, high = pin_length_range()
		frappe.throw(_("A PIN must be {0} to {1} digits.").format(low, high))


def hash_pin(pin: str) -> str:
	return passlibctx.hash(pin)


WAITER_PINS = "URY Waiter PIN"
MANAGER_PINS = "URY Manager PIN"
PIN_DOCTYPES = (WAITER_PINS, MANAGER_PINS)


def find_users(pin: str, exclude: str | None = None, doctype: str = WAITER_PINS) -> list[str]:
	"""Users whose enabled PIN of this kind matches. Every hash is checked,
	with no early exit, so the time taken does not reveal who matched."""
	matches = []
	rows = frappe.get_all(doctype, filters={"enabled": 1}, fields=["name", "user", "pin_hash"], order_by="creation")
	for row in rows:
		if row.name == exclude or not row.pin_hash:
			continue
		if passlibctx.verify(pin, row.pin_hash):
			matches.append(row.user)
	return matches


def ensure_unique(pin: str, exclude: str | None = None, doctype: str = WAITER_PINS):
	"""No enabled PIN of either kind may equal another: a waiter's sign-in PIN
	must never double as a manager's approval PIN, or the other way round."""
	clashes = [
		user
		for kind in PIN_DOCTYPES
		for user in find_users(pin, exclude=exclude if kind == doctype else None, doctype=kind)
	]
	if clashes:
		# Deliberately does not say whose PIN it clashes with.
		frappe.throw(_("This PIN is already in use. Choose a different one."), title=_("PIN Not Available"))

"""Secure, optional personal-PIN login for the shared URY POS terminal."""

import frappe
from frappe import _
from frappe.auth import LoginManager
from frappe.core.doctype.activity_log.activity_log import add_authentication_log
from frappe.rate_limiter import rate_limit
from frappe.utils.password import check_password

from ury.ury.doctype.ury_pos_pin_settings.ury_pos_pin_settings import (
	PIN_AUTH_FIELD,
	PIN_MAX_LENGTH,
	PIN_MIN_LENGTH,
	is_eligible_pos_user,
)


PIN_SETTINGS_DOCTYPE = "URY POS PIN Settings"
GENERIC_PIN_ERROR = "Invalid PIN or PIN login is not available."


def _eligible_settings():
	rows = frappe.get_all(
		PIN_SETTINGS_DOCTYPE,
		filters={"enabled": 1},
		fields=["name", "user"],
		order_by="modified desc",
	)
	return [row for row in rows if is_eligible_pos_user(row.user)]


def _find_user_for_pin(pin: str):
	for row in _eligible_settings():
		try:
			check_password(
				row.name,
				pin,
				doctype=PIN_SETTINGS_DOCTYPE,
				fieldname=PIN_AUTH_FIELD,
				delete_tracker_cache=False,
			)
			return row.user
		except frappe.AuthenticationError:
			continue
	return None


def _record_login(subject: str, user: str, status: str) -> None:
	add_authentication_log(subject, user, operation="Login", status=status)


def _reject_pin_login():
	# Match Frappe's normal failed-login behavior: preserve the audit record even
	# though the request ends with an AuthenticationError and is rolled back.
	_record_login("URY POS PIN login failed", "Guest", "Failed")
	frappe.db.commit()  # nosemgrep
	frappe.flags.disable_traceback = True
	frappe.throw(_(GENERIC_PIN_ERROR), frappe.AuthenticationError)


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_pin_login_status():
	"""Expose no account list: only whether the PIN keypad should be offered."""
	return {
		"enabled": bool(_eligible_settings()),
		"authenticated": frappe.session.user != "Guest",
		"min_length": PIN_MIN_LENGTH,
		"max_length": PIN_MAX_LENGTH,
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=60, methods=["POST"], ip_based=True)
def login_with_pin(pin: str):
	"""Create a real Frappe user session after verifying a personal POS PIN."""
	# Switching an authenticated browser in place can leave the previous session
	# alive. The POS lock action logs out first, so accept PINs only from Guest.
	if frappe.session.user != "Guest":
		frappe.throw(_("Log out before switching POS users."), frappe.PermissionError)

	pin = str(pin or "").strip()
	if not pin.isdigit() or not PIN_MIN_LENGTH <= len(pin) <= PIN_MAX_LENGTH:
		_reject_pin_login()

	user = _find_user_for_pin(pin)
	if not user:
		_reject_pin_login()

	# Re-check eligibility immediately before creating the session so disabling a
	# user, role, Branch assignment, or PIN setting takes effect without delay.
	if not is_eligible_pos_user(user):
		_reject_pin_login()

	login_manager = getattr(frappe.local, "login_manager", None) or LoginManager()
	login_manager.login_as(user)
	_record_login("Logged in to URY POS with personal PIN", user, "Success")

	return {
		"user": user,
		"full_name": frappe.utils.get_fullname(user),
		"redirect_to": "/pos",
	}

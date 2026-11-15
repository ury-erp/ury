"""Guest-facing endpoints for the /station page."""

import hashlib
import hmac

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, get_datetime, now_datetime

from ury.ury.station import eligibility, lockout, pin as pin_rules
from ury.ury.station.session import SESSION_KEY, landing_page


def _digest(value: str) -> str:
	return hashlib.sha256(value.encode()).hexdigest()


def _same(a: str | None, b: str | None) -> bool:
	return bool(a) and bool(b) and hmac.compare_digest(a, b)


def _log(station, result, user=None, detail=None):
	frappe.get_doc(
		{
			"doctype": "URY Station Sign-in Log",
			"station": (station or "")[:140],
			"user": user,
			"result": result,
			"detail": detail,
			"time": now_datetime(),
			"ip_address": frappe.local.request_ip,
		}
	).insert(ignore_permissions=True)


def _fail(message, **extra):
	return {"ok": False, "message": message, **extra}


def _get_station(code):
	"""The enabled station for a typed code, or None."""
	code = (code or "").strip().upper()
	if not code or len(code) > 20:
		return None
	station = frappe.db.get_value(
		"URY Station",
		{"code": code, "enabled": 1},
		["name", "device_token_hash", "activation_code_hash", "activation_expires"],
		as_dict=True,
	)
	return station


def _locked_message(seconds):
	minutes = -(-seconds // 60)
	return _("Too many wrong tries. This station is locked for {0} more minute(s).").format(minutes)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=60)
def sign_in(station=None, pin=None, device_token=None):
	"""Start a normal session as the waiter whose PIN was typed."""
	station_doc = _get_station(station)
	if not station_doc:
		_log(station, "Unknown Station")
		return _fail(_("This station code is not recognised."), reset_station=True)
	station = station_doc.name

	seconds = lockout.seconds_locked(station)
	if seconds:
		_log(station, "Locked")
		return _fail(_locked_message(seconds), locked_for=seconds)

	settings = pin_rules.get_settings()
	if cint(settings.require_device_activation) and not _same(
		station_doc.device_token_hash, _digest(device_token or "")
	):
		_log(station, "Device Not Activated")
		return _fail(_("This screen is not activated for {0}. Ask a manager.").format(station), reset_station=True)

	pin = pin if isinstance(pin, str) else ""
	users = pin_rules.find_users(pin) if pin_rules.is_well_formed(pin) else []
	if len(users) != 1:
		attempts_left = lockout.record_failure(station)
		_log(station, "Wrong PIN")
		if not attempts_left:
			seconds = lockout.seconds_locked(station)
			return _fail(_locked_message(seconds), locked_for=seconds)
		return _fail(_("Wrong PIN. {0} tries left.").format(attempts_left))
	user = users[0]

	problem = eligibility.problem_for(user)
	if problem:
		_log(station, "Not Eligible", user=user, detail=problem)
		return _fail(problem)

	frappe.local.login_manager.login_as(user)
	# A screen often still carries the previous waiter's dead session cookie.
	# Frappe answers that by queueing "delete the session cookies", which
	# would also wipe the session just started here.
	frappe.local.cookie_manager.to_delete = []
	frappe.local.response.pop("session_expired", None)
	# Marks the session so /pos gets the Done button and idle sign-out.
	frappe.local.session_obj.data.data[SESSION_KEY] = station
	frappe.local.session_obj.update(force=True)

	lockout.clear(station)
	frappe.db.set_value("URY Waiter PIN", {"user": user}, "last_used", now_datetime(), update_modified=False)
	_log(station, "Success", user=user)

	return {
		"ok": True,
		"redirect": landing_page(),
		"full_name": frappe.db.get_value("User", user, "full_name"),
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60)
def activate(station=None, activation_code=None):
	"""Bind this screen to a station using a manager's one-time code."""
	station_doc = _get_station(station)
	if not station_doc:
		_log(station, "Unknown Station")
		return _fail(_("This station code is not recognised."))
	station = station_doc.name

	seconds = lockout.seconds_locked(station)
	if seconds:
		return _fail(_locked_message(seconds), locked_for=seconds)

	settings = pin_rules.get_settings()
	if not cint(settings.require_device_activation):
		return {"ok": True, "station": station, "device_token": ""}

	expired = not station_doc.activation_expires or get_datetime(station_doc.activation_expires) < now_datetime()
	code = activation_code if isinstance(activation_code, str) else ""
	if expired or not _same(station_doc.activation_code_hash, _digest(f"{station}:{code.strip()}")):
		lockout.record_failure(station)
		_log(station, "Device Not Activated", detail="Wrong or expired activation code")
		return _fail(_("That activation code is wrong or has expired. Ask a manager for a new one."))

	token = frappe.generate_hash(length=48)
	frappe.db.set_value(
		"URY Station",
		station,
		{
			"device_token_hash": _digest(token),
			"device_activated_on": now_datetime(),
			"activation_code_hash": None,
			"activation_expires": None,
		},
		update_modified=False,
	)
	lockout.clear(station)
	return {"ok": True, "station": station, "device_token": token}

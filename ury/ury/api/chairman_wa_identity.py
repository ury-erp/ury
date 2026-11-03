"""WhatsApp identity for the Chairman Brief channel (WP1).

Pure helpers (no frappe import at module load) are unit-testable with
`python3 -m unittest`. DB-bound functions import frappe lazily.
"""

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta

LINK_DOCTYPE = "Chairman WhatsApp Link"
CHAIRMAN_ROLE = "URY Owner"
FORBIDDEN_USERS = ("Administrator", "Guest")
OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_DIGITS = 6
CONSENT_TEXT_VERSION = "v1"


# ---------------------------------------------------------------- pure helpers
def normalize_wa_number(raw):
	"""Return E.164 digits only (no '+'), 8-15 digits, else None."""
	if raw is None:
		return None
	digits = re.sub(r"\D", "", str(raw))
	if digits.startswith("00"):
		digits = digits[2:]
	if not (8 <= len(digits) <= 15) or digits.startswith("0"):
		return None
	return digits


def validate_user_facts(user, enabled, roles):
	"""Return list of error strings ([] means allowed). Pure."""
	errors = []
	if not user or user in FORBIDDEN_USERS:
		errors.append("User must not be Administrator or Guest")
	if not enabled:
		errors.append("User is disabled")
	if CHAIRMAN_ROLE not in (roles or ()):
		errors.append(f"User must hold the {CHAIRMAN_ROLE} role")
	return errors


def generate_otp():
	return "".join(secrets.choice("0123456789") for _ in range(OTP_DIGITS))


def hash_otp(link_name, otp, secret=""):
	"""HMAC-SHA256 keyed by secret, bound to the link; only this is stored."""
	key = (secret or "").encode()
	return hmac.new(key, f"{link_name}:{otp}".encode(), hashlib.sha256).hexdigest()


def check_otp(state, link_name, candidate, now, secret=""):
	"""Pure OTP check. state: dict(otp_hash, otp_expires, otp_attempts).

	Returns (ok, reason, new_state). reason in ok|no_otp|expired|locked|mismatch.
	A wrong guess consumes an attempt; success or expiry/lock clears the hash.
	"""
	st = dict(state or {})
	attempts = int(st.get("otp_attempts") or 0)
	if not st.get("otp_hash"):
		return False, "no_otp", st
	if st.get("otp_expires") and now > st["otp_expires"]:
		return False, "expired", {"otp_hash": None, "otp_expires": None, "otp_attempts": 0}
	if attempts >= OTP_MAX_ATTEMPTS:
		return False, "locked", {"otp_hash": None, "otp_expires": None, "otp_attempts": 0}
	cand = re.sub(r"\D", "", str(candidate or ""))
	if hmac.compare_digest(hash_otp(link_name, cand, secret), st["otp_hash"]):
		return True, "ok", {"otp_hash": None, "otp_expires": None, "otp_attempts": 0}
	attempts += 1
	st["otp_attempts"] = attempts
	if attempts >= OTP_MAX_ATTEMPTS:
		return False, "locked", {"otp_hash": None, "otp_expires": None, "otp_attempts": 0}
	return False, "mismatch", st


def new_otp_state(link_name, otp, now, secret=""):
	return {
		"otp_hash": hash_otp(link_name, otp, secret),
		"otp_expires": now + timedelta(minutes=OTP_TTL_MINUTES),
		"otp_attempts": 0,
	}


# ------------------------------------------------------------ frappe-bound
def _secret():
	import frappe

	return frappe.local.conf.get("encryption_key") or frappe.local.conf.get("secret_key") or ""


def user_facts(user):
	import frappe

	if not user or not frappe.db.exists("User", user):
		return None, []
	enabled = frappe.db.get_value("User", user, "enabled")
	roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
	return enabled, roles


def assert_user_allowed(user):
	import frappe

	enabled, roles = user_facts(user)
	errors = validate_user_facts(user, enabled, roles)
	if errors:
		frappe.throw("; ".join(errors), frappe.ValidationError)


def resolve(wa_number):
	"""Return the user for an Active link on this number, else None."""
	import frappe

	num = normalize_wa_number(wa_number)
	if not num:
		return None
	user = frappe.db.get_value(LINK_DOCTYPE, {"wa_number": num, "status": "Active"}, "user")
	if not user:
		return None
	enabled, roles = user_facts(user)
	if validate_user_facts(user, enabled, roles):
		return None
	return user


def issue_otp(link_name):
	"""Create an OTP for a Pending link. Returns the plaintext OTP (to show in the PWA)."""
	import frappe
	from frappe.utils import now_datetime

	status = frappe.db.get_value(LINK_DOCTYPE, link_name, "status")
	if status != "Pending":
		frappe.throw("OTP can only be issued for a Pending link")
	otp = generate_otp()
	state = new_otp_state(link_name, otp, now_datetime(), _secret())
	frappe.db.set_value(LINK_DOCTYPE, link_name, state, update_modified=False)
	return otp


def verify_otp(link_name, candidate, consent_text_version=CONSENT_TEXT_VERSION):
	"""Verify; on success set Active and record consent. Returns {ok, reason}."""
	import frappe
	from frappe.utils import now_datetime

	row = frappe.db.get_value(
		LINK_DOCTYPE, link_name, ["status", "otp_hash", "otp_expires", "otp_attempts", "user"], as_dict=True
	)
	if not row or row.status != "Pending":
		return {"ok": False, "reason": "not_pending"}
	now = now_datetime()
	ok, reason, new_state = check_otp(row, link_name, candidate, now, _secret())
	if ok:
		enabled, roles = user_facts(row.user)
		if validate_user_facts(row.user, enabled, roles):
			return {"ok": False, "reason": "user_not_allowed"}
		new_state.update(
			{"status": "Active", "verified_on": now, "consented_at": now, "consent_text_version": consent_text_version}
		)
	frappe.db.set_value(LINK_DOCTYPE, link_name, new_state, update_modified=False)
	return {"ok": ok, "reason": reason}


def revoke_link(link_name, reason):
	import frappe
	from frappe.utils import now_datetime

	frappe.db.set_value(
		LINK_DOCTYPE,
		link_name,
		{"status": "Revoked", "revoked_on": now_datetime(), "revoked_reason": reason,
		 "otp_hash": None, "otp_expires": None, "otp_attempts": 0},
	)


def revoke_for_user(user, reason):
	import frappe

	names = frappe.get_all(LINK_DOCTYPE, filters={"user": user, "status": ["!=", "Revoked"]}, pluck="name")
	for n in names:
		revoke_link(n, reason)
	return len(names)


def revoke_for_number(wa_number, reason="STOP"):
	import frappe

	num = normalize_wa_number(wa_number)
	names = frappe.get_all(LINK_DOCTYPE, filters={"wa_number": num, "status": ["!=", "Revoked"]}, pluck="name") if num else []
	for n in names:
		revoke_link(n, reason)
	return len(names)


def on_user_update(doc, method=None):
	"""doc_events hook for User on_update: revoke if disabled or chairman role lost."""
	if doc.name in FORBIDDEN_USERS:
		return
	if not doc.enabled:
		revoke_for_user(doc.name, "User disabled")
	elif CHAIRMAN_ROLE not in [r.role for r in doc.get("roles") or []]:
		revoke_for_user(doc.name, "Owner role removed")


def on_user_trash(doc, method=None):
	revoke_for_user(doc.name, "User deleted")

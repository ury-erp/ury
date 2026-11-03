"""WhatsApp onboarding for the signed-in chairman (WP6).

The one-time code is returned ONLY by start_link() to the authenticated PWA session
and is never stored in plaintext (see chairman_wa_identity.issue_otp). status() never
returns it. The user then sends `LINK <code>` from that number; WP4 verifies it.
"""

import re

from ury.ury.api import chairman_wa_identity as ident

ENABLED_KEY = "ury_whatsapp_enabled"
BUSINESS_NUMBER_KEY = "ury_whatsapp_business_number"
CONSENT_TEXT = (
	"I agree that URY may send my daily brief summaries and answers to this WhatsApp number. "
	"Only figures my account can already see are shared. I can send STOP or unlink here at any time."
)
START_RATE_LIMIT = 5  # per minute per user


# ---------------------------------------------------------------- pure helpers
def mask_number(num):
	d = re.sub(r"\D", "", str(num or ""))
	return f"+{d[:2]} •••• {d[-4:]}" if len(d) >= 8 else ""


def link_command(otp):
	return f"LINK {otp}"


def status_payload(row, business_number, enabled):
	"""row: dict(status, wa_number, verified_on) of the user's latest non-revoked link, or None."""
	st = (row or {}).get("status")
	return {
		"enabled": bool(enabled),
		"state": st if st in ("Pending", "Active") else "None",
		"number_masked": mask_number((row or {}).get("wa_number")) if st in ("Pending", "Active") else "",
		"verified_on": str((row or {}).get("verified_on") or "") if st == "Active" else "",
		"business_number": business_number or "",
		"consent_text": CONSENT_TEXT,
		"consent_text_version": ident.CONSENT_TEXT_VERSION,
	}


# ------------------------------------------------------------ frappe-bound
def _conf():
	import frappe

	return (
		bool(frappe.conf.get(ENABLED_KEY)),
		str(frappe.conf.get(BUSINESS_NUMBER_KEY) or ""),
	)


def _require_chairman():
	import frappe

	from ury.ury.api.chairman import _check_role

	_check_role()
	if frappe.session.user in ident.FORBIDDEN_USERS:
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
	if not _conf()[0]:
		frappe.throw(frappe._("WhatsApp is not enabled"), frappe.PermissionError)


def _latest_link(user):
	import frappe

	rows = frappe.get_all(
		ident.LINK_DOCTYPE,
		filters={"user": user, "status": ["!=", "Revoked"]},
		fields=["name", "status", "wa_number", "verified_on"],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows else None


def status():
	import frappe

	enabled, biz = _conf()
	if not enabled:
		return status_payload(None, "", False)
	from ury.ury.api.chairman import _check_role

	_check_role()
	return status_payload(_latest_link(frappe.session.user), biz, True)


def start_link(number=None):
	"""Create a Pending link for session.user and return the one-time code once."""
	import frappe

	from ury.ury.api.chairman_chat import rate_check

	_require_chairman()
	user = frappe.session.user
	rate_check("wa_link_start", START_RATE_LIMIT, user=user)
	num = ident.normalize_wa_number(number)
	if not num:
		frappe.throw(frappe._("Enter your number with country code, for example 971501234567."), frappe.ValidationError)
	clash = frappe.db.exists(
		ident.LINK_DOCTYPE, {"wa_number": num, "status": ["!=", "Revoked"], "user": ["!=", user]}
	)
	if clash:
		frappe.throw(frappe._("This number cannot be used."), frappe.ValidationError)
	ident.revoke_for_user(user, "Replaced by new link")
	doc = frappe.get_doc(
		{"doctype": ident.LINK_DOCTYPE, "user": user, "wa_number": num, "status": "Pending"}
	)
	doc.insert(ignore_permissions=True)  # system-managed doctype; the chairman has no desk rights
	otp = ident.issue_otp(doc.name)
	frappe.db.commit()
	enabled, biz = _conf()
	return {
		"code": otp,
		"command": link_command(otp),
		"expires_minutes": ident.OTP_TTL_MINUTES,
		"business_number": biz,
		"number_masked": mask_number(num),
		"consent_text_version": ident.CONSENT_TEXT_VERSION,
	}


def unlink():
	import frappe

	from ury.ury.api.chairman import _check_role

	_check_role()
	n = ident.revoke_for_user(frappe.session.user, "Unlinked by user")
	frappe.db.commit()
	return {"unlinked": n}


try:
	import frappe as _frappe

	status = _frappe.whitelist(methods=["GET", "POST"])(status)
	start_link = _frappe.whitelist(methods=["POST"])(start_link)
	unlink = _frappe.whitelist(methods=["POST"])(unlink)
except ImportError:
	pass

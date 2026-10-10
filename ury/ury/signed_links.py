# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Links that prove what they are for.
#
# Several things in this app are opened by someone who is not signed in and
# never will be: a guest rating a meal from a receipt, a driver reporting
# where they are. The link they arrive with is the only credential in play,
# so it is signed with the site's own key and carries a scope and a reference
# and nothing else. A leaked link reveals nothing about the thing it points
# at, and a link edited to name something else stops verifying.
#
# One implementation, because two would eventually disagree about what counts
# as a valid signature — and the one that is wrong would be the one still
# accepting links it should not.

import base64
import hashlib
import hmac

import frappe
from frappe import _
from frappe.utils import get_url
from frappe.utils.password import get_encryption_key

# 128 bits of signature, hex-encoded. Enough that nobody guesses another
# branch's link, short enough that a QR printed from it stays coarse enough to
# scan off a scuffed table card.
SIGNATURE_LENGTH = 32


def sign(payload):
	return hmac.new(
		get_encryption_key().encode(), payload.encode(), hashlib.sha256
	).hexdigest()[:SIGNATURE_LENGTH]


def make_token(scope, reference):
	"""An opaque link body for one scope and one reference."""
	payload = f"{scope}|{reference}"
	raw = f"{payload}|{sign(payload)}"
	return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def read_token(token, allowed_scopes, invalid_message=None):
	"""Scope and reference from a link, or a refusal.

	Nothing in the token is trusted before the signature is checked: the whole
	reason it is signed is that the string arrives from a stranger's phone.
	`allowed_scopes` is required rather than optional so a new kind of link
	can never be honoured by an endpoint that was written before it existed.
	"""
	message = invalid_message or _("This link is not valid.")

	try:
		text = str(token or "")
		padded = text + "=" * (-len(text) % 4)
		raw = base64.urlsafe_b64decode(padded.encode()).decode()
		scope, reference, signature = raw.split("|")
	except Exception:
		frappe.throw(message, frappe.PermissionError)

	if not hmac.compare_digest(sign(f"{scope}|{reference}"), signature):
		frappe.throw(message, frappe.PermissionError)
	if scope not in allowed_scopes:
		frappe.throw(message, frappe.PermissionError)

	return scope, reference


def signed_url(path, scope, reference):
	return get_url(f"{path}?t={make_token(scope, reference)}")

import hashlib

import frappe
import frappe.sessions

no_cache = 1
sitemap = 0


BRIEF_URL = "/ury/brief/"


def canonical_redirect(path, query_string=""):
	"""Target for a slash-less /ury/brief, else None.

	The service worker scope and manifest are /ury/brief/ (trailing slash). A
	page loaded at /ury/brief sits outside that scope, so the worker never
	controls it and offline reload cannot work. Keep any query (?date=...).
	"""
	if (path or "").rstrip("/") != "/ury/brief" or (path or "").endswith("/"):
		return None
	return BRIEF_URL + (f"?{query_string}" if query_string else "")


def is_go_path(path):
	return (path or "").rstrip("/") == "/ury/brief/go"


def user_key(user, site):
	"""Opaque per-user/site key (never the raw email) for client cache isolation."""
	return hashlib.sha256(f"{user}|{site}".encode()).hexdigest()[:16]


def get_context(context):
	"""Chairman Brief PWA page (/ury/brief/). Guests are sent to login."""
	request = getattr(frappe.local, "request", None)
	if request is not None:
		target = canonical_redirect(request.path, (request.query_string or b"").decode())
		if target:
			frappe.local.flags.redirect_location = target
			raise frappe.Redirect

	if request is not None and is_go_path(request.path):
		# Token landing page: static shell, no user data, never cached, no referrer.
		context.no_cache = 1
		context.brief_user_key = ""
		context.csrf_token = ""
		context.build_version = frappe.utils.get_build_version()
		h = frappe.local.response_headers
		h.set("Cache-Control", "no-store, max-age=0")
		h.set("Referrer-Policy", "no-referrer")
		return context

	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = f"/login?redirect-to={BRIEF_URL}"
		raise frappe.Redirect

	context.no_cache = 1
	context.brief_user_key = user_key(frappe.session.user, frappe.local.site)
	context.csrf_token = frappe.sessions.get_csrf_token()
	context.build_version = frappe.utils.get_build_version()
	return context

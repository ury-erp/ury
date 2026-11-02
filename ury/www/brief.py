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


def get_context(context):
	"""Chairman Brief PWA page (/ury/brief/). Guests are sent to login."""
	request = getattr(frappe.local, "request", None)
	if request is not None:
		target = canonical_redirect(request.path, (request.query_string or b"").decode())
		if target:
			frappe.local.flags.redirect_location = target
			raise frappe.Redirect

	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = f"/login?redirect-to={BRIEF_URL}"
		raise frappe.Redirect

	context.no_cache = 1
	context.csrf_token = frappe.sessions.get_csrf_token()
	context.build_version = frappe.utils.get_build_version()
	return context

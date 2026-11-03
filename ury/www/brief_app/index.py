import hashlib
import os

import frappe
import frappe.sessions

no_cache = 1
sitemap = 0


BRIEF_URL = "/ury/brief/"
_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "public", "brief", "dist", "assets")


def asset_version():
	"""Changes whenever the PWA bundle is rebuilt, so browsers never pair new JS with cached old CSS."""
	try:
		return str(int(max(os.path.getmtime(os.path.join(_DIST, f)) for f in ("app.js", "app.css"))))
	except OSError:
		return frappe.utils.get_build_version()


def is_go_path(path):
	return (path or "").rstrip("/") == "/ury/brief/go"


def user_key(user, site):
	"""Opaque per-user/site key (never the raw email) for client cache isolation."""
	return hashlib.sha256(f"{user}|{site}".encode()).hexdigest()[:16]


def get_context(context):
	"""Page context for URY Brief. Huf's portal renderer serves it at /ury/brief/ and has already redirected
	Guests, checked brief_access and fixed the trailing slash; /ury/brief/go (the WhatsApp token landing page)
	reaches it through a website_route_rule. Any other path (for example Frappe's own /brief_app) is a 404 so
	the shell is never reachable without Huf's access check."""
	request = getattr(frappe.local, "request", None)
	path = (getattr(request, "path", "") or "") if request is not None else ""
	if request is not None and not (path.rstrip("/") == "/ury/brief" or path.startswith("/ury/brief/")):
		raise frappe.PageDoesNotExistError

	if request is not None and is_go_path(path):
		# Token landing page: static shell, no user data, never cached, no referrer.
		context.no_cache = 1
		context.brief_user_key = ""
		context.csrf_token = ""
		context.build_version = asset_version()
		h = frappe.local.response_headers
		h.set("Cache-Control", "no-store, max-age=0")
		h.set("Referrer-Policy", "no-referrer")
		return context

	context.no_cache = 1
	context.brief_user_key = user_key(frappe.session.user, frappe.local.site)
	context.csrf_token = frappe.sessions.get_csrf_token()
	context.build_version = asset_version()
	return context

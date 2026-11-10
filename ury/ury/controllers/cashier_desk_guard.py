"""Desk restrictions for cashier-only users (URY Cashier is their only business role).

Layers, strongest first:

1. `guard_desk_page_load` (`before_request` hook): full page loads of any Desk route outside the
   Daily Operations allow-list are answered with a 302. Frappe serves `/desk/*` without
   consulting `website_path_resolver` (hard-coded in `PathResolver.resolve`), so this has to
   happen in `before_request`; werkzeug's `RequestRedirect` is an HTTPException, which the
   application turns into a real redirect response.
2. `get_desktop_page` (registered through `override_whitelisted_methods`): the workspace
   content API only serves "Daily Operations" to a cashier-only user.
3. `workspace_has_permission` / `workspace_permission_query_conditions` (hooks): other
   Workspace documents cannot be read, listed or edited by a cashier-only user.
4. `shape_bootinfo`: the Desk navigation payload only contains Daily Operations, so the
   sidebar, awesome bar and landing page offer nothing else. UX, not security.

Nothing here applies to anyone who has a role other than URY Cashier. DocPerms are not
touched: a cashier-only user keeps exactly the document permissions POS already needs.
"""

import copy
from urllib.parse import urlparse

import frappe
from frappe import _
from werkzeug.routing import RequestRedirect

from ury.ury.utils.cashier_desk import (
	SHELL_SLUG,
	WORKSPACE_NAME,
	WORKSPACE_ROUTE,
	WORKSPACE_SLUG,
	is_cashier_only,
)

# Frappe sends users who open these to the Desk SPA.
DESK_SEGMENTS = ("desk", "app", "apps")
# Where cashier-only users land when they sign in (unchanged from before the dashboard existed).
POST_LOGIN_HOME = "/pos"
# Doctype shortcuts reachable as /desk/<slug> or /desk/ury/<slug>.
_SHORTCUT_TYPES = ("DocType",)


def _slug(name):
	"""Same as `frappe.router.slug`: lower case, spaces to dashes."""
	return (name or "").strip().lower().replace(" ", "-")


class CashierDeskRedirect(RequestRedirect):
	"""A 302 (RequestRedirect defaults to 308, which browsers cache permanently)."""

	code = 302


def guard_desk_page_load(*args, **kwargs):
	"""before_request hook: send cashier-only users away from Desk pages they may not open."""
	request = getattr(frappe.local, "request", None)
	if request is None or request.method not in ("GET", "HEAD"):
		return
	try:
		target = redirect_target(request.path)
	except Exception:
		frappe.log_error(title="URY cashier desk guard failed")
		return
	if target:
		raise CashierDeskRedirect(target)


def get_allowed_doctypes():
	"""Doctypes linked by the Daily Operations workspace shortcuts (read at runtime)."""
	cached = frappe.local.flags.get("_ury_cashier_allowed_doctypes")
	if cached is None:
		rows = frappe.get_all(
			"Workspace Shortcut",
			filters={"parent": WORKSPACE_NAME, "parenttype": "Workspace", "type": ["in", _SHORTCUT_TYPES]},
			pluck="link_to",
		)
		cached = sorted({r for r in rows if r})
		frappe.local.flags["_ury_cashier_allowed_doctypes"] = cached
	return cached


def _came_from_login():
	"""True when the request was made from the login page (the first Desk load after signing in)."""
	request = getattr(frappe.local, "request", None)
	referer = request.headers.get("Referer") if request is not None else None
	if not referer:
		return False
	return urlparse(referer).path.rstrip("/") == "/login"


def _dashboard_target(keep_query=False):
	target = WORKSPACE_ROUTE
	if keep_query:
		request = getattr(frappe.local, "request", None)
		query = (request.query_string or b"").decode() if request is not None else ""
		if query:
			target = f"{target}?{query}"
	return target


def redirect_target(path):
	"""Return the URL a cashier-only user must be sent to for `path`, or None to serve it.

	`path` is the request path without leading slash (PathResolver convention).
	"""
	segments = [s for s in (path or "").strip("/").split("/") if s]
	if not segments or segments[0] not in DESK_SEGMENTS:
		return None
	if not is_cashier_only():
		return None

	rest = segments[1:]
	# Bare /desk: straight after signing in, POS (as before); otherwise the dashboard.
	if not rest:
		if _came_from_login():
			return POST_LOGIN_HOME
		return _dashboard_target(keep_query=True)

	# The POS "Switch to Desk" link (and any bookmark) of the manager workspace.
	if rest == [SHELL_SLUG]:
		return _dashboard_target(keep_query=True)

	head = rest[1:] if rest[0] == SHELL_SLUG else rest
	if not head:
		return None
	if head[0] == WORKSPACE_SLUG:
		return None

	allowed = {_slug(d) for d in get_allowed_doctypes()}
	if head[0] in allowed:
		return None
	# Own user settings.
	if head[0] == "user" and len(head) > 1 and head[1] == frappe.session.user:
		return None

	return _dashboard_target()


@frappe.whitelist()
@frappe.read_only()
def get_desktop_page(page):
	"""`frappe.desk.desktop.get_desktop_page` that only serves Daily Operations to cashier-only users.

	The core function builds any workspace named in `page` without checking its roles.
	"""
	if is_cashier_only():
		parsed = frappe.parse_json(page) if isinstance(page, str) else page
		name = (parsed or {}).get("name") if isinstance(parsed, dict) else None
		if name != WORKSPACE_NAME:
			frappe.throw(_("You do not have permission to open this workspace."), frappe.PermissionError)

	from frappe.desk.desktop import get_desktop_page as core_get_desktop_page

	# The core function expects the JSON string the HTTP layer sends.
	return core_get_desktop_page(page if isinstance(page, str) else frappe.as_json(page))


def workspace_permission_query_conditions(user=None):
	"""Hide every Workspace except Daily Operations from list queries of cashier-only users."""
	if not is_cashier_only(user):
		return ""
	return f"`tabWorkspace`.`name` = {frappe.db.escape(WORKSPACE_NAME)}"


def workspace_has_permission(doc, ptype=None, user=None, debug=False):
	"""Controller hook: deny only. Cashier-only users may read Daily Operations and nothing else."""
	if not is_cashier_only(user):
		return True
	if getattr(doc, "name", None) != WORKSPACE_NAME:
		return False
	return ptype in (None, "read")


def shape_bootinfo(bootinfo):
	"""Reduce the Desk navigation payload of a cashier-only user to Daily Operations.

	Runs from `extend_bootinfo`, after Frappe has built `workspaces` and `module_sidebars`.
	Copies are made because Frappe caches parts of these per request.
	"""
	if not is_cashier_only():
		return

	workspaces = copy.copy(bootinfo.get("workspaces") or {})
	pages = [p for p in (workspaces.get("pages") or []) if p.get("name") == WORKSPACE_NAME]
	workspaces["pages"] = pages
	bootinfo["workspaces"] = workspaces

	shells = {}
	home = None
	for shell, entry in (bootinfo.get("module_sidebars") or {}).items():
		items = [
			i
			for i in (entry.get("items") or [])
			if i.get("link_type") == "Workspace" and i.get("link_to") == WORKSPACE_NAME
		]
		if not items:
			continue
		pruned = copy.copy(entry)
		pruned["items"] = items
		pruned["workspaces"] = [WORKSPACE_NAME]
		shells[shell] = pruned
		home = home or shell
	bootinfo["module_sidebars"] = shells
	if home:
		bootinfo["home_shell"] = home
		bootinfo["canonical_shell"] = {}
		bootinfo["entity_module"] = {}

	# Rail and apps screen: only the shells that are left.
	dock = {}
	for app, entries in (bootinfo.get("dock") or {}).items():
		kept = [e for e in (entries or []) if e.get("link_to") in shells]
		if kept:
			dock[app] = kept
	bootinfo["dock"] = dock
	app_data = []
	for app in bootinfo.get("app_data") or []:
		app = copy.copy(app)
		app["dock"] = [e for e in (app.get("dock") or []) if e.get("link_to") in shells]
		app["on_apps_screen"] = bool(app["dock"]) and bool(app.get("on_apps_screen"))
		app_data.append(app)
	bootinfo["app_data"] = app_data

	bootinfo["ury_cashier_desk"] = {
		"workspace": WORKSPACE_NAME,
		"allowed_doctypes": get_allowed_doctypes(),
	}

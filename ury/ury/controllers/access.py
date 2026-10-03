"""Who may use Desk, where each restaurant role lands, and the request gates.

Restaurant staff work in URY's own screens — the POS, the captain's order
pad, the management dashboard — not in Desk. Each URY role has a row in URY
Feature Settings: whether it may open Desk, and the page it lands on.

A user is kept out of Desk when the policy is enforced and every URY role
they hold is a blocked one. System Managers and Administrator are never
blocked, whatever roles they also carry, so the system cannot lock out the
people who administer it. Enforcement happens on the server:

  * /app, /desk, /apps and /me redirect a restricted user to their landing
    page before any Desk HTML is sent (website_path_resolver);
  * frappe.desk.* API calls, which serve Desk's own screens, are refused for
    restricted users (before_request); their doctype permissions still apply
    to everything else, as always;
  * at login, the landing page is returned as `redirect_to`, and the
    `system_user` cookie that makes website pages offer "Switch to Desk" is
    turned off for restricted users.

before_request runs before token authentication, so API-key callers are
seen as Guest there; the feature gate does not depend on the user, and
restaurant staff are not issued API keys.
"""

from urllib.parse import urlparse

import frappe
from frappe import _

from ury.ury import features

POLICY_CACHE_KEY = "ury_access_policy"

# Priority order: the first matching row gives a user with several roles
# their landing page.
DEFAULT_POLICY = [
	{"role": "URY Admin", "block_desk": 0, "landing": "/restro/dashboard"},
	{"role": "URY Manager", "block_desk": 1, "landing": "/restro/dashboard"},
	{"role": "URY Cashier", "block_desk": 1, "landing": "/pos"},
	{"role": "URY Captain", "block_desk": 1, "landing": "/pos/order"},
]

ALWAYS_DESK_ROLES = {"System Manager"}

# First path segments that are Desk, or lead into it.
DESK_PAGES = {"app", "desk", "apps", "me"}

# Desk APIs restricted users still need (the dashboard's notification bell).
DESK_API_ALLOWED = ("frappe.desk.doctype.notification_log.",)

LANDING_CHOICES = ["/pos", "/pos/order", "/restro/dashboard", "/restro/reports", "/mosaic", "/app"]


# --------------------------------------------------------------------------- policy


def get_policy():
	policy = frappe.cache.get_value(POLICY_CACHE_KEY)
	if policy is None:
		policy = {"enforce": True, "roles": [dict(r) for r in DEFAULT_POLICY]}
		if frappe.db.table_exists("URY Role Access"):
			rows = frappe.get_all(
				"URY Role Access",
				filters={"parenttype": "URY Feature Settings"},
				fields=["role", "block_desk", "landing"],
				order_by="idx asc",
			)
			if rows:
				policy["roles"] = [
					{"role": r.role, "block_desk": int(r.block_desk or 0), "landing": r.landing or None} for r in rows
				]
			enforce = frappe.db.get_single_value("URY Feature Settings", "enforce_desk_policy")
			if enforce is not None and frappe.db.exists("Singles", {"doctype": "URY Feature Settings"}):
				policy["enforce"] = bool(int(enforce))
		frappe.cache.set_value(POLICY_CACHE_KEY, policy)
	return policy


def clear_cache():
	frappe.cache.delete_value(POLICY_CACHE_KEY)


def access_for(user=None):
	"""Desk access and landing page for a user."""
	user = user or frappe.session.user
	out = frappe._dict(user=user, desk=True, restricted=False, landing=None, role=None)
	if not user or user == "Guest":
		return out.update(desk=False)
	if user == "Administrator":
		return out

	roles = set(frappe.get_roles(user))
	policy = get_policy()
	matched = [r for r in policy["roles"] if r["role"] in roles]
	if matched:
		out.role = matched[0]["role"]
		out.landing = matched[0]["landing"]
	if roles & ALWAYS_DESK_ROLES or not policy["enforce"] or not matched:
		return out
	if all(r["block_desk"] for r in matched):
		out.desk = False
		out.restricted = True
		# A restricted user's landing can never be Desk.
		if not out.landing or _first_segment(out.landing) in DESK_PAGES:
			out.landing = "/pos"
	return out


# --------------------------------------------------------------------------- page guard


def guard_page(path):
	"""A redirect URL if this logged-in user must not open this page, else None."""
	if frappe.session.user in (None, "Guest"):
		return None
	if _first_segment(path) not in DESK_PAGES:
		return None
	access = access_for()
	if access.desk:
		return None
	return access.landing


# --------------------------------------------------------------------------- request hooks


def before_request():
	"""Refuse calls into disabled features, and Desk APIs for restricted users."""
	method = _requested_method()
	if not method:
		return
	feature = features.feature_for_method(method)
	if feature:
		raise features.FeatureDisabledError(
			_("{0} is switched off. Ask an administrator to enable it.").format(_(feature["label"]))
		)
	if (
		method.startswith("frappe.desk.")
		and not method.startswith(DESK_API_ALLOWED)
		and frappe.session.user not in (None, "Guest", "Administrator")
		and not access_for().desk
	):
		raise frappe.PermissionError(_("Not permitted"))


def after_request(response=None, request=None):
	"""On login, stop website pages from offering Desk to restricted users."""
	if _requested_method() != "login" or frappe.session.user in (None, "Guest"):
		return
	if not access_for().desk and hasattr(frappe.local, "cookie_manager"):
		frappe.local.cookie_manager.set_cookie("system_user", "no")


def on_session_creation(login_manager=None):
	"""Send the user to their page after login (Frappe returns it as `redirect_to`)."""
	user = frappe.session.user
	if not user or user == "Guest":
		return
	access = access_for(user)
	wanted = safe_redirect(frappe.form_dict.get("redirect_to") or frappe.form_dict.get("redirect-to"))
	if wanted and (access.desk or _first_segment(wanted) not in DESK_PAGES):
		target = wanted
	else:
		target = access.landing
	if target:
		frappe.cache.hset("redirect_after_login", user, target)


def extend_bootinfo(bootinfo):
	access = access_for()
	bootinfo.ury_access = {"desk": access.desk, "landing": access.landing, "role": access.role}
	bootinfo.ury_features = features.public_state()


@frappe.whitelist()
def get_my_access():
	"""What the URY screens need about the signed-in user and the switched-off features."""
	access = access_for()
	can_manage = frappe.session.user == "Administrator" or bool(
		set(frappe.get_roles()) & (ALWAYS_DESK_ROLES | {"URY Admin"})
	)
	return {
		"user": access.user,
		"desk": access.desk,
		"landing": access.landing,
		"role": access.role,
		"can_manage": can_manage and access.desk,
		**features.public_state(),
	}


# --------------------------------------------------------------------------- helpers


def safe_redirect(target):
	"""A same-site path, or None: never an absolute URL, never protocol-relative."""
	if not target or not isinstance(target, str):
		return None
	target = target.strip()
	parsed = urlparse(target)
	if parsed.scheme or parsed.netloc or not target.startswith("/") or target.startswith("//") or "\\" in target:
		return None
	if _first_segment(target) in ("login", "logout", "api"):
		return None
	return target


def _first_segment(path):
	path = (path or "").split("?")[0].split("#")[0].strip("/")
	return path.split("/")[0] if path else ""


def _requested_method():
	request = getattr(frappe.local, "request", None)
	path = request.path if request else ""
	for prefix in ("/api/method/", "/api/v1/method/", "/api/v2/method/"):
		if path.startswith(prefix):
			return path[len(prefix):].split("/")[0]
	cmd = frappe.local.form_dict.get("cmd") if getattr(frappe.local, "form_dict", None) else None
	return cmd if isinstance(cmd, str) else None

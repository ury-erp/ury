"""Access wiring for the URY Insights dashboards (capability gated, idempotent, reversible).

Insights is unusable for non-Administrator users today because three gates are closed:
  1. role `Insights User` (else get_user_info is 403),
  2. DocShare on the dashboard (+ its workbook), since Insights team permissions are off,
  3. Frappe read permission on the source doctypes (Insights Settings apply_user_permissions=1).

This module opens those gates, additively and read-only:
  * `Insights User` is added (never removed) to enabled System Users holding a role in
    INSIGHTS_ROLE_TRIGGERS. Administrator, Guest and Website Users are never touched.
  * Each URY dashboard (Insights Dashboard v3, by title) and its workbook is DocShared read-only
    (no write/submit/share) to users per DASHBOARD_ROLES (mirrors desk_visibility_matrix.md).
  * Read-only Custom DocPerm rows (read only) for the roles in READ_GRANTS. Branch/Company User
    Permissions are not touched and keep restricting those reads.

Everything created is recorded in a marker (a DefaultValue, key MARKER_KEY) so `revert()` removes
exactly that. Rows that already existed before this module ran are never recorded or removed.
Nothing happens unless the `insights` app is installed.
"""

import json

import frappe

INSIGHTS_ROLE = "Insights User"
MARKER_KEY = "ury_analytics_access_marker"
NEVER_USERS = ("Administrator", "Guest")
DASHBOARD_DOCTYPE = "Insights Dashboard v3"
WORKBOOK_DOCTYPE = "Insights Workbook"

# Users holding any of these roles get INSIGHTS_ROLE (System Manager deliberately excluded).
INSIGHTS_ROLE_TRIGGERS = (
	"URY Owner",
	"URY Manager",
	"URY Admin",
	"Accounts Manager",
	"HR Manager",
)

_OWNER = ("System Manager", "URY Admin", "URY Owner")
_BRANCH = ("URY Manager", "URY Admin")
_FINANCE = ("Accounts Manager", "URY Admin")

# Insights dashboard title (same as ury.ury.desk_islands.DASHBOARDS) -> roles whose users get a
# read-only share. Taken from the workspace roles in desk_visibility_matrix.md:
#   Owner: DB01, DB16, DB14 | Branch Manager: DB02, DB03, DB09 | Menu: DB04
#   Kitchen: DB05, DB06, DB12, DB13 | Floor: DB07 | People: DB08 | Finance: DB10, DB11, DB15
#   Quality: DB14. DB14 appears in Owner and Quality, so it gets the union.
DASHBOARD_ROLES = {
	"Owner overview": _OWNER,  # DB01
	"Branch daily": _BRANCH,  # DB02
	"Sales deep-dive": _BRANCH,  # DB03
	"Menu and category": _BRANCH,  # DB04
	"Kitchen stations and production": _BRANCH,  # DB05
	"Kitchen timing": _BRANCH,  # DB06
	"Tables and floor": ("URY Captain", "URY Manager"),  # DB07
	"Staff performance": ("URY Manager", "HR Manager"),  # DB08
	"Payments and cash-up": _BRANCH,  # DB09
	"Margin and cost": _FINANCE,  # DB10
	"Stock count and wastage": _FINANCE,  # DB11
	"Yield and recipe": _BRANCH,  # DB12
	"Production planning": _BRANCH,  # DB13
	"Data readiness": ("System Manager", "URY Admin", "URY Owner", "URY Manager"),  # DB14
	"Leakage": _FINANCE,  # DB15
	"Owner brief check": _OWNER,  # DB16
}

# Minimal sources for the Chairman dashboards DB01, DB14, DB16 (semantic_layer.yaml / dashboards/*.yaml).
# Child tables (POS Invoice Item, Sales Invoice Payment, URY KOT Items, Wastage Item, ...) follow their
# parent's permission in Frappe and get no row of their own.
CHAIRMAN_READ = (
	"POS Invoice",
	"POS Closing Entry",
	"POS Opening Entry",
	"POS Profile",
	"URY KOT",
	"URY KOT Execution",
	"URY Yield Check",
	"URY Sales Plan",
	"URY Sales Target",
	"URY Daily P and L",
	"URY Wastage",
	"URY Table",
	"URY Production Unit",
	"URY Item Production Configuration",
	"Stock Correction",
	"Item",
	"Item Group",
	"BOM",
)

# role -> doctypes that get a read-only Custom DocPerm if the role lacks read there today.
READ_GRANTS = {
	"URY Owner": CHAIRMAN_READ,
	"URY Admin": ("POS Invoice", "URY KOT", "URY Yield Check"),
	"Accounts Manager": ("URY Wastage",),
}

_WRITE_PTYPES = ("write", "create", "delete", "submit", "cancel", "amend")


# ----------------------------------------------------------------------------- helpers
def insights_installed():
	try:
		return "insights" in (frappe.get_installed_apps() or [])
	except Exception:
		return False


def _log(msg):
	print(f"[ury.analytics_access] {msg}")


def _empty_marker():
	return {"roles": [], "shares": [], "perms": []}


def _load_marker():
	raw = frappe.db.get_default(MARKER_KEY)
	try:
		data = json.loads(raw) if raw else {}
	except Exception:
		data = {}
	marker = _empty_marker()
	for k in marker:
		marker[k] = list(data.get(k) or [])
	return marker


def _save_marker(marker):
	frappe.db.set_default(MARKER_KEY, json.dumps(marker))


def _remember(marker, kind, item):
	if item not in marker[kind]:
		marker[kind].append(item)


def is_eligible_user(name, enabled=1, user_type="System User"):
	"""Never Administrator/Guest, never disabled, never Website Users."""
	return bool(name) and name not in NEVER_USERS and int(enabled or 0) == 1 and user_type == "System User"


def _eligible_users():
	rows = frappe.get_all(
		"User",
		filters={"enabled": 1, "user_type": "System User", "name": ["not in", list(NEVER_USERS)]},
		pluck="name",
	)
	return [u for u in rows if u not in NEVER_USERS]


def _users_with_roles(roles):
	eligible = set(_eligible_users())
	out = set()
	for r in roles:
		out.update(
			frappe.get_all("Has Role", filters={"role": r, "parenttype": "User"}, pluck="parent") or []
		)
	return sorted(out & eligible)


def _has_insights_role(user):
	return bool(
		frappe.db.exists("Has Role", {"parent": user, "parenttype": "User", "role": INSIGHTS_ROLE})
	)


# ----------------------------------------------------------------------------- roles
def _grant_insights_role(marker):
	if not frappe.db.exists("Role", INSIGHTS_ROLE):
		_log(f"role {INSIGHTS_ROLE!r} missing; skipping role grants")
		return 0
	added = 0
	for user in _users_with_roles(INSIGHTS_ROLE_TRIGGERS):
		if _has_insights_role(user):
			continue
		frappe.get_doc(
			{
				"doctype": "Has Role",
				"parent": user,
				"parenttype": "User",
				"parentfield": "roles",
				"role": INSIGHTS_ROLE,
			}
		).insert(ignore_permissions=True)
		_remember(marker, "roles", user)
		added += 1
	return added


# ----------------------------------------------------------------------------- shares
def _share_exists(doctype, name, user):
	return bool(
		frappe.db.get_value("DocShare", {"user": user, "share_doctype": doctype, "share_name": name})
	)


def _share_read_only(marker, doctype, name, user):
	"""Create a read-only DocShare unless one already exists (never alters an existing share)."""
	if _share_exists(doctype, name, user):
		return 0
	from frappe.share import add_docshare

	add_docshare(
		doctype,
		name,
		user=user,
		read=1,
		write=0,
		submit=0,
		share=0,
		flags={"ignore_share_permission": True},
	)
	_remember(marker, "shares", [doctype, name, user])
	return 1


def _dashboard_docs(title):
	return frappe.get_all(DASHBOARD_DOCTYPE, filters={"title": title}, fields=["name", "workbook"]) or []


def _share_dashboard_to_users(marker, title, users):
	n = 0
	for d in _dashboard_docs(title):
		for user in users:
			n += _share_read_only(marker, DASHBOARD_DOCTYPE, d["name"], user)
			if d.get("workbook"):
				n += _share_read_only(marker, WORKBOOK_DOCTYPE, d["workbook"], user)
	return n


def _share_all(marker, only_user=None):
	n = 0
	for title, roles in DASHBOARD_ROLES.items():
		users = _users_with_roles(roles)
		if only_user is not None:
			users = [u for u in users if u == only_user]
		if users:
			n += _share_dashboard_to_users(marker, title, users)
	return n


# ----------------------------------------------------------------------------- doctype permissions
def _role_has_read(doctype, role):
	if frappe.db.exists("Custom DocPerm", {"parent": doctype}):
		return bool(
			frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "read": 1})
		)
	return bool(frappe.db.exists("DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "read": 1}))


def _grant_reads(marker):
	from frappe.permissions import add_permission, update_permission_property

	n = 0
	for role, doctypes in READ_GRANTS.items():
		if not frappe.db.exists("Role", role):
			continue
		for dt in doctypes:
			if not frappe.db.exists("DocType", dt):
				continue
			if _role_has_read(dt, role):
				continue
			if frappe.db.exists("Custom DocPerm", {"parent": dt, "role": role, "permlevel": 0}):
				continue  # an existing rule (without read) is someone's decision; leave it alone
			add_permission(dt, role, 0, "read")
			update_permission_property(dt, role, 0, "read", 1)
			for ptype in _WRITE_PTYPES:
				update_permission_property(dt, role, 0, ptype, 0)
			_remember(marker, "perms", [role, dt])
			n += 1
	return n


# ----------------------------------------------------------------------------- entry points
def apply():
	"""Idempotent. Adds Insights User, read-only dashboard shares and read-only doctype perms."""
	if not insights_installed():
		_log("insights app not installed; nothing to do")
		return {"skipped": True}
	marker = _load_marker()
	summary = {
		"roles": _grant_insights_role(marker),
		"shares": _share_all(marker),
		"perms": _grant_reads(marker),
	}
	_save_marker(marker)
	frappe.clear_cache()
	_log(f"done: {summary}")
	return summary


def revert():
	"""Remove exactly what apply() and the User hooks created, as recorded in the marker.

	Deletes: Has Role `Insights User` rows added for the recorded users, the recorded read-only
	DocShare rows, and the recorded read-only Custom DocPerm rows. Pre-existing roles, shares and
	permissions were never recorded, so they are untouched. Note: when add_permission first made
	custom permissions for a doctype it copied that doctype's standard rules into Custom DocPerm;
	those copies are equivalent to the standard rules and are left in place. Clears the marker.
	"""
	marker = _load_marker()
	summary = {"roles": 0, "shares": 0, "perms": 0}
	for user in marker["roles"]:
		if user in NEVER_USERS:
			continue
		frappe.db.delete("Has Role", {"parent": user, "parenttype": "User", "role": INSIGHTS_ROLE})
		summary["roles"] += 1
	for doctype, name, user in marker["shares"]:
		frappe.db.delete("DocShare", {"share_doctype": doctype, "share_name": name, "user": user})
		summary["shares"] += 1
	for role, dt in marker["perms"]:
		frappe.db.delete("Custom DocPerm", {"parent": dt, "role": role, "permlevel": 0})
		summary["perms"] += 1
	frappe.db.delete("DefaultValue", {"parent": "__default", "defkey": MARKER_KEY})
	frappe.clear_cache()
	_log(f"reverted: {summary}")
	return summary


# ----------------------------------------------------------------------------- User doc_events
def _doc_roles(doc):
	return {r.role if hasattr(r, "role") else r.get("role") for r in (doc.get("roles") or [])}


def on_user_validate(doc, method=None):
	"""Add `Insights User` (add only) to eligible users holding a trigger role. Never raises."""
	try:
		if not insights_installed():
			return
		if not is_eligible_user(doc.name, doc.get("enabled"), doc.get("user_type") or "System User"):
			return
		roles = _doc_roles(doc)
		if INSIGHTS_ROLE in roles or not (roles & set(INSIGHTS_ROLE_TRIGGERS)):
			return
		if not frappe.db.exists("Role", INSIGHTS_ROLE):
			return
		doc.append("roles", {"role": INSIGHTS_ROLE})
		doc.flags.ury_added_insights_role = True
	except Exception:
		frappe.log_error(title="URY analytics access: user validate failed")


def on_user_update(doc, method=None):
	"""Record a role added by on_user_validate and add the user's read-only dashboard shares."""
	try:
		if not insights_installed():
			return
		if not is_eligible_user(doc.name, doc.get("enabled"), doc.get("user_type") or "System User"):
			return
		marker = _load_marker()
		before = json.dumps(marker, sort_keys=True)
		if doc.flags.get("ury_added_insights_role"):
			_remember(marker, "roles", doc.name)
		_share_all(marker, only_user=doc.name)
		if json.dumps(marker, sort_keys=True) != before:
			_save_marker(marker)
	except Exception:
		frappe.log_error(title="URY analytics access: user update failed")

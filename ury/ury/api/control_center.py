"""The URY Control Center: feature switches and the Desk policy for restaurant roles.

Readable and editable by System Managers and URY Admins (the URY Feature
Settings permissions). A change that would lock the person making it out of
Desk is refused, so the page can never be used to shut its own door.
"""

import frappe
from frappe import _
from frappe.utils import cint

from ury.ury import features
from ury.ury.controllers import access

SETTINGS = "URY Feature Settings"


@frappe.whitelist()
def get_state():
	_check("read")
	policy = access.get_policy()
	role_users = _users_by_role([r["role"] for r in policy["roles"]])
	return {
		"groups": [{"key": k, "label": _(label)} for k, label in features.GROUPS],
		"features": features.describe(),
		"enforce": policy["enforce"],
		"roles": [
			{**r, "users": len(role_users.get(r["role"], ()))} for r in policy["roles"]
		],
		"available_roles": [
			r for r in frappe.get_all("Role", filters={"name": ["like", "URY%"], "disabled": 0}, pluck="name")
			if r not in {x["role"] for x in policy["roles"]}
		],
		"landing_choices": access.LANDING_CHOICES,
		"people": _people(role_users),
		"can_edit": bool(frappe.has_permission(SETTINGS, "write")),
	}


@frappe.whitelist(methods=["POST"])
def save(feature_states=None, enforce=None, roles=None):
	_check("write")
	feature_states = frappe.parse_json(feature_states) if isinstance(feature_states, str) else (feature_states or {})
	roles = frappe.parse_json(roles) if isinstance(roles, str) else roles

	doc = frappe.get_single(SETTINGS)
	before = _snapshot(doc)

	current = features.enabled_map()
	current.update({k: bool(v) for k, v in feature_states.items() if k in features.BY_KEY})
	doc.set("features", [{"feature": f["key"], "enabled": int(current[f["key"]])} for f in features.FEATURES])

	if enforce is not None:
		doc.enforce_desk_policy = cint(enforce)
	if roles is not None:
		doc.set("role_access", [
			{"role": r.get("role"), "block_desk": cint(r.get("block_desk")), "landing": (r.get("landing") or "").strip() or None}
			for r in roles
		])
	elif not doc.role_access:
		doc.set("role_access", [dict(r) for r in access.DEFAULT_POLICY])

	_refuse_self_lockout(doc)
	doc.save()

	changes = _describe_changes(before, _snapshot(doc))
	if changes:
		doc.add_comment("Info", _("Control Center: {0}").format("; ".join(changes)))
	return get_state()


@frappe.whitelist()
def preview_user(user):
	"""What a given user gets: Desk or not, and where they land."""
	_check("read")
	if not frappe.db.exists("User", user):
		frappe.throw(_("User {0} not found").format(user))
	a = access.access_for(user)
	return {"user": user, "full_name": frappe.utils.get_fullname(user), "desk": a.desk, "landing": a.landing, "role": a.role}


# --------------------------------------------------------------------------- helpers


def _check(ptype):
	frappe.has_permission(SETTINGS, ptype, throw=True)


def _refuse_self_lockout(doc):
	"""The editor must still be able to open Desk (and this page) after saving."""
	user = frappe.session.user
	if user == "Administrator" or set(frappe.get_roles(user)) & access.ALWAYS_DESK_ROLES:
		return
	if not cint(doc.enforce_desk_policy):
		return
	roles = set(frappe.get_roles(user))
	matched = [r for r in doc.role_access if r.role in roles]
	if matched and all(cint(r.block_desk) for r in matched):
		frappe.throw(
			_("This would keep you out of Desk too. Leave Desk allowed for one of your roles ({0}), or ask a System Manager.").format(
				", ".join(r.role for r in matched)
			),
			title=_("Not saved"),
		)


def _users_by_role(roles):
	out = {}
	if not roles:
		return out
	for r in frappe.get_all(
		"Has Role",
		filters={"role": ["in", roles], "parenttype": "User", "parent": ["not in", ["Administrator", "Guest"]]},
		fields=["parent", "role"],
	):
		out.setdefault(r.role, set()).add(r.parent)
	enabled = set(frappe.get_all("User", filters={"enabled": 1}, pluck="name"))
	return {role: users & enabled for role, users in out.items()}


def _people(role_users):
	"""Every enabled user with a URY role: whether they keep Desk and where they land."""
	users = sorted(set().union(*role_users.values())) if role_users else []
	rows = []
	for user in users[:200]:
		a = access.access_for(user)
		rows.append({
			"user": user,
			"full_name": frappe.utils.get_fullname(user),
			"desk": a.desk,
			"landing": a.landing,
			"role": a.role,
		})
	rows.sort(key=lambda r: (r["desk"], r["full_name"] or r["user"]))
	return rows


def _snapshot(doc):
	return {
		"features": {r.feature: cint(r.enabled) for r in doc.features},
		"enforce": cint(doc.enforce_desk_policy),
		"roles": {r.role: (cint(r.block_desk), r.landing) for r in doc.role_access},
	}


def _describe_changes(before, after):
	labels = {f["key"]: _(f["label"]) for f in features.FEATURES}
	out = []
	for key, on in after["features"].items():
		if before["features"].get(key, 1) != on:
			out.append((_("{0} enabled") if on else _("{0} disabled")).format(labels.get(key, key)))
	if before["enforce"] != after["enforce"]:
		out.append(_("Desk policy enforced") if after["enforce"] else _("Desk policy relaxed"))
	for role, (block, landing) in after["roles"].items():
		old = before["roles"].get(role)
		if old is None:
			out.append(_("{0} added").format(role))
		elif old != (block, landing):
			out.append(_("{0}: Desk {1}, lands on {2}").format(role, _("blocked") if block else _("allowed"), landing or "—"))
	for role in set(before["roles"]) - set(after["roles"]):
		out.append(_("{0} removed").format(role))
	return out

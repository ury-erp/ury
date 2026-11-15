"""Who may sign in with a PIN.

A PIN has at most a million combinations, so it must only ever open an
order-taking account.
"""

import frappe
from frappe import _

from ury.ury.station.pin import get_settings

ORDER_ROLE = "URY Captain"

# Never PIN-accessible, whatever the settings say.
FORBIDDEN_ROLES = frozenset({"System Manager", "Accounts Manager", "URY Manager", "URY Admin", "Administrator"})

# Roles Frappe gives every user automatically.
AUTOMATIC_ROLES = frozenset({"All", "Guest", "Desk User"})


def allowed_roles() -> set[str]:
	settings = get_settings()
	configured = {row.role for row in settings.allowed_roles}
	return (configured | {ORDER_ROLE}) - FORBIDDEN_ROLES


def branch_of(user: str) -> str | None:
	return frappe.db.get_value("URY User", {"user": user, "parenttype": "Branch"}, "parent")


def pos_profile_of(user: str, branch: str | None = None) -> str | None:
	profiles = frappe.get_all(
		"POS Profile User", filters={"user": user, "parenttype": "POS Profile"}, pluck="parent"
	)
	for profile in profiles:
		values = frappe.db.get_value("POS Profile", profile, ["disabled", "branch"], as_dict=True)
		if values and not values.disabled and (not branch or values.branch == branch):
			return profile
	return None


def open_pos_session(pos_profile: str) -> str | None:
	"""Today's open POS session. ERPNext refuses orders against a session
	opened on an earlier day, so that one does not count as open."""
	return frappe.db.get_value(
		"POS Opening Entry",
		{
			"pos_profile": pos_profile,
			"status": "Open",
			"docstatus": 1,
			"period_start_date": [">=", frappe.utils.today()],
		},
		"name",
	)


def problem_for(user: str) -> str | None:
	"""Why this user cannot sign in with a PIN, or None if they can."""
	if user in ("Administrator", "Guest") or not frappe.db.get_value("User", user, "enabled"):
		return _("This account is disabled. Ask a manager.")

	roles = set(frappe.get_roles(user)) - AUTOMATIC_ROLES
	if roles & FORBIDDEN_ROLES:
		return _("Manager and admin accounts cannot sign in with a PIN.")
	if ORDER_ROLE not in roles:
		return _("This account is not set up to take orders (missing the {0} role).").format(ORDER_ROLE)
	extra = roles - allowed_roles()
	if extra:
		return _("This account has roles that are not allowed for PIN sign-in: {0}.").format(
			", ".join(sorted(extra))
		)

	branch = branch_of(user)
	if not branch:
		return _("This account is not added to a Branch. Ask a manager.")
	profile = pos_profile_of(user, branch)
	if not profile:
		return _("This account is not added to the POS Profile. Ask a manager.")
	if not open_pos_session(profile):
		return _("The POS is not open for today yet. Ask the cashier to open it.")
	return None

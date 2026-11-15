"""Waiters and cashiers no longer have Desk access (see ury.ury.roles).

The role change itself comes from the Role fixture. A user's type is only
recalculated when the user is saved, so resave everyone holding those roles:
a user whose only roles are Waiter or Cashier becomes a Website User, and
anyone who also holds a Desk role keeps Desk access.
"""

import frappe


def execute():
	for role in ("URY Captain", "URY Cashier"):
		if frappe.db.exists("Role", role):
			frappe.db.set_value("Role", role, "desk_access", 0, update_modified=False)
	frappe.clear_cache()

	users = frappe.get_all(
		"Has Role",
		filters={"role": ["in", ["URY Captain", "URY Cashier"]], "parenttype": "User"},
		pluck="parent",
		distinct=True,
	)
	for name in users:
		if name in ("Administrator", "Guest"):
			continue
		user = frappe.get_doc("User", name)
		user_type = "System User" if user.has_desk_access() else "Website User"
		if user.user_type != user_type and frappe.db.get_value("User Type", user.user_type, "is_standard") != 0:
			frappe.db.set_value("User", name, "user_type", user_type, update_modified=False)

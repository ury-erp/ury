"""
Point saved landing pages at the /restro URLs.

The restaurant dashboard moved from /ury to /restro. The old URLs still
redirect, but a landing page saved in the Control Center ("URY Role Access")
would send every sign-in through that extra hop, and the Control Center would
no longer find it among its landing choices.
"""

import frappe

OLD = "/ury"
NEW = "/restro"


def execute():
	if not frappe.db.table_exists("URY Role Access"):
		return

	rows = frappe.get_all(
		"URY Role Access",
		filters={"landing": ["like", f"{OLD}%"]},
		fields=["name", "landing"],
	)
	for row in rows:
		if row.landing == OLD or row.landing.startswith(f"{OLD}/"):
			frappe.db.set_value(
				"URY Role Access", row.name, "landing", NEW + row.landing[len(OLD) :], update_modified=False
			)

	if rows:
		from ury.ury.controllers import access

		access.clear_cache()

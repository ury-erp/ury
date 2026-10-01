import frappe


def permission_checklists(user):
    user = frappe.session.user
    employee = frappe.db.sql(
        """ SELECT
				`tabEmployee`.user_id ,
				`tabEmployee`.branch ,
				`tabEmployee`.permit_to_view
			FROM
				`tabEmployee`
			WHERE
				`tabEmployee`.user_id = %s
		""",
        (user),
        as_dict=True,
    )
    for i in employee:
        if i["permit_to_view"] == 0:
            return "(`tabQuality Review`.owner = {user})".format(
                user=frappe.db.escape(user)
            )

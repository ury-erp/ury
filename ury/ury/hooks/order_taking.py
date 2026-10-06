import frappe


@frappe.whitelist()
def ordertaker_checklist(branch, employee):
    date = ""
    pos_opening_list = frappe.get_all(
        "POS Opening Entry",
        fields=["name", "docstatus", "status", "posting_date"],
        filters={"branch": branch},
    )
    flag = 0
    for pos_opening in pos_opening_list:
        if pos_opening.status == "Open" and pos_opening.docstatus == 1:
            date = pos_opening.posting_date
    user = frappe.get_doc("User", employee)
    if user.role_profile_name == "Restaurant Manager":
        return flag, frappe.conf.url

    # Block only on the branch's own "Order Taking" Dependent Checklist goals
    # (grillax port) that match the user's roles -- the previous hard-coded
    # "Order Taker Opening Checklist" goal name never matched any real
    # configuration, so the gate either blocked everyone or no one.
    pos_profile_name = frappe.db.get_value("POS Profile", {"branch": branch}, "name")
    goals = []
    if pos_profile_name:
        pos_profile = frappe.get_doc("POS Profile", pos_profile_name)
        user_roles = {role.role for role in user.roles}
        goals = [
            row.quality_checklist
            for row in pos_profile.dependent_checklist
            if row.select_2 == "Order Taking" and row.role in user_roles
        ]

    for goal in goals:
        quality_review_list = frappe.db.sql(
            """
			SELECT *
			FROM `tabQuality Review`
			WHERE `employee` = %s
			AND `goal` = %s
			AND `date` >= %s
			""",
            (employee, goal, date),
            as_dict=True,
        )
        if len(quality_review_list) == 0:
            flag = 2
            frappe.msgprint(
                title="Message", indicator="red", msg=("Complete Order Taker Checklist")
            )
            break
    return flag, frappe.conf.url

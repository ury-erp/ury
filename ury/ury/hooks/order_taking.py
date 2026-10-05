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
        pass
    else:
        quality_review_list = frappe.db.sql(
            """
			SELECT *
			FROM `tabQuality Review`
			WHERE `employee` = %s
			AND `goal` = %s
			AND `date` >= %s
			""",
            (employee, "Order Taker Opening Checklist", date),
            as_dict=True,
        )
        if len(quality_review_list) == 0:
            flag = 2
            frappe.msgprint(
                title="Message", indicator="red", msg=("Complete Order Taker Checklist")
            )
    url = frappe.conf.url
    return flag, url

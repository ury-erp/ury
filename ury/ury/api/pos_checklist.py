import frappe
from frappe.utils import flt, get_datetime, today
from ury.ury_pos.api import getBranch


@frappe.whitelist()
def checklist():
    today_date = today()
    employee = frappe.session.user
    date = ""
    branchName = getBranch()

    pos_opening_list = frappe.get_all(
        "POS Opening Entry",
        filters={
            "branch": branchName,
            "docstatus": 1,
            "status": "Open"
        },
        fields=["posting_date"]
    )

    # If POS is not open
    if not pos_opening_list:
        return {
            "pos_open": 0,
        }

    pos_open = 1
    pos_posting_date = pos_opening_list[0].posting_date

    user = frappe.get_doc("User", employee)
    user_roles = user.roles

    pos_profile_name = frappe.get_value(
        "POS Profile",
        {"branch": branchName},
        "name"
    )

    pos_profile = frappe.get_doc("POS Profile", pos_profile_name)
    dependent_checklist = pos_profile.dependent_checklist

    if not dependent_checklist:
        return {
            "pos_open": pos_open,
            "checklist": 1
        }

    to_submit_checklists = []
    for checklist in dependent_checklist:
        for user_role in user_roles:
            if checklist.role == user_role.role:
                to_submit_checklists.append(checklist)

    if not to_submit_checklists:
        return {
            "pos_open": pos_open,
            "checklist": 1
        }

    is_checklist_submitted = frappe.db.exists({
        "doctype": "Quality Review",
        "date": pos_posting_date,
        "status": ["in", ["Open", "Passed"]],
        "owner": employee
    })

    return {
        "pos_open": pos_open,
        "checklist": 1 if is_checklist_submitted else 0,
        "checklist_doc": to_submit_checklists,
        "pos_posting_date": pos_posting_date
    }

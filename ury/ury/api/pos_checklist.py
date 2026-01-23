import frappe
from frappe.utils import flt, get_datetime, today
from ury.ury_pos.api import getBranch


@frappe.whitelist()
def checklist(**kwargs):
    today_date = today()
    employee = frappe.session.user
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

    if pos_opening_list:
        pos_open = 1
        pos_posting_date = pos_opening_list[0].posting_date
    else:
        pos_open = 0
        pos_posting_date = today_date

    user_roles = frappe.get_roles(employee)

    pos_profile_name = frappe.get_value(
        "POS Profile",
        {"branch": branchName},
        "name"
    )
    
    if not pos_profile_name:
         return {
            "pos_open": pos_open,
            "checklist": 1
        }

    pos_profile = frappe.get_doc("POS Profile", pos_profile_name)
    daily_quality_checklist = pos_profile.custom_daily_quality_checking

    if not daily_quality_checklist:
        return {
            "pos_open": pos_open,
            "checklist": 1
        }

    to_submit_checklists = []
    for checklist in daily_quality_checklist:
        for user_role in user_roles:
            if checklist.role == user_role:
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
        "checklist_name": [check.checklist for check in to_submit_checklists],
        "pos_posting_date": pos_posting_date
    }

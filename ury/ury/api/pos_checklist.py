import frappe
from frappe.utils import flt, get_datetime, today
from ury.ury_pos.api import getBranch


@frappe.whitelist()
def checklist(checklist_type="Pos Opening Entry"):
    today_date = today()
    employee = frappe.session.user
    branchName = getBranch()

    # Find open POS entry
    pos_opening_list = frappe.get_all(
        "POS Opening Entry",
        filters={
            "branch": branchName,
            "docstatus": 1,
            "status": "Open",
            "user": employee
        },
        fields=["posting_date", "pos_profile", "name"]
    )

    # Determine POS status and posting date
    if not pos_opening_list:
        pos_open = 0
        pos_posting_date = today_date
        # Attempt to find POS Profile from branch if no opening entry
        pos_profile_name = frappe.get_value("POS Profile", {"branch": branchName}, "name")
    else:
        pos_open = 1
        pos_posting_date = pos_opening_list[0].posting_date
        pos_profile_name = pos_opening_list[0].pos_profile

    if not pos_profile_name:
         return {
            "pos_open": pos_open,
            "checklist": 1, 
        }

    # Fetch User Roles
    user = frappe.get_doc("User", employee)
    user_roles = [r.role for r in user.roles]

    # Fetch POS Profile and Checklist Configuration
    pos_profile = frappe.get_doc("POS Profile", pos_profile_name)
    daily_quality_check = pos_profile.custom_daily_quality_checking or []

    # Identify required checklists based on type and user role
    to_submit_goals = []
    
    for row in daily_quality_check:
        if row.options != checklist_type:
            continue
            
        quality_goal_name = row.checklist
        if not quality_goal_name:
            continue
            
        # We need the Quality Goal doc to check the assigned role
        # Optimization: Could fetch all needed goals in one query if perf is issue
        quality_goal = frappe.get_doc("Quality Goal", quality_goal_name)
        
        if quality_goal.custom_assigned_role in user_roles:
            to_submit_goals.append(quality_goal)

    if not to_submit_goals:
        return {
            "pos_open": pos_open,
            "checklist": 1
        }

    all_checklists_submitted = True
    
    for goal in to_submit_goals:
        # Check if a VALID (Open/Passed) Quality Review exists for this Goal
        is_submitted = frappe.db.exists({
            "doctype": "Quality Review",
            "goal": goal.name, # The Link field to Quality Goal
            "date": pos_posting_date,
            "owner": employee,
            "docstatus": 1, # Must be submitted
            "status": ["in", ["Open", "Passed"]]
        })
        
        if not is_submitted:
            all_checklists_submitted = False
            break

    return {
        "pos_open": pos_open,
        "checklist": 1 if all_checklists_submitted else 0,
        "checklist_doc": [], # Keeping key for frontend safety (though likely unused now)
        "pos_posting_date": pos_posting_date,
        "message": "Complete the checklist quality review"
    }

import frappe

def on_submit(doc, method=None):
    branch = doc.branch or frappe.db.get_value("POS Profile", doc.pos_profile, "branch")
    if not branch:
        return
        
    # Check if reset option is enabled on Branch
    reset_enabled = frappe.db.get_value("Branch", branch, "custom_reset_order_number_daily")
    if not reset_enabled:
        return

    # Check if there are any remaining open POS Opening Entries for this branch
    open_entries = frappe.db.count(
        "POS Opening Entry",
        filters={
            "branch": branch,
            "status": "Open",
            "docstatus": 1,
            "name": ["!=", doc.pos_opening_entry]
        }
    )
    
    if open_entries == 0:
        # Reset counters on branch when all POS sessions are closed
        frappe.db.sql("""
            UPDATE `tabBranch`
            SET custom_order_counter = 0,
                custom_aggregator_order_counter = 0
            WHERE name = %s
        """, (branch,))

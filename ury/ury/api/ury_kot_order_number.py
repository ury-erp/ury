import frappe

def set_order_number(doc, event=None):
    if not doc.branch:
        return

    # Increment appropriate counter atomically with row lock to prevent race conditions
    if doc.order_type == "Aggregators":
        res = frappe.db.sql("""
            SELECT custom_aggregator_order_counter 
            FROM `tabBranch` 
            WHERE name = %s 
            FOR UPDATE
        """, (doc.branch,))
        
        val = (res[0][0] or 0) + 1 if res else 1
        
        frappe.db.set_value(
            "Branch",
            doc.branch,
            "custom_aggregator_order_counter",
            val,
            update_modified=False,
        )
        order_number = f"AGR - {val}"
    else:
        res = frappe.db.sql("""
            SELECT custom_order_counter 
            FROM `tabBranch` 
            WHERE name = %s 
            FOR UPDATE
        """, (doc.branch,))
        
        val = (res[0][0] or 0) + 1 if res else 1
        
        frappe.db.set_value(
            "Branch",
            doc.branch,
            "custom_order_counter",
            val,
            update_modified=False,
        )
        order_number = str(val)

    # Set order number on POS Invoice
    frappe.db.set_value(
        "POS Invoice",
        doc.name,
        "custom_ury_order_number",
        order_number,
        update_modified=False,
    )
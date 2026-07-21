import frappe

def set_order_number(doc, event=None):
    if not doc.branch:
        return

    # Increment appropriate counter atomically
    if doc.order_type == "Aggregators":
        frappe.db.sql("""
            UPDATE `tabBranch`
            SET custom_aggregator_order_counter = custom_aggregator_order_counter + 1
            WHERE name = %s
        """, (doc.branch,))
        
        # Retrieve incremented value
        val = frappe.db.get_value("Branch", doc.branch, "custom_aggregator_order_counter")
        order_number = f"AGR - {val}"
    else:
        frappe.db.sql("""
            UPDATE `tabBranch`
            SET custom_order_counter = custom_order_counter + 1
            WHERE name = %s
        """, (doc.branch,))
        
        # Retrieve incremented value
        val = frappe.db.get_value("Branch", doc.branch, "custom_order_counter")
        order_number = str(val)

    # Set order number on POS Invoice
    frappe.db.set_value(
        "POS Invoice",
        doc.name,
        "custom_ury_order_number",
        order_number,
        update_modified=False,
    )
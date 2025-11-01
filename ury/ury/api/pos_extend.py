import frappe
from frappe import _

def validate_search_input(search_term):
    """Validate and sanitize search input"""
    if not search_term:
        return ""

    # Length validation
    if len(search_term) > 100:
        frappe.throw(_("Search term too long (max 100 characters)"))

    # Character whitelist (adjust based on requirements)
    import re
    if not re.match(r'^[a-zA-Z0-9\s\-_@.]+$', search_term):
        frappe.throw(_("Invalid characters in search term"))

    return search_term

@frappe.whitelist()
def overrided_past_order_list(search_term, status, limit=20):
    user = frappe.session.user
    search_term = validate_search_input(search_term)
    if user != "Administrator":
        sql_query = """
            SELECT b.branch,a.room
            FROM `tabURY User` AS a
            INNER JOIN `tabBranch` AS b ON a.parent = b.name
            WHERE a.user = %s
        """
        branch_array = frappe.db.sql(sql_query, user, as_dict=True)

        if not branch_array:
            frappe.throw("User is not Associated with any Branch.Please refresh Page")

        branch_name = branch_array[0].get("branch")
        room_name = branch_array[0].get("room")

    fields = [
        "name",
        "grand_total",
        "currency",
        "customer",
        "posting_time",
        "posting_date",
        "restaurant_table",
        "invoice_printed",
    ]
    invoice_list = []
    updated_list = []

    if search_term and status:
        invoices_by_customer = frappe.db.get_all(
            "POS Invoice",
            filters={
                "customer": ["like", "%{}%".format(frappe.db.escape(search_term))],
                "status": status,
            },
            fields=fields,
        )
        invoices_by_name = frappe.db.get_all(
            "POS Invoice",
            filters={"name": ["like", "%{}%".format(frappe.db.escape(search_term))], "status": status},
            fields=fields,
        )
        print("invoices by customer",invoices_by_customer)
        invoice_list = invoices_by_customer + invoices_by_name
        updated_list = invoice_list
    elif status:
        if user != "Administrator":
            if status == "To Bill":
                invoice_list = frappe.db.get_all(
                    "POS Invoice",
                    filters={"status": "Draft", "branch": branch_name,"custom_restaurant_room": room_name},
                    fields=fields,
                )
                for invoice in invoice_list:
                    if invoice.restaurant_table and invoice.invoice_printed == 0:
                        updated_list.append(invoice)

            else:
                invoice_list = frappe.db.get_all(
                    "POS Invoice",
                    filters={"status": status, "branch": branch_name,"custom_restaurant_room":room_name},
                    fields=fields,
                )
                for invoice in invoice_list:
                    if not invoice.restaurant_table or invoice.invoice_printed == 1:
                        updated_list.append(invoice)

        else:
            if status == "To Bill":
                invoice_list = frappe.db.get_all(
                    "POS Invoice",
                    filters={"status": "Draft"},
                    fields=fields,
                )
                for invoice in invoice_list:
                    if invoice.restaurant_table and invoice.invoice_printed == 0:
                        updated_list.append(invoice)

            else:
                invoice_list = frappe.db.get_all(
                    "POS Invoice",
                    filters={"status": status},
                    fields=fields,
                )
                for invoice in invoice_list:
                    if not invoice.restaurant_table or invoice.invoice_printed == 1:
                        updated_list.append(invoice)

    return updated_list

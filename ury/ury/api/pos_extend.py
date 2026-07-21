import frappe
from frappe import _
from ury.ury_pos.api import getBranch, getPosProfile, _resolve_pos_profile

def validate_search_input(search_term):
    """Validate and sanitize search input"""
    if not search_term:
        return ""

    # Length validation
    if len(search_term) > 100:
        frappe.throw(_("Search term too long (max 100 characters)"))

    # Character whitelist
    import re
    if not re.match(r'^[a-zA-Z0-9\s\-_@.]+$', search_term):
        frappe.throw(_("Invalid characters in search term"))

    return search_term

@frappe.whitelist()
def overrided_past_order_list(search_term, status, limit=20):
    user = frappe.session.user
    search_term = validate_search_input(search_term)
    
    if user != "Administrator":
        branch_name = getBranch()
        try:
            pos_profile = _resolve_pos_profile(user, branch_name)
        except Exception:
            pos_profile = None
        if not pos_profile:
            frappe.throw("No POS Profile found for user. Please refresh page.")
        
        pos_profile_doc = frappe.get_doc("POS Profile", pos_profile)
        room_names = [r.room for r in pos_profile_doc.get("custom_rooms", []) if r.room]
        if not room_names:
            frappe.throw("No rooms assigned to POS Profile. Please contact administrator.")
    else:
        branch_name = None
        room_names = []

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
        invoice_list = invoices_by_customer + invoices_by_name
        updated_list = invoice_list
    elif status:
        if user != "Administrator":
            if status == "To Bill":
                invoice_list = frappe.db.get_all(
                    "POS Invoice",
                    filters={"status": "Draft", "branch": branch_name, "custom_restaurant_room": ["in", room_names]},
                    fields=fields,
                )
                for invoice in invoice_list:
                    if invoice.restaurant_table and invoice.invoice_printed == 0:
                        updated_list.append(invoice)

            else:
                invoice_list = frappe.db.get_all(
                    "POS Invoice",
                    filters={"status": status, "branch": branch_name, "custom_restaurant_room": ["in", room_names]},
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

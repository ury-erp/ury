import frappe
from frappe import _
from frappe.utils import get_datetime, today, now

def validate(doc, method):
    set_cashier_room(doc, method)
    
def before_save(doc, method):
    main_pos_open_check(doc, method)
    set_current_time(doc, method)
    
    
def set_cashier_room(doc, method):
    room = frappe.db.sql("""
                SELECT room, parent
                FROM `tabURY User`
                WHERE parent=%s AND user=%s
            """, (doc.branch, doc.user), as_dict=True)

    if room:
        doc.custom_room = room[0]['room']
        multiple_cashier = frappe.db.get_value("POS Profile", doc.pos_profile, "custom_enable_multiple_cashier")
        if multiple_cashier:
            doc.custom_rooms = []
            for r in room:
                doc.append('custom_rooms', {
                    'room': r['room']
                })

def set_current_time(doc, method):
    multiple_cashier = frappe.db.get_value("POS Profile", doc.pos_profile, "custom_enable_multiple_cashier")
    if multiple_cashier:
        date_time = now()
        doc.period_start_date = date_time


def main_pos_open_check(doc, method):
    current_date = today()
    multiple_cashier = frappe.db.get_value("POS Profile", doc.pos_profile, "custom_enable_multiple_cashier")
    if multiple_cashier:
        # Use lightweight query instead of full get_doc
        owner = frappe.db.get_value(
            "POS Profile User",
            {"parent": doc.pos_profile, "custom_main_cashier": 1},
            "user",
        )

        if frappe.session.user != owner:
            has_open = frappe.db.exists(
                "POS Opening Entry",
                {"branch": doc.branch, "user": owner, "posting_date": current_date, "status": "Open", "docstatus": 1},
            )
            if not has_open:
                frappe.throw(_("Main Cashier POS must be open"), title=_("Main Cashier POS Required"))

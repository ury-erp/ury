import frappe
from frappe.utils import today
from frappe.utils import  get_datetime,today,now

def validate(doc,method):
    set_cashier_room(doc,method)
    
def before_save(doc, method):
    set_current_time(doc,method)
    
    
def set_cashier_room(doc,method):
    if not doc.pos_profile:
        return
    pos_profile_doc = frappe.get_doc("POS Profile", doc.pos_profile)
    rooms = [r.room for r in pos_profile_doc.get("custom_rooms", []) if r.room]
    if rooms:
        doc.custom_room = rooms[0]
        doc.custom_rooms = []
        for r in rooms:
            doc.append('custom_rooms', {
                'room': r
            })

def set_current_time(doc,method):
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:
        date_time = now()
        doc.period_start_date = date_time
    else:
        pass


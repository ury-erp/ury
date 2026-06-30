import frappe
from frappe.utils import today
from frappe.utils import  get_datetime,today,now

def validate(doc,method):
    set_cashier_room(doc,method)
    
def before_save(doc, method):
    main_pos_open_check(doc, method)
    set_current_time(doc,method)
    
    
def set_cashier_room(doc,method):
    room =  frappe.db.sql("""
                SELECT room , parent
                FROM `tabURY User`
                WHERE parent=%s AND user=%s         
            """,(doc.branch,doc.user),as_dict=True)
    
    if room:
        doc.custom_room = room[0]['room']
        multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
        if multiple_cashier:
            doc.custom_rooms = []
            for room in room:
                doc.append('custom_rooms', {
                    'room': room['room']
                })

def set_current_time(doc,method):
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:
        date_time = now()
        doc.period_start_date = date_time
    else:
        pass

def main_pos_open_check(doc,method):
    owner = None
    current_date = today()
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:
        get_cashier = frappe.get_doc("POS Profile", doc.pos_profile)
        for user_details in get_cashier.applicable_for_users:
            if user_details.custom_main_cashier:
                owner = user_details.user

        if frappe.session.user != owner:
            pos_opening_list = frappe.get_all(
                "POS Opening Entry",
                fields=["name", "docstatus", "status", "posting_date"],
                filters={"branch": doc.branch,"user":owner,"posting_date":current_date},
            )
            flag = 1
            for pos_opening in pos_opening_list:
                if pos_opening.status == "Open" and pos_opening.docstatus == 1:
                    flag = 0
            if flag == 1:
                frappe.throw(("Main Cashier POS must be open"), title=("Main Cashier POS Required"))
                
            return flag
    else:
        pass

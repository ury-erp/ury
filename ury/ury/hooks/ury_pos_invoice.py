import frappe
import datetime
from frappe.utils import now_datetime, get_time


def before_insert(doc, method):
    pos_invoice_naming(doc, method)
    order_type_update(doc, method)
    restrict_existing_order(doc, method)


def validate(doc, method):
    validate_invoice(doc, method)
    validate_customer(doc, method)
    validate_price_list(doc, method)


def before_submit(doc, method):
    calculate_and_set_times(doc, method)
    validate_invoice_print(doc, method)
    ro_reload_submit(doc, method)


def on_trash(doc, method):
    table_status_delete(doc, method)


def validate_invoice(doc, method):
    if doc.waiter == None or doc.waiter == "":
        doc.waiter = doc.modified_by


def validate_customer(doc, method):
    if doc.customer_name == None or doc.customer_name == "":
        frappe.throw(
            (" Failed to load data , Please Refresh the page ").format(
                doc.customer_name
            )
        )


def calculate_and_set_times(doc, method):
    doc.arrived_time = doc.creation

    today = datetime.datetime.now()
    current_time = today.strftime("%H:%M:%S")
    start_time = frappe.utils.data.get_datetime(doc.arrived_time).time()
    current_time_obj = datetime.datetime.strptime(current_time, "%H:%M:%S").time()

    minutes = (
        datetime.datetime.combine(datetime.date.min, current_time_obj)
        - datetime.datetime.combine(datetime.date.min, start_time)
    ).total_seconds() / 60
    hours = int(minutes // 60)

    remaining_minutes = int(minutes % 60)
    formatted_spend_time = f"{hours}:{remaining_minutes:02d}"

    doc.total_spend_time = formatted_spend_time


def validate_invoice_print(doc, method):
    # Check if the invoice has been printed
    invoice_printed = frappe.db.get_value("POS Invoice", doc.name, "invoice_printed")

    # If the invoice is associated with a restaurant table and hasn't been printed
    if doc.restaurant_table and invoice_printed == 0:
        frappe.throw(
            "Printing the invoice is mandatory before submitting. Please print the invoice."
        )


def table_status_delete(doc, method):
    if doc.restaurant_table:
        frappe.db.set_value(
            "URY Table",
            doc.restaurant_table,
            {"occupied": 0, "latest_invoice_time": None},
        )


def pos_invoice_naming(doc, method):
    pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
    restaurant = pos_profile.restaurant

    if not doc.restaurant_table:
        doc.naming_series = frappe.db.get_value(
            "URY Restaurant", restaurant, "invoice_series_prefix"
        )


def order_type_update(doc, method):
    if doc.restaurant_table:
        is_take_away = frappe.db.get_value(
            "URY Table", doc.restaurant_table, "is_take_away"
        )
        if is_take_away == 1:
            doc.order_type = "Take Away"
        else:
            doc.order_type = "Dine In"


# reload restaurant order page if submitted invoice is open there
def ro_reload_submit(doc, method):
    frappe.publish_realtime("reload_ro", {"name": doc.name})


def validate_price_list(doc, method):
    if doc.restaurant:
        room = frappe.db.get_value("URY Table", doc.restaurant_table, "restaurant_room")
        menu_name = (
            frappe.db.get_value("URY Restaurant", doc.restaurant, "active_menu")
            if not frappe.db.get_value(
                "URY Restaurant", doc.restaurant, "room_wise_menu"
            )
            else frappe.db.get_value(
                "Menu for Room", {"parent": doc.restaurant, "room": room}, "menu"
            )
        )

        doc.selling_price_list = frappe.db.get_value(
            "Price List", dict(restaurant_menu=menu_name, enabled=1)
        )


def restrict_existing_order(doc, event):
    if doc.restaurant_table:
        invoice_exist = frappe.db.exists(
            "POS Invoice",
            {
                "restaurant_table": doc.restaurant_table,
                "docstatus": 0,
                "invoice_printed": 0,
            },
        )
        if invoice_exist:
            frappe.throw(
                ("Table {0} has an existing invoice").format(doc.restaurant_table)
            )

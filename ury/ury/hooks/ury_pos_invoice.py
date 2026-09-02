import frappe
from datetime import datetime
from frappe.utils import now_datetime, get_time,now
from ury.ury.doctype.ury_order.ury_order import release_merge_cluster_tables


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

def before_cancel(doc, method):
    validate_cancellation(doc)

def on_trash(doc, method):
    table_status_delete(doc, method)


def validate_invoice(doc, method):
    if doc.waiter == None or doc.waiter == "":
        doc.waiter = doc.modified_by
    if getattr(frappe.flags, "ury_bill_split", False):
        return
    remove_items = frappe.db.get_value("POS Profile", doc.pos_profile, "remove_items")
    
    if doc.invoice_printed == 1 and remove_items == 0:
        # Get the original items from db
        original_doc = frappe.get_doc("POS Invoice", doc.name)
        
        # Create dictionaries to store both quantities and names
        original_items = {
            item.item_code: {"qty": item.qty, "name": item.item_name} 
            for item in original_doc.items
        }
        current_items = {
            item.item_code: {"qty": item.qty, "name": item.item_name} 
            for item in doc.items
        }
          
        # Check for removed items
        removed_items = set(original_items.keys()) - set(current_items.keys())
        
        # Check for quantity reductions
        reduced_qty_items = []
        for item_code, item_data in original_items.items():
            if (item_code in current_items and 
                current_items[item_code]["qty"] < item_data["qty"]):
                reduced_qty_items.append(
                    f"{item_data['name']} (qty reduced from {item_data['qty']} "
                    f"to {current_items[item_code]['qty']})"
                )
        
        if removed_items or reduced_qty_items:
            error_msg = []
            if removed_items:
                removed_item_names = [
                    original_items[item_code]["name"] 
                    for item_code in removed_items
                ]
                error_msg.append(f"Removed items: {', '.join(removed_item_names)}")
            if reduced_qty_items:
                error_msg.append(f"Modified quantities: {', '.join(reduced_qty_items)}")
                
            frappe.throw(
                ("Cannot modify items after invoice is printed.\n{0}")
                .format("\n".join(error_msg))
            )


def validate_customer(doc, method):
    if doc.customer_name == None or doc.customer_name == "":
        frappe.throw(
            (" Failed to load data , Please Refresh the page ").format(
                doc.customer_name
            )
        )


def calculate_and_set_times(doc, method):
    doc.arrived_time = doc.creation

    current_time_str = now()
    
    current_time = datetime.strptime(current_time_str, "%Y-%m-%d %H:%M:%S.%f")
    
    time_difference = current_time - doc.creation
    
    total_seconds = int(time_difference.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    
    formatted_spend_time = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
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
        release_merge_cluster_tables(doc.restaurant_table)


def pos_invoice_naming(doc, method):
    pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
    restaurant = pos_profile.restaurant
    branch = doc.branch or pos_profile.branch

    if not doc.restaurant_table:
        naming_series_prefix = frappe.db.get_value("Branch", branch, "custom_invoice_series_prefix")
        if not naming_series_prefix:
            naming_series_prefix = frappe.db.get_value("URY Restaurant", restaurant, "invoice_series_prefix")
        doc.naming_series = naming_series_prefix
        
        if doc.order_type == "Aggregators":
            aggregator_prefix = frappe.db.get_value("Branch", branch, "custom_aggregator_series_prefix")
            if not aggregator_prefix:
                aggregator_prefix = frappe.db.get_value("URY Restaurant", restaurant, "aggregator_series_prefix")
            doc.naming_series = aggregator_prefix
    


def order_type_update(doc, method):
    if doc.restaurant_table:
        if not doc.order_type:
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
    branch = doc.branch
    if not branch and doc.pos_profile:
        branch = frappe.db.get_value("POS Profile", doc.pos_profile, "branch")
        
    if branch or doc.restaurant:
        
        if doc.restaurant_table:
            room = frappe.db.get_value("URY Table", doc.restaurant_table, "restaurant_room")
            
            room_wise_menu = frappe.db.get_value("Branch", branch, "custom_room_wise_menu") if branch else None
            if room_wise_menu is None and doc.restaurant:
                room_wise_menu = frappe.db.get_value("URY Restaurant", doc.restaurant, "room_wise_menu")
                
            if not room_wise_menu:
                menu_name = frappe.db.get_value("Branch", branch, "custom_active_menu") if branch else None
                if not menu_name and doc.restaurant:
                    menu_name = frappe.db.get_value("URY Restaurant", doc.restaurant, "active_menu")
            else:
                menu_name = frappe.db.get_value("Menu for Room", {"parent": branch, "room": room, "parenttype": "Branch"}, "menu") if branch else None
                if not menu_name and doc.restaurant:
                    menu_name = frappe.db.get_value("Menu for Room", {"parent": doc.restaurant, "room": room, "parenttype": "URY Restaurant"}, "menu")

            doc.selling_price_list = frappe.db.get_value(
                "Price List", dict(restaurant_menu=menu_name, enabled=1)
            )
        
        if doc.order_type == "Aggregators":
            price_list = frappe.db.get_value("Aggregator Settings",
                {"customer": doc.customer, "parent": doc.branch, "parenttype": "Branch"},
                "price_list",
                )
            
            if not price_list:
                frappe.throw(f"Price list for customer {doc.customer} in branch {doc.branch} not found in Aggregator Settings.")
                
            doc.selling_price_list = price_list
            
        else:
            menu_name = frappe.db.get_value("Branch", branch, "custom_active_menu") if branch else None
            if not menu_name and doc.restaurant:
                menu_name = frappe.db.get_value("URY Restaurant", doc.restaurant, "active_menu") 

            doc.selling_price_list = frappe.db.get_value(
                "Price List", dict(restaurant_menu=menu_name, enabled=1)
            )
            

def restrict_existing_order(doc, event):
    if not doc.restaurant_table:
        return

    if getattr(frappe.flags, "ury_bill_split", False):
        return

    if doc.get("custom_split_from"):
        source = frappe.db.get_value(
            "POS Invoice",
            doc.custom_split_from,
            ["docstatus", "restaurant_table"],
            as_dict=True,
        )
        if (
            source
            and source.docstatus == 0
            and (source.restaurant_table or "") == (doc.restaurant_table or "")
        ):
            return

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

def sync_merged_invoice(doc):
    if getattr(frappe.flags, "in_bill_merge_sync", False):
        return

    linked_invoice = doc.custom_merged_pos_invoice
    if not linked_invoice:
        return

    frappe.flags.in_bill_merge_sync = True

    try:
        if not frappe.db.exists("POS Invoice", linked_invoice):
            return

        target = frappe.get_doc("POS Invoice", linked_invoice)

        # sync invoice printed
        target.invoice_printed = doc.invoice_printed

        # sync payment
        if doc.paid_amount > 0 and not getattr(doc.flags, "ignore_payment_sync", False):

            target.set("payments", [])

            for p in doc.payments:
                target.append("payments", {
                    "mode_of_payment": p.mode_of_payment,
                    "amount": target.rounded_total,
                    "base_amount": target.rounded_total,
                    "account": getattr(p, "account", None)
                })

            target.paid_amount = target.rounded_total

        # sync submit/payment status
        if doc.docstatus == 1 and target.docstatus == 0:

            target.flags.ignore_validate_update_after_submit = True

            if target.docstatus == 0:
                target.save(ignore_permissions=True)
                target.submit()

        else:
            target.save(ignore_permissions=True)

        frappe.publish_realtime(
            "pos_invoice_updated",
            {
                "name": target.name,
                "docstatus": target.docstatus,
                "paid_amount": target.paid_amount,
                "invoice_printed": target.invoice_printed
            }
        )

    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Merged Invoice Sync Failed"
        )

    finally:
        frappe.flags.in_bill_merge_sync = False


def on_update(doc, method):
    sync_merged_invoice(doc)


def on_submit(doc, method):
    sync_merged_invoice(doc)
    release_merged_tables(doc)

def release_merged_tables(doc):

    invoices = [doc]

    if doc.custom_merged_pos_invoice:
        try:
            invoices.append(
                frappe.get_doc(
                    "POS Invoice",
                    doc.custom_merged_pos_invoice
                )
            )
        except Exception:
            pass

    for invoice in invoices:

        # only release dine in tables
        if invoice.order_type != "Dine In":
            continue

        if not invoice.restaurant_table:
            continue

        frappe.db.set_value(
            "URY Table",
            invoice.restaurant_table,
            {
                "occupied": 0,
                "latest_invoice_time": None,
            },
            update_modified=False,
        )

def validate_cancellation(doc):
    if not doc.pos_profile:
        return
        
    pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
    
    # 1. Role-based Table Order Restriction
    if doc.order_type == "Dine In" and pos_profile.get("role_restricted_for_table_order"):
        restricted_roles = [r.role for r in pos_profile.role_restricted_for_table_order]
        user_roles = frappe.get_roles(frappe.session.user)
        if set(user_roles).intersection(set(restricted_roles)):
            frappe.throw("You do not have permission to cancel this Table Order.")
    # 2. Disable cancellation after printing check
    if pos_profile.get("custom_disable_pos_invoice_cancellation_after_printing") == 1 and doc.invoice_printed == 1:
        frappe.throw("Cannot cancel POS Invoice after it has been printed.")
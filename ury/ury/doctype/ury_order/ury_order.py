# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.model.document import Document
from erpnext.controllers.queries import item_query
from ury.ury_pos.api import getBranch
from frappe import cache


class URYOrder(Document):
    pass


@frappe.whitelist()
def get_order_invoice(table=None, invoiceNo=None, is_payment=None):
    """returns the active invoice linked to the given table"""

    if table:
        if is_payment == "Payments":
            invoice_name = frappe.get_value(
                "POS Invoice", dict(restaurant_table=table, docstatus=0, name=invoiceNo)
            )
        else:
            if invoiceNo:
                invoice_name = frappe.get_value(
                    "POS Invoice",
                    dict(
                        restaurant_table=table, docstatus=0, invoice_printed=invoiceNo
                    ),
                )
            else:
                invoice_name = frappe.get_value(
                    "POS Invoice",
                    dict(restaurant_table=table, docstatus=0, invoice_printed=0),
                )
        # invoice_name = frappe.get_value("POS Invoice", dict(restaurant_table=table, docstatus=0, invoice_printed=0))
        branch, menu_name, restaurant = get_restaurant_and_menu_name(table)

        if invoice_name:
            invoice = frappe.get_doc("POS Invoice", invoice_name)

        else:
            invoice = frappe.new_doc("POS Invoice")

            invoice.naming_series = frappe.db.get_value(
                "URY Restaurant", restaurant, "invoice_series_prefix"
            )

            invoice.is_pos = 1
            invoice.restaurant = restaurant
            invoice.branch = branch

            is_take_away = frappe.db.get_value("URY Table", table, "is_take_away")
            if is_take_away == 1:
                invoice.order_type = "Take Away"

        invoice.taxes_and_charges = frappe.db.get_value(
            "URY Restaurant", restaurant, "default_tax_template"
        )

        invoice.selling_price_list = frappe.db.get_value(
            "Price List", dict(restaurant_menu=menu_name, enabled=1)
        )

    else:
        if is_payment == "Payments":
            invoice_name = frappe.get_value(
                "POS Invoice", dict(restaurant_table=table, docstatus=0, name=invoiceNo)
            )
        else:
            invoice_name = frappe.get_value(
                "POS Invoice", dict(docstatus=0, name=invoiceNo, invoice_printed=0)
            )
        if invoice_name:
            invoice = frappe.get_doc("POS Invoice", invoice_name)

        else:
            invoice = frappe.new_doc("POS Invoice")
            invoice.is_pos = 1
        invoice.taxes_and_charges = frappe.db.get_value(
            "POS Profile", invoice.pos_profile, "taxes_and_charges"
        )

    return invoice


@frappe.whitelist()
def sync_order(
    items,
    cashier,
    mode_of_payment,
    customer,
    no_of_pax,
    last_invoice,
    waiter,
    pos_profile,
    last_modified_time=None,
    table=None,
    invoice=None,
    comments=None,
):
    """Sync the sales order related to the table"""

    if (
        last_invoice
        and frappe.db.get_value("POS Invoice", last_invoice, "invoice_printed") == 1
        and not cashier
    ):
        frappe.msgprint(
            title="Invoice Already Billed",
            indicator="red",
            msg=("This order has already been billed. Please reload the page."),
        )
        return {"status": "Failure"}

    invoice = get_order_invoice(table, invoice)

    if last_invoice and last_modified_time:
        lastModifiedTime = invoice.modified
        from datetime import datetime

        if isinstance(last_modified_time, str):
            try:
                last_modified_time = datetime.strptime(
                    last_modified_time, "%Y-%m-%d %H:%M:%S.%f"
                )
            except ValueError:
                last_modified_time = datetime.strptime(
                    last_modified_time, "%Y-%m-%d %H:%M:%S"
                )
        if isinstance(lastModifiedTime, str):
            try:
                lastModifiedTime = datetime.strptime(
                    lastModifiedTime, "%Y-%m-%d %H:%M:%S.%f"
                )
            except ValueError:
                lastModifiedTime = datetime.strptime(
                    lastModifiedTime, "%Y-%m-%d %H:%M:%S"
                )
        if lastModifiedTime != last_modified_time:
            frappe.msgprint(
                title="Order has been modified",
                indicator="red",
                msg=(
                    "This order has been modified. Please reload the page to retrieve the latest edits."
                ),
            )
            return {"status": "Failure"}
    else:
        if invoice.name and invoice.invoice_printed == 0 and table and not cashier:
            frappe.msgprint(
                title="Table occupied ",
                indicator="red",
                msg=(
                    "This table ({0}) is already    . Please refresh the page."
                ).format(table),
            )
            return {"status": "Failure"}

    invoice.customer = customer

    customerdoc = frappe.get_doc("Customer", customer)
    invoice.mobile_number = customerdoc.mobile_number

    invoice.no_of_pax = no_of_pax
    invoice.pos_profile = pos_profile
    invoice.cashier = cashier
    invoice.waiter = waiter
    invoice.restaurant_table = table
    price_list = invoice.selling_price_list

    # dummy payment
    if invoice.invoice_created == 0:
        invoice.append(
            "payments",
            dict(mode_of_payment=mode_of_payment, amount=invoice.grand_total),
        )
        invoice.invoice_created = 1

    past_item = []
    for item in invoice.items:
        previous_item = {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "qty": item.qty,
            "comments": "",
        }
        past_item.append(previous_item)

    # conditional checking for ury and for ury pos
    if isinstance(items, str):
        items = json.loads(items)
        invoice.items = []
        for d in items:
            invoice.append(
                "items",
                dict(
                    item_code=d.get("item"),
                    item_name=d.get("item_name"),
                    qty=d.get("qty"),
                    comment=d.get("comment"),
                ),
            )
        for item in invoice.items:
            item_prices = frappe.db.get_list(
                "Item Price",
                filters={"item_code": item.item_code, "price_list": price_list},
                fields=["price_list_rate"],
            )
            for price in item_prices:
                item.rate = price.price_list_rate

        invoice.save()

    else:
        invoice.items = []
        for d in items:
            invoice.append(
                "items",
                dict(
                    item_code=d.get("item"),
                    item_name=d.get("item_name"),
                    qty=d.get("qty"),
                    comment=d.get("comment"),
                ),
            )

        for item in invoice.items:
            item_prices = frappe.db.get_list(
                "Item Price",
                filters={"item_code": item.item_code, "price_list": price_list},
                fields=["price_list_rate"],
            )
            for price in item_prices:
                item.rate = price.price_list_rate

        invoice.save()

    try:
        apps = frappe.get_single("Installed Applications").installed_applications
        app_array = [app.app_name for app in apps if app.app_name == "ury_mosaic"]

        if app_array:
            from ury_mosaic.ury_mosaic.api.ury_kot_generate import kot_execute

            kot_execute(invoice.name, customer, table, items, past_item, comments)

    except Exception as e:
        # If an exception occurs (e.g., "kot" app not found), it will be caught here without affect the code execution.
        pass

    # table status
    if invoice.invoice_printed == 0:
        frappe.db.set_value(
            "URY Table", table, {"occupied": 1, "latest_invoice_time": invoice.creation}
        )

    invoice.db_set("owner", cashier)
    return invoice.as_dict()


@frappe.whitelist()
def item_query_restaurant(
    doctype="Item",
    txt="",
    searchfield="name",
    start=0,
    page_len=20,
    filters=None,
    as_dict=False,
):
    """Return items that are selected in active menu of the restaurant"""
    restaurant, menu = get_restaurant_and_menu_name(filters["table"])
    items = frappe.db.get_all("URY Menu Item", ["item"], dict(parent=menu, disabled=0))
    del filters["table"]
    filters["name"] = ("in", [d.item for d in items])

    return item_query("Item", txt, searchfield, start, page_len, filters, as_dict)


@frappe.whitelist()
def get_restaurant_and_menu_name(table):
    if not table:
        frappe.throw(_("Please select a table"))

    restaurant, branch, room = frappe.get_value(
        "URY Table",
        table,
        ["restaurant", "branch", "restaurant_room"],
    )
    room_wise_menu = frappe.db.get_value(
        "URY Restaurant",
        restaurant,
        "room_wise_menu",
    )

    if not room_wise_menu:
        menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
    else:
        menu = frappe.db.get_value(
            "Menu for Room",
            {"parent": restaurant, "room": room},
            "menu",
        )

    if not menu:
        frappe.throw(
            _("Please set an active menu for Restaurant {0}").format(restaurant)
        )

    return branch, menu, restaurant


@frappe.whitelist()
def pos_opening_check():
    branch = getBranch()
    pos_opening_list = frappe.get_all(
        "POS Opening Entry",
        filters={"branch": branch, "status": "Open", "docstatus": 1},
    )
    result = {
        "opening_exists": len(pos_opening_list) > 0,
        "cashier": None,
        "pos_profile": None,
    }

    if result["opening_exists"]:
        # If POS opening entry exists, fetch the cashier from the first entry
        opening_entry = frappe.get_doc("POS Opening Entry", pos_opening_list[0].name)
        result[
            "cashier"
        ] = (
            opening_entry.user
        )  # Fetch values from POS Profile linked to POS Opening Entry
        result["pos_profile"] = opening_entry.pos_profile

    return result


@frappe.whitelist()
def table_transfer(table, newTable, invoice):
    current_table = frappe.get_doc("URY Table", table)
    pos_invoice = frappe.get_doc("POS Invoice", invoice)
    new_table = frappe.get_doc("URY Table", newTable)

    if new_table.occupied == 1:
        frappe.throw(f"Table {new_table.name} is already occupied")

    # Update table status
    frappe.db.set_value(
        "URY Table",
        new_table.name,
        {"occupied": 1, "latest_invoice_time": pos_invoice.creation},
    )
    frappe.db.set_value(
        "URY Table", current_table.name, {"occupied": 0, "latest_invoice_time": None}
    )

    # Update POS Invoice
    pos_invoice.restaurant_table = new_table.name
    pos_invoice.save()

    try:
        apps = frappe.get_single("Installed Applications").installed_applications
        app_array = [app.app_name for app in apps if app.app_name == "ury_mosaic"]

        if app_array:
            change_table_in_kot(pos_invoice.name, new_table.name, pos_invoice.branch)

    except Exception as e:
        # If an exception occurs (e.g., "kot" app not found), it will be caught here without effecting execution
        pass


@frappe.whitelist()
def captain_transfer(currentCaptain, newCaptain, invoice):
    current_captain_doc = frappe.get_doc("User", currentCaptain)
    pos_invoice = frappe.get_doc("POS Invoice", invoice)
    new_captain_doc = frappe.get_doc("User", newCaptain)

    # Update the waiter field of the POS Invoice
    pos_invoice.waiter = new_captain_doc.name
    pos_invoice.save()


@frappe.whitelist()
def customer_favourite_item(customer_name):
    pos = frappe.db.get_list(
        "POS Invoice", filters={"customer": customer_name}, fields=["name"]
    )

    item_qty = {}

    for invoice in pos:
        pos_invoice = frappe.get_doc("POS Invoice", invoice)
        for item in pos_invoice.items:
            item_name = item.item_name
            item_qty[item_name] = item_qty.get(item_name, 0) + item.qty

    result = [
        {"item_name": item_name, "qty": qty}
        for item_name, qty in item_qty.items()
        if qty > 1
    ]
    result = sorted(result, key=lambda x: x["qty"], reverse=True)[:3]

    return result


@frappe.whitelist()
def cancel_order(invoice_id, reason):
    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)

    # Update table status
    frappe.db.set_value(
        "URY Table",
        pos_invoice.restaurant_table,
        {"occupied": 0, "latest_invoice_time": None},
    )

    try:
        apps = frappe.get_single("Installed Applications").installed_applications
        app_array = [app.app_name for app in apps if app.app_name == "ury_mosaic"]

        if app_array:
            cancel_kot(invoice_id)

    except Exception as e:
        # If an exception occurs (e.g., "kot" app not found), it will be caught here without effecting execution
        pass

    # Update invoice status
    frappe.db.update(
        "POS Invoice",
        invoice_id,
        {"docstatus": 2, "status": "Cancelled", "cancel_reason": reason},
    )


# Method for URY POS
@frappe.whitelist()
def make_invoice(customer, payments, cashier, pos_profile, table=None, invoice=None):
    """Make table based on Sales Order"""
    invoice = get_order_invoice(table, invoice, "Payments")

    if table:
        restaurant = get_restaurant_and_menu_name(table)
        invoice.restaurant = restaurant

    invoice.customer = customer
    invoice.pos_profile = pos_profile
    invoice.calculate_taxes_and_totals()

    for pay in invoice.payments:
        pay.delete(pay.mode_of_payment)

    for d in payments:
        invoice.append(
            "payments", dict(mode_of_payment=d["mode_of_payment"], amount=d["amount"])
        )

    invoice.owner = cashier
    invoice.save()
    invoice.submit()


# Cancel KOT Doc Creation
def cancel_kot(invoice_id):
    from ury_mosaic.ury_mosaic.api.ury_kot_generate import process_items_for_cancel_kot

    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)
    pos_profile_id = pos_invoice.pos_profile
    pos_profile = frappe.get_doc("POS Profile", pos_profile_id)
    kot_naming_series = pos_profile.custom_kot_naming_series
    cancel_kot_naming_series = "CNCL-" + kot_naming_series

    items = []
    # Create a list of items for the canceled KOT
    for item in pos_invoice.items:
        order_item = {
            "item_code": item.get("item", item.get("item_code")),
            "qty": item.qty,
            "item_name": item.item_name,
        }
        items.append(order_item)

    if pos_invoice.restaurant_table:
        restaurant_table = pos_invoice.restaurant_table
    else:
        restaurant_table = None

    # Process items for a canceled KOT
    process_items_for_cancel_kot(
        invoice_id,
        pos_invoice.customer,
        restaurant_table,
        items,
        "",
        pos_profile_id,
        cancel_kot_naming_series,
        "Cancelled",
        items,
    )

    # Set the KOTs associated with the invoice as canceled
    kot_list = frappe.db.get_list(
        "URY KOT",
        filters={
            "invoice": invoice_id,
            "type": ("in", ("New Order", "Order Modified")),
            "docstatus": 1,
        },
        fields=("*"),
    )

    for item in kot_list:
        kot_doc = frappe.get_doc("URY KOT", item.name)
        kot_doc.docstatus = 2
        kot_doc.save()


def change_table_in_kot(invoice, new_table, branch):
    # Get a list of KOTs associated with the POS Invoice
    kot_list = frappe.get_all(
        "URY KOT",
        filters={
            "invoice": invoice,
            "docstatus": 1,
            "order_status": "Ready For Prepare",
            "verified": 0,
        },
    )

    # Update each KOT's restaurant_table and send a real-time update
    for kot in kot_list:
        frappe.db.set_value("URY KOT", kot.name, "restaurant_table", new_table)
        production = frappe.db.get_value("URY KOT", kot.name, "production")
        kot_channel = "{}_{}_{}".format("kot_update", branch, production)
        frappe.publish_realtime(kot_channel)

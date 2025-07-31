import frappe
import json

from frappe.utils import get_datetime, datetime


def kotValidationThread():
    current_datetime = get_datetime()
    one_minute_ago = current_datetime - datetime.timedelta(minutes=1)
    five_minutes_ago = current_datetime - datetime.timedelta(minutes=5)

    # Get a list of unprocessed invoices within the last 5 minutes
    invoice_list = get_unprocessed_invoices(five_minutes_ago, one_minute_ago)

    # Process each invoice
    for invoice in invoice_list:
        process_invoice(invoice)


# Function to fetch unprocessed invoices within a time range
def get_unprocessed_invoices(start_time, end_time):
    return frappe.db.sql(
        """
        SELECT name, creation
        FROM `tabPOS Invoice`
        WHERE docstatus = 0
            AND creation BETWEEN %s AND %s
        """,
        (start_time, end_time),
        as_dict=True,
    )


# Function to process an invoice
def process_invoice(invoice):
    posInvoice = frappe.get_doc("POS Invoice", invoice)
    waiter = posInvoice.waiter
    pos_profile = frappe.get_doc("POS Profile", posInvoice.pos_profile)

    # Determine the owner based on the restaurant table
    owner = waiter if not invoice.restaurant_table else waiter

    kot_naming_series = pos_profile.kot_naming_series
    kot_list = frappe.get_list(
        "URY KOT",
        filters={"creation": (">", posInvoice.creation), "invoice": posInvoice.name},
    )

    # If no KOT exists for the invoice, process it
    if not kot_list:
        production_items = []
        productionDoc = None

        # Fetch production units for the branch
        productions = get_productions_for_branch(posInvoice.branch)

        for p in productions:
            productionDoc = frappe.get_doc("URY Production Unit", p.name)
            productionItemGroups = [
                item_group.item_group for item_group in productionDoc.item_groups
            ]
            p_flag = 0

            # Check if items in the invoice belong to production groups
            for i in posInvoice.items:
                item = frappe.get_doc("Item", i.item_code)
                if item.item_group in productionItemGroups:
                    p_flag = 1
                    production_items.append(i)

            if p_flag == 1:
                create_kot(
                    invoice,
                    pos_profile,
                    kot_naming_series,
                    production_items,
                    owner,
                    p.name,
                )


# Function to fetch production units for a branch
def get_productions_for_branch(branch):
    return frappe.get_all(
        "URY Production Unit", filters={"branch": branch}, fields=["name", "item_groups"]
    )


# Function to create a KOT
def create_kot(
    invoice, pos_profile, kot_naming_series, production_items, owner, production_name
):
    posInvoice = frappe.get_doc("POS Invoice", invoice)
    kotdoc = frappe.new_doc("URY KOT")
    kotdoc.update(
        {
            "invoice": posInvoice.name,
            "restaurant_table": posInvoice.restaurant_table,
            "naming_series": kot_naming_series,
            "type": "Duplicate",
            "pos_profile": pos_profile.name,
            "customer_name": posInvoice.customer,
            "production": production_name,
            "order_no": posInvoice.order_no
            if hasattr(posInvoice, "order_no")
            else None,
        }
    )

    for pr in production_items:
        kotdoc.append(
            "kot_items",
            {"item": pr.item_code, "item_name": pr.item_name, "quantity": pr.qty},
        )

    kotdoc.insert()
    kotdoc.submit()
    kotdoc.db_set("owner", owner)

    # Create a KOT Log entry
    create_kot_log(kotdoc, invoice)


# Function to create a KOT Log entry
def create_kot_log(kotdoc, invoice):
    posInvoice = frappe.get_doc("POS Invoice", invoice)
    KOTLog = frappe.new_doc("URY KOT Error Log")
    KOTLog.update(
        {
            "kot": kotdoc.name,
            "invoice": posInvoice.name,
            "invoice_creation_time": posInvoice.creation,
        }
    )

    KOTLog.insert()

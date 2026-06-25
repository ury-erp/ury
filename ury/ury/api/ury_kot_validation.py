import frappe
from frappe.utils import get_datetime, datetime


def kotValidationThread():
    current_datetime = get_datetime()
    one_minute_ago = current_datetime - datetime.timedelta(minutes=1)
    five_minutes_ago = current_datetime - datetime.timedelta(minutes=5)

    # Get a list of unprocessed invoices within the last 5 minutes
    invoice_list = get_unprocessed_invoices(five_minutes_ago, one_minute_ago)

    # Process each invoice independently so one failure doesn't block others
    for invoice in invoice_list:
        try:
            process_invoice(invoice)
        except Exception:
            frappe.log_error("URY KOT Validation Error", f"Failed to process invoice {invoice.name}")


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


def process_invoice(invoice):
    posInvoice = frappe.get_doc("POS Invoice", invoice.name)
    waiter = posInvoice.waiter
    pos_profile = frappe.get_doc("POS Profile", posInvoice.pos_profile)
    kot_naming_series = pos_profile.kot_naming_series

    # Check if KOT already exists for this invoice
    kot_list = frappe.get_list(
        "URY KOT",
        filters={"creation": (">", posInvoice.creation), "invoice": posInvoice.name},
    )

    if kot_list:
        return  # KOT already generated, nothing to do

    # Fetch production units for the branch
    productions = get_productions_for_branch(posInvoice.branch)

    # Batch-fetch all item groups to avoid N+1 queries
    item_codes = list({i.item_code for i in posInvoice.items})
    item_groups = {}
    if item_codes:
        for item_code in item_codes:
            item_groups[item_code] = frappe.db.get_value("Item", item_code, "item_group")

    # Group invoice items by production unit
    for production in productions:
        productionDoc = frappe.get_doc("URY Production Unit", production.name)
        production_item_groups = {
            ig.item_group for ig in productionDoc.item_groups
        }

        # Filter items belonging to this production unit
        production_items = [
            i for i in posInvoice.items
            if item_groups.get(i.item_code) in production_item_groups
        ]

        if production_items:
            create_kot(
                posInvoice,
                pos_profile,
                kot_naming_series,
                production_items,
                waiter,
                production.name,
            )


def get_productions_for_branch(branch):
    return frappe.get_all(
        "URY Production Unit",
        filters={"branch": branch},
        fields=["name", "item_groups"],
    )


def create_kot(
    posInvoice, pos_profile, kot_naming_series, production_items, owner, production_name
):
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
            "order_no": getattr(posInvoice, "order_no", None),
        }
    )

    for item in production_items:
        kotdoc.append(
            "kot_items",
            {
                "item": item.item_code,
                "item_name": item.item_name,
                "quantity": item.qty,
            },
        )

    kotdoc.insert()
    kotdoc.submit()
    kotdoc.db_set("owner", owner)

    # Create a KOT Log entry
    create_kot_log(kotdoc, posInvoice)


def create_kot_log(kotdoc, posInvoice):
    KOTLog = frappe.new_doc("URY KOT Error Log")
    KOTLog.update(
        {
            "kot": kotdoc.name,
            "invoice": posInvoice.name,
            "invoice_creation_time": posInvoice.creation,
        }
    )
    KOTLog.insert()
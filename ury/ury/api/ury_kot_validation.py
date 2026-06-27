import frappe
from datetime import timedelta
from frappe.utils import get_datetime


def kotValidationThread():
    current_datetime = get_datetime()
    one_minute_ago = current_datetime - timedelta(minutes=1)
    five_minutes_ago = current_datetime - timedelta(minutes=5)

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
    kot_naming_series = frappe.db.get_value("POS Profile", posInvoice.pos_profile, "custom_kot_naming_series")

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
        rows = frappe.db.get_all("Item", filters={"name": ("in", item_codes)}, fields=["name", "item_group"])
        item_groups = {r.name: r.item_group for r in rows}

    # Batch-fetch production unit item groups
    production_names = [p.name for p in productions]
    prod_item_groups = {}
    if production_names:
        pig_rows = frappe.db.get_all(
            "URY Production Unit Item Group",
            filters={"parent": ("in", production_names)},
            fields=["parent", "item_group"],
        )
        for r in pig_rows:
            prod_item_groups.setdefault(r.parent, set()).add(r.item_group)

    # Group invoice items by production unit
    for production in productions:
        production_item_groups = prod_item_groups.get(production.name, set())

        # Filter items belonging to this production unit
        production_items = [
            i for i in posInvoice.items
            if item_groups.get(i.item_code) in production_item_groups
        ]

        if production_items:
            create_kot(
                posInvoice,
                posInvoice.pos_profile,
                kot_naming_series,
                production_items,
                waiter,
                production.name,
            )


def get_productions_for_branch(branch):
    return frappe.get_all(
        "URY Production Unit",
        filters={"branch": branch},
        fields=["name"],
    )


def create_kot(
    posInvoice, pos_profile_name, kot_naming_series, production_items, owner, production_name
):
    kotdoc = frappe.new_doc("URY KOT")
    kotdoc.update(
        {
            "invoice": posInvoice.name,
            "restaurant_table": posInvoice.restaurant_table,
            "naming_series": kot_naming_series,
            "type": "Duplicate",
            "pos_profile": pos_profile_name,
            "customer_name": posInvoice.customer,
            "production": production_name,
            "order_no": getattr(posInvoice, "custom_ury_order_number", None),
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
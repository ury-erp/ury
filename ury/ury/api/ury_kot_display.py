import json

import frappe
from ury.ury_pos.api import getBranch
from frappe.utils import get_datetime


# Function to set order status in a KOT document
@frappe.whitelist()
def serve_kot(name, time):
    current_time = get_datetime()
    creation_time = frappe.db.get_value("URY KOT", name, "creation")

    production_time = current_time - creation_time
    production_time_minutes = production_time.total_seconds() / 60
    frappe.db.set_value("URY KOT", name, "start_time_serv", time)
    frappe.db.set_value("URY KOT", name, "production_time", production_time_minutes)
    frappe.db.set_value("URY KOT", name, "order_status", "Served")


# Function to mark it as verified by a user in cancel type KOT
@frappe.whitelist()
def confirm_cancel_kot(name, user):
    frappe.db.set_value("URY KOT", name, "verified", 1)
    frappe.db.set_value("URY KOT", name, "verified_by", user)


@frappe.whitelist(allow_guest=True)
def get_site_name():
    return {"site_name": frappe.local.site}


def _build_kot_response(kots, branch, status_filter):
    """Shared logic for kot_list and served_kot_list with batch queries."""
    today = frappe.utils.now()
    kot_alert_time = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_kot_warning_time"
    )
    daily_order_number = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_reset_order_number_daily"
    )
    three_hours_ago = frappe.utils.add_to_date(today, hours=-3)
    audio_alert = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_kot_alert"
    )

    # Step 1: Get all KOT names matching the status filter
    kot_list = frappe.get_list(
        "URY KOT",
        fields=["name"],
        filters={
            "order_status": status_filter,
            "branch": branch,
            "type": [
                "in",
                [
                    "New Order",
                    "Order Modified",
                    "Duplicate",
                    "Cancelled",
                    "Partially cancelled",
                ],
            ],
            "docstatus": 1,
            "verified": 0,
            "creation": (">=", three_hours_ago),
        },
        order_by="creation desc",
    )

    if not kot_list:
        return {
            "KOT": [],
            "Branch": branch,
            "kot_alert_time": kot_alert_time,
            "audio_alert": audio_alert,
            "daily_order_number": daily_order_number,
        }

    kot_names = [k.name for k in kot_list]

    # Step 2: Batch-fetch all KOT headers (no child tables yet)
    kot_headers = frappe.get_all(
        "URY KOT",
        filters={"name": ("in", kot_names)},
        fields=[
            "name", "invoice", "restaurant_table", "customer_name", "type",
            "order_status", "production", "start_time_prep", "start_time_serv",
            "pos_profile", "comments", "branch", "verified", "order_no",
            "customer_group", "table_takeaway", "user", "aggregator_id",
            "is_aggregator", "production_time",
        ],
    )
    kot_map = {k.name: k for k in kot_headers}

    # Step 3: Batch-fetch KOT items for all KOTs
    kot_items = frappe.get_all(
        "URY KOT Items",
        filters={"parent": ("in", kot_names)},
        fields=["parent", "item", "item_name", "quantity", "cancelled_qty", "comments", "course", "serve_priority"],
    )
    items_by_kot = {}
    for item in kot_items:
        items_by_kot.setdefault(item.parent, []).append(item)

    # Step 4: Batch-fetch production unit order_type config (cached per unit)
    production_units_seen = set()
    for k in kot_headers:
        if k.production:
            production_units_seen.add(k.production)

    production_filters = {}
    if production_units_seen:
        pu_docs = frappe.get_all(
            "URY Production Unit",
            filters={"name": ("in", list(production_units_seen))},
            fields=["name", "enable_order_type_wise_display_on_mosaic"],
        )
        pu_map = {p.name: p for p in pu_docs}

        # Batch-fetch order_type child rows for enabled units
        enabled_units = [p.name for p in pu_docs if p.enable_order_type_wise_display_on_mosaic]
        order_type_rows = []
        if enabled_units:
            order_type_rows = frappe.get_all(
                "URY Production Unit Order Type",
                filters={"parent": ("in", enabled_units)},
                fields=["parent", "order_type"],
            )
        ot_by_unit = {}
        for row in order_type_rows:
            ot_by_unit.setdefault(row.parent, []).append(row.order_type)

        for pu_name, pu_doc in pu_map.items():
            if pu_doc.enable_order_type_wise_display_on_mosaic:
                production_filters[pu_name] = ot_by_unit.get(pu_name, [])
            else:
                production_filters[pu_name] = None

    # Step 5: Batch-fetch invoice order_types for filtering
    invoices_needing_type = set()
    for k in kot_headers:
        if k.production and production_filters.get(k.production) is not None and k.invoice:
            invoices_needing_type.add(k.invoice)

    invoice_order_types = {}
    if invoices_needing_type:
        rows = frappe.db.get_values(
            "POS Invoice",
            {"name": ("in", list(invoices_needing_type))},
            ["name", "order_type"],
            as_dict=True,
        )
        invoice_order_types = {r.name: r.order_type for r in rows}

    # Step 6: Assemble final KOT list with filtering
    KOT = []
    for header in kot_headers:
        # Apply production unit order_type filtering
        if header.production:
            allowed = production_filters.get(header.production)
            if allowed is not None:
                inv_type = invoice_order_types.get(header.invoice)
                if inv_type not in allowed:
                    continue

        # Build the full KOT document structure (matches what get_doc + as_json produced)
        kot_doc = {
            "name": header.name,
            "doctype": "URY KOT",
            "invoice": header.invoice,
            "restaurant_table": header.restaurant_table,
            "customer_name": header.customer_name,
            "type": header.type,
            "order_status": header.order_status,
            "production": header.production,
            "start_time_prep": header.start_time_prep,
            "start_time_serv": header.start_time_serv,
            "pos_profile": header.pos_profile,
            "comments": header.comments,
            "branch": header.branch,
            "verified": header.verified,
            "order_no": header.order_no,
            "customer_group": header.customer_group,
            "table_takeaway": header.table_takeaway,
            "user": header.user,
            "aggregator_id": header.aggregator_id,
            "is_aggregator": header.is_aggregator,
            "production_time": header.production_time,
            "kot_items": items_by_kot.get(header.name, []),
        }
        KOT.append(kot_doc)

    return {
        "KOT": KOT,
        "Branch": branch,
        "kot_alert_time": kot_alert_time,
        "audio_alert": audio_alert,
        "daily_order_number": daily_order_number,
    }


@frappe.whitelist()
def kot_list():
    branch = getBranch()
    return _build_kot_response([], branch, "Ready For Prepare")


@frappe.whitelist()
def served_kot_list():
    branch = getBranch()
    return _build_kot_response([], branch, "Served")
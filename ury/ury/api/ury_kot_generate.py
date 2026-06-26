import json

import frappe
from ury.ury_pos.api import getBranch


def load_json(data):
    """Parse JSON string or return as-is if already a dict."""
    if isinstance(data, str):
        return json.loads(data)
    return data


def create_order_items(items):
    """Convert raw item dicts to a normalized format."""
    order_items = []
    for item in items:
        order_item = {
            "item_code": item.get("item", item.get("item_code")),
            "qty": item["qty"],
            "item_name": item["item_name"],
            "comments": item.get("comment", item.get("comments", "")),
        }
        order_items.append(order_item)
    return order_items


def _get_menu_for_invoice(restaurant_table, branch):
    """Look up the active URY Menu for an invoice's table or branch."""
    if restaurant_table:
        room, restaurant = frappe.db.get_value(
            "URY Table", restaurant_table, ["restaurant_room", "restaurant"]
        )
        menu = frappe.db.get_value(
            "Menu for Room", {"room": room, "parent": restaurant}, "menu"
        )
        return menu
    else:
        return frappe.db.get_value("URY Restaurant", {"branch": branch}, "active_menu")


def _get_item_courses(item_codes, menu):
    """Batch-fetch course for all items in a single query."""
    if not item_codes:
        return {}
    rows = frappe.db.sql(
        """SELECT item, course FROM `tabURY Menu Item`
           WHERE parent = %s AND item IN %s""",
        (menu, item_codes),
        as_dict=True,
    )
    return {r.item: r.course for r in rows}


def _get_item_groups(item_codes):
    """Batch-fetch item_group for all item codes in a single query."""
    if not item_codes:
        return {}
    rows = frappe.db.sql(
        """SELECT name, item_group FROM `tabItem` WHERE name IN %s""",
        (item_codes,),
        as_dict=True,
    )
    return {r.name: r.item_group for r in rows}


def _get_production_item_groups(productions):
    """Fetch item_group for each production unit in batch."""
    if not productions:
        return {}

    production_names = [p.name for p in productions]
    rows = frappe.db.sql(
        """SELECT parent, item_group FROM `tabURY Production Item Groups`
           WHERE parenttype = 'URY Production Unit' AND parent IN %s
           ORDER BY idx""",
        (production_names,),
        as_dict=True,
    )
    groups = {}
    for row in rows:
        groups.setdefault(row.parent, []).append(row.item_group)
    return groups


def _get_existing_kots_with_items(invoice_id):
    """Fetch all submitted KOTs for an invoice and their items in one query."""
    rows = frappe.db.sql(
        """SELECT ki.parent as kot_name, ki.item
           FROM `tabURY KOT Item` ki
           INNER JOIN `tabURY KOT` k ON ki.parent = k.name
           WHERE k.invoice = %s AND k.docstatus = 1
               AND k.type IN ('New Order', 'Order Modified')""",
        (invoice_id,),
        as_dict=True,
    )
    # Build {item_code: [kot_name, ...]}
    result = {}
    for row in rows:
        result.setdefault(row.item, []).append(row.kot_name)
    return result


# ---------------------------------------------------------------------------
# KOT creation (New Order / Order Modified)
# ---------------------------------------------------------------------------

def create_kot_doc(
    invoice_id,
    customer,
    restaurant_table,
    items,
    kot_type,
    comments,
    pos_profile_id,
    kot_naming_series,
    production,
    pos_invoice,  # passed in to avoid re-fetching
    item_courses,  # pre-fetched {item_code: course}
):
    order_number = pos_invoice.custom_ury_order_number
    is_aggregator = 1 if pos_invoice.order_type == "Aggregators" else 0

    kot_doc = frappe.new_doc(
        {
            "doctype": "URY KOT",
            "invoice": invoice_id,
            "restaurant_table": restaurant_table,
            "customer_name": customer,
            "pos_profile": pos_profile_id,
            "comments": comments,
            "type": kot_type,
            "naming_series": kot_naming_series,
            "production": production,
            "aggregator_id": pos_invoice.custom_aggregator_id,
            "is_aggregator": is_aggregator,
            "order_no": order_number,
        }
    )

    for item in items:
        kot_doc.append(
            "kot_items",
            {
                "item": item["item_code"],
                "item_name": item["item_name"],
                "quantity": item["qty"],
                "comments": item["comments"],
                "course": item_courses.get(item["item_code"]),
            },
        )
    kot_doc.insert()
    kot_doc.submit()


def process_items_for_kot(
    invoice_id,
    customer,
    restaurant_table,
    items,
    comments,
    pos_profile_id,
    kot_naming_series,
    kot_type,
    pos_invoice,  # passed in to avoid re-fetching
    branch,
):
    productions = frappe.db.get_all(
        "URY Production Unit", filters={"branch": branch}, fields=["name"]
    )

    if not productions:
        frappe.throw(
            "Create URY Production unit against POS Profile: %s" % pos_profile_id
        )

    item_codes = [i["item_code"] for i in items]
    item_groups = _get_item_groups(item_codes)

    # Warn about items not in any production unit
    all_groups = set()
    prod_groups = _get_production_item_groups(productions)
    for groups in prod_groups.values():
        all_groups.update(groups)

    for item in items:
        ig = item_groups.get(item["item_code"])
        if ig and ig not in all_groups:
            frappe.msgprint(
                "Item group '%s' for item '%s' is not in any production."
                % (ig, item["item_code"])
            )

    # Fetch menu once for course lookups
    menu = _get_menu_for_invoice(restaurant_table, branch)
    item_courses = _get_item_courses(item_codes, menu) if menu else {}

    for production in productions:
        production_groups = set(prod_groups.get(production.name, []))
        production_items = [
            item
            for item in items
            if item_groups.get(item["item_code"]) in production_groups
        ]

        if not production_items:
            continue

        invoice_exist = frappe.db.exists(
            "URY KOT",
            {
                "invoice": invoice_id,
                "docstatus": 1,
                "production": production.name,
            },
        )
        actual_type = "Order Modified" if invoice_exist else kot_type

        create_kot_doc(
            invoice_id,
            customer,
            restaurant_table,
            production_items,
            actual_type,
            comments,
            pos_profile_id,
            kot_naming_series,
            production.name,
            pos_invoice,
            item_courses,
        )


# ---------------------------------------------------------------------------
# KOT creation (Cancelled / Partially cancelled)
# ---------------------------------------------------------------------------

def process_items_for_cancel_kot(
    invoice_id,
    customer,
    restaurant_table,
    items,
    comments,
    pos_profile_id,
    cancel_kot_naming_series,
    kot_type,
    invoiceItems,
    pos_invoice,  # passed in to avoid re-fetching
    branch,
):
    productions = frappe.db.get_all(
        "URY Production Unit", filters={"branch": branch}, fields=["name"]
    )

    item_codes = [i["item_code"] for i in items]
    item_groups = _get_item_groups(item_codes)
    prod_groups = _get_production_item_groups(productions)

    # Batch-fetch existing KOT items for this invoice
    kot_item_map = _get_existing_kots_with_items(invoice_id)

    # Fetch menu once
    menu = _get_menu_for_invoice(restaurant_table, branch)
    item_courses = _get_item_courses(item_codes, menu) if menu else {}

    for production in productions:
        production_groups = set(prod_groups.get(production.name, []))
        production_items = [
            item
            for item in items
            if item_groups.get(item["item_code"]) in production_groups
        ]

        if not production_items:
            continue

        # Find original KOTs that contain any of the cancelled items
        original_kots = set()
        for item in production_items:
            for kot_name in kot_item_map.get(item["item_code"], []):
                original_kots.add(kot_name)

        if not original_kots:
            continue

        create_cancel_kot_doc(
            invoice_id,
            restaurant_table,
            production_items,
            kot_type,
            customer,
            comments,
            pos_profile_id,
            cancel_kot_naming_series,
            invoiceItems,
            production.name,
            pos_invoice,
            original_kots,
            item_courses,
        )


def create_cancel_kot_doc(
    invoice_id,
    restaurant_table,
    cancel_items,
    kot_type,
    customer,
    comments,
    pos_profile_id,
    cancel_kot_naming_series,
    invoiceItems,
    production,
    pos_invoice,  # passed in
    original_kots,  # set of KOT names
    item_courses,  # pre-fetched
):
    order_number = pos_invoice.custom_ury_order_number
    is_aggregator = 1 if pos_invoice.order_type == "Aggregators" else 0

    kot_cancel_doc = frappe.new_doc(
        {
            "doctype": "URY KOT",
            "naming_series": cancel_kot_naming_series,
            "original_kot": ",".join(sorted(original_kots)),
            "restaurant_table": restaurant_table,
            "customer_name": customer,
            "type": kot_type,
            "invoice": invoice_id,
            "pos_profile": pos_profile_id,
            "comments": comments,
            "production": production,
            "is_aggregator": is_aggregator,
            "order_no": order_number,
        }
    )

    for cancelItem in cancel_items:
        matching_invoice_item = next(
            (i for i in invoiceItems if cancelItem["item_code"] == i["item_code"]),
            None,
        )
        if not matching_invoice_item:
            continue
        kot_cancel_doc.append(
            "kot_items",
            {
                "item": cancelItem["item_code"],
                "item_name": cancelItem["item_name"],
                "cancelled_qty": abs(int(cancelItem["qty"])),
                "quantity": matching_invoice_item["qty"],
                "comments": cancelItem["comments"],
                "course": item_courses.get(cancelItem["item_code"]),
            },
        )

    kot_cancel_doc.insert()
    kot_cancel_doc.submit()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

@frappe.whitelist()
def kot_execute(
    invoice_id,
    customer,
    restaurant_table=None,
    current_items=None,
    previous_items=None,
    comments=None,
):
    # Avoid mutable default argument pitfall
    current_items = load_json(current_items or [])
    previous_items = load_json(previous_items or [])

    new_invoice_items_array = create_order_items(previous_items)
    new_Order_items_array = create_order_items(current_items)

    final_array = compare_two_array(new_Order_items_array, new_invoice_items_array)
    removed_item = get_removed_items(new_invoice_items_array, new_Order_items_array)

    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)
    pos_profile_id = pos_invoice.pos_profile
    kot_naming_series = frappe.db.get_value(
        "POS Profile", pos_profile_id, "custom_kot_naming_series"
    )
    if kot_naming_series:
        cancel_kot_naming_series = "CNCL-" + kot_naming_series
    else:
        frappe.throw(
            "KOT Naming Series is mandatory for the auto creation of KOT. "
            "Ensure it is configured in the POS Profile: %s" % pos_profile_id
        )

    branch = getBranch()

    positive_qty_items = [item for item in final_array if int(item["qty"]) > 0]
    negative_qty_items = [item for item in final_array if int(item["qty"]) <= 0]
    total_cancel_items = negative_qty_items + removed_item

    # Common data fetched once and passed to both processors
    shared_kwargs = {
        "invoice_id": invoice_id,
        "customer": customer,
        "restaurant_table": restaurant_table,
        "comments": comments,
        "pos_profile_id": pos_profile_id,
        "pos_invoice": pos_invoice,
        "branch": branch,
    }

    if positive_qty_items:
        process_items_for_kot(
            **shared_kwargs,
            items=positive_qty_items,
            kot_naming_series=kot_naming_series,
            kot_type="New Order",
        )

    if total_cancel_items:
        process_items_for_cancel_kot(
            **shared_kwargs,
            items=total_cancel_items,
            cancel_kot_naming_series=cancel_kot_naming_series,
            kot_type="Partially cancelled",
            invoiceItems=new_invoice_items_array,
        )


# ---------------------------------------------------------------------------
# Array comparison helpers
# ---------------------------------------------------------------------------

def compare_two_array(array_1, array_2):
    """Return items in array_1 whose qty differs from array_2."""
    finalarray = []
    # Build a lookup for array_2 keyed by item_code
    array_2_by_code = {item["item_code"]: item for item in array_2}

    for x in array_1:
        code = x["item_code"]
        # Make a copy to avoid mutating the original dict
        item = dict(x)

        if code not in array_2_by_code:
            # Item was added (new)
            finalarray.append(item)
            continue

        if item["qty"] == array_2_by_code[code]["qty"]:
            # No change
            continue

        item["qty"] = int(item["qty"]) - int(array_2_by_code[code]["qty"])
        finalarray.append(item)

    return finalarray


def get_removed_items(array_1, array_2):
    """Return items present in array_1 but absent from array_2."""
    array_2_codes = {x["item_code"] for x in array_2}
    return [obj for obj in array_1 if obj["item_code"] not in array_2_codes]
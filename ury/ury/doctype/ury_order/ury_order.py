# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.model.document import Document
from erpnext.controllers.queries import item_query
from ury.ury_pos.api import getBranch, getBranchRoom
from ury.ury.api.ury_kot_generate import kot_execute
from ury.ury.api.ury_kot_generate import process_items_for_cancel_kot

from frappe import cache


class URYOrder(Document):
    pass

@frappe.whitelist()
def merge_free_tables(table1, table2):
    """Merges two tables in the same room; allows one occupied and one free."""
    return merge_tables_batch(table1, [table2])


@frappe.whitelist()
def merge_tables_batch(anchor_table, tables):

    if isinstance(tables, str):
        tables = json.loads(tables)

    targets = list(
        dict.fromkeys(
            t
            for t in tables
            if t and t != anchor_table
        )
    )

    if not targets:
        frappe.throw(
            _("Select at least one table to merge.")
        )

    room = frappe.db.get_value(
        "URY Table",
        anchor_table,
        "restaurant_room",
    )

    if not room:
        frappe.throw(
            _("Table not found.")
        )

    # Start from anchor cluster only
    cluster, table_map = _get_merge_cluster(
        anchor_table
    )

    cluster = set(cluster)

    for target in targets:

        target_room = frappe.db.get_value(
            "URY Table",
            target,
            "restaurant_room",
        )

        if target_room != room:
            frappe.throw(
                _("Cannot merge tables from different rooms.")
            )

        target_cluster, _ = _get_merge_cluster(
            target
        )

        # Prevent importing another merged group
        if len(target_cluster) > 1:
            frappe.throw(
                _(
                    "Cannot merge an already merged table."
                )
            )

        # Prevent occupied table merge
        occupied = frappe.db.get_value(
            "URY Table",
            target,
            "occupied",
        )

        if occupied:
            frappe.throw(
                _("Occupied tables cannot be merged.")
            )

        cluster.add(target)

    if _count_separate_active_orders(cluster) > 1:
        frappe.throw(
            _(
                "Cannot merge tables with separate active orders."
            )
        )

    cluster = sorted(cluster)

    # Make relationships symmetric
    for table in cluster:

        partners = [
            t
            for t in cluster
            if t != table
        ]

        frappe.db.set_value(
            "URY Table",
            table,
            "merged_with",
            ",".join(partners)
            if partners
            else None,
            update_modified=False,
        )

    # Sync order only to selected cluster
    _sync_active_order_with_merge_cluster(
        anchor_table
    )

    _reconcile_open_invoices_for_tables(
        cluster
    )

    frappe.db.commit()

    return True
def _append_merged_partner(table_name, partner):
    merged = frappe.db.get_value(
        "URY Table",
        table_name,
        "merged_with"
    ) or ""
    partners = _parse_merged_with(merged)
    if partner not in partners:
        partners.append(partner)
    frappe.db.set_value(
        "URY Table",
        table_name,
        "merged_with",
        ",".join(sorted(set(partners))),
    )

def _sync_active_order_with_merge_cluster(table):

    members = _get_cluster_table_names(table)

    invoices = frappe.get_all(
        "POS Invoice",
        filters={
            "docstatus": 0,
            "invoice_printed": 0,
        },
        fields=[
            "name",
            "restaurant_table",
            "creation",
        ],
    )

    active = [
        x
        for x in invoices
        if x.restaurant_table in members
    ]

    if not active:
        return

    primary = sorted(
        active,
        key=lambda x: x.creation
    )[0]

    merged_tables = ",".join(
        sorted(
            [
                x
                for x in members
                if x != primary.restaurant_table
            ]
        )
    )

    frappe.db.set_value(
        "POS Invoice",
        primary.name,
        "custom_merged_tables",
        merged_tables,
        update_modified=False,
    )

    for table_name in members:

        frappe.db.set_value(
            "URY Table",
            table_name,
            {
                "occupied": 1,
                "latest_invoice_time": primary.creation,
            },
        )

def _parse_merged_with(merged_with):
    if not merged_with:
        return []
    return [partner.strip() for partner in merged_with.split(",") if partner.strip()]


def _table_has_active_order(table_name):
    return bool(
        frappe.db.exists(
            "POS Invoice",
            {
                "docstatus": 0,
                "restaurant_table": table_name,
                "invoice_printed": 0,
            },
        )
    )


def _count_separate_active_orders(table_names):
    return sum(1 for name in table_names if _table_has_active_order(name))


def _get_merge_cluster(table):
    room = frappe.db.get_value("URY Table", table, "restaurant_room")
    if not room:
        frappe.throw(_("Table not found."))

    room_tables = frappe.get_all(
        "URY Table",
        filters={"restaurant_room": room},
        fields=["name", "merged_with", "occupied"],
    )
    table_by_name = {row.name: row for row in room_tables}

    if table not in table_by_name:
        frappe.throw(_("Table not found."))

    visited = set()
    members = []
    queue = [table]

    while queue:
        name = queue.pop(0)
        if name in visited:
            continue
        visited.add(name)
        members.append(name)

        row = table_by_name.get(name)
        if not row:
            continue

        for partner in _parse_merged_with(row.merged_with):
            if partner in table_by_name and partner not in visited:
                queue.append(partner)

    return members, table_by_name


def _get_cluster_table_names(table):
    if not table:
        return []
    try:
        members, _ = _get_merge_cluster(table)
        return members
    except Exception:
        return [table]


def _merged_partners_for_primary(primary_table):
    if not primary_table:
        return []
    members = _get_cluster_table_names(primary_table)
    return sorted(name for name in members if name != primary_table)


def _merged_partners_csv(primary_table):
    partners = _merged_partners_for_primary(primary_table)
    return ",".join(partners) if partners else None


def _normalize_merged_partners_csv(csv_value):
    if not csv_value:
        return []
    return sorted(_parse_merged_with(csv_value))


def _reconcile_invoice_merged_tables(invoice, persist=False):
    """Align custom_merged_tables on an invoice with the live table merge cluster."""
    primary = invoice.get("restaurant_table")
    if not primary:
        return invoice

    expected = _merged_partners_for_primary(primary)
    current = _normalize_merged_partners_csv(invoice.get("custom_merged_tables"))

    if expected == current:
        return invoice

    partners_value = ",".join(expected) if expected else None
    invoice.custom_merged_tables = partners_value

    if persist and invoice.get("name"):
        frappe.db.set_value(
            "POS Invoice",
            invoice.name,
            "custom_merged_tables",
            partners_value,
            update_modified=False,
        )

    return invoice


def _open_invoice_names_for_table(table):
    names = set()
    for row in frappe.get_all(
        "POS Invoice",
        filters={"docstatus": 0, "restaurant_table": table},
        fields=["name"],
    ):
        names.add(row.name)
    for row in frappe.get_all(
        "POS Invoice",
        filters={"docstatus": 0, "custom_merged_tables": ["like", f"%{table}%"]},
        fields=["name"],
    ):
        names.add(row.name)
    return names


def _reconcile_open_invoices_for_tables(table_names):
    seen = set()
    for table in table_names:
        for invoice_name in _open_invoice_names_for_table(table):
            if invoice_name in seen:
                continue
            seen.add(invoice_name)
            invoice = frappe.get_doc("POS Invoice", invoice_name)
            _reconcile_invoice_merged_tables(invoice, persist=True)


TABLE_RELEASE_FIELDS = {
    "occupied": 0,
    "latest_invoice_time": None,
    "merged_with": None,
}


def release_merge_cluster_tables(table):

    cluster = _get_cluster_table_names(
        table
    )

    if _has_open_pos_invoices_for_cluster(
        cluster
    ):
        return

    for member in cluster:

        frappe.db.set_value(
            "URY Table",
            member,
            TABLE_RELEASE_FIELDS,
        )

    frappe.db.commit()

@frappe.whitelist()
def release_tables_after_print(invoice):

    invoice_doc = frappe.get_doc(
        "POS Invoice",
        invoice,
    )

    tables = _get_table_group(
        invoice_doc.restaurant_table,
        invoice_doc.custom_merged_tables,
    )

    for table in tables:

        frappe.db.set_value(
            "URY Table",
            table,
            {
                "occupied": 0,
                "latest_invoice_time": None,
            },
        )

    frappe.db.commit()

    return True


def _has_open_pos_invoices_for_cluster(tables):

    if not tables:
        return False

    for table in tables:

        invoices = frappe.get_all(
            "POS Invoice",
            filters={
                "docstatus": 0,
                "restaurant_table": table,
            },
            fields=[
                "name",
                "invoice_printed",
            ],
        )

        for inv in invoices:
            if inv.invoice_printed == 0:
                return True


        merged = frappe.get_all(
            "POS Invoice",
            filters={
                "docstatus": 0,
                "custom_merged_tables": ["like", f"%{table}%"],
            },
            fields=[
                "name",
                "invoice_printed",
            ],
        )

        for inv in merged:

            if inv.invoice_printed == 0:
                return True

    return False


@frappe.whitelist()
def unmerge_tables(table):

    cluster = _get_cluster_table_names(
        table
    )

    if len(cluster) <= 1:
        frappe.throw(
            _("Table is not merged.")
        )

    if _has_open_pos_invoices_for_cluster(
        cluster
    ):
        frappe.throw(
            _("Cannot unmerge active tables.")
        )

    for member in cluster:

        frappe.db.set_value(
            "URY Table",
            member,
            "merged_with",
            None,
        )

    frappe.db.commit()

    return True


def _get_table_group(restaurant_table, custom_merged_tables=None):
    tables = _get_cluster_table_names(restaurant_table)
    if custom_merged_tables:
        for table_name in custom_merged_tables.split(","):
            table_name = table_name.strip()
            if table_name and table_name not in tables:
                tables.append(table_name)
    return tables


def _has_open_pos_invoices_for_tables(tables):
    return _has_open_pos_invoices_for_cluster(tables)


def _free_tables_if_no_open_invoices(
    restaurant_table,
    custom_merged_tables=None,
):

    if not restaurant_table:
        return

    tables = _get_table_group(
        restaurant_table,
        custom_merged_tables,
    )

    if _has_open_pos_invoices_for_cluster(tables):
        return

    release_merge_cluster_tables(
        restaurant_table
    )


def _copy_invoice_item_fields(item_row, qty):
    return dict(
        item_code=item_row.item_code,
        item_name=item_row.item_name,
        qty=qty,
        rate=item_row.rate,
        price_list_rate=item_row.price_list_rate,
        base_price_list_rate=item_row.base_price_list_rate,
        comment=item_row.get("comment"),
        custom_course=item_row.get("custom_course"),
        cost_center=item_row.cost_center,
        uom=item_row.uom,
        conversion_factor=item_row.conversion_factor,
        warehouse=item_row.warehouse,
    )


@frappe.whitelist()
def split_bill(source_invoice, items_to_move, customer=None):
    """Move selected line items from a printed draft bill to a new sibling POS Invoice."""
    if isinstance(items_to_move, str):
        items_to_move = json.loads(items_to_move)

    source = frappe.get_doc("POS Invoice", source_invoice)

    if source.docstatus != 0:
        frappe.throw(_("Only draft invoices can be split."))

    move_map = {
        row["name"]: float(row["qty"])
        for row in items_to_move
        if row.get("name") and float(row.get("qty", 0)) > 0
    }
    if not move_map:
        frappe.throw(_("Select at least one item to move."))

    total_moving_qty = 0.0
    total_remaining_qty = 0.0
    for item in source.items:
        move_qty = move_map.get(item.name, 0)
        if move_qty > item.qty:
            frappe.throw(
                _("Cannot move more than available quantity for {0}.").format(item.item_name)
            )
        total_moving_qty += move_qty
        total_remaining_qty += item.qty - move_qty

    if total_moving_qty <= 0:
        frappe.throw(_("Select at least one item to move."))
    if total_remaining_qty <= 0:
        frappe.throw(_("At least one item must remain on the original bill."))

    new_invoice = frappe.new_doc("POS Invoice")
    header_fields = [
        "is_pos",
        "update_stock",
        "naming_series",
        "restaurant",
        "branch",
        "restaurant_table",
        "custom_restaurant_room",
        "custom_merged_tables",
        "waiter",
        "cashier",
        "pos_profile",
        "order_type",
        "no_of_pax",
        "customer",
        "customer_name",
        "selling_price_list",
        "taxes_and_charges",
        "company",
        "currency",
        "conversion_rate",
        "price_list_currency",
    ]
    for field in header_fields:
        if source.get(field) is not None:
            new_invoice.set(field, source.get(field))

    split_group = source.get("custom_split_group") or frappe.generate_hash(length=10)
    source.custom_split_group = split_group

    new_invoice.custom_split_from = source.name
    new_invoice.custom_split_group = split_group
    new_invoice.invoice_printed = 0
    new_invoice.invoice_created = 0

    if customer:
        new_invoice.customer = customer
        new_invoice.customer_name = frappe.db.get_value("Customer", customer, "customer_name")
        new_invoice.mobile_number = frappe.db.get_value("Customer", customer, "mobile_no")

    items_to_remove = []
    for item in source.items:
        move_qty = move_map.get(item.name, 0)
        if move_qty <= 0:
            continue
        if move_qty >= item.qty:
            new_invoice.append("items", _copy_invoice_item_fields(item, item.qty))
            items_to_remove.append(item)
        else:
            new_invoice.append("items", _copy_invoice_item_fields(item, move_qty))
            item.qty -= move_qty

    for item in items_to_remove:
        source.remove(item)

    payment_mode = source.payments[0].mode_of_payment if source.payments else None

    frappe.flags.ury_bill_split = True
    try:
        source.calculate_taxes_and_totals()
        new_invoice.calculate_taxes_and_totals()

        if payment_mode and new_invoice.invoice_created == 0:
            new_invoice.append(
                "payments",
                dict(mode_of_payment=payment_mode, amount=new_invoice.grand_total),
            )
            new_invoice.invoice_created = 1

        new_invoice.insert()
        frappe.db.set_value(
            "POS Invoice",
            new_invoice.name,
            {
                "custom_split_from": source.name,
                "custom_split_group": split_group,
            },
            update_modified=False,
        )
        source.save()
    finally:
        frappe.flags.ury_bill_split = False

    return {
        "source_invoice": source.name,
        "new_invoice": new_invoice.name,
    }



@frappe.whitelist()
def get_order_invoice(table=None, invoiceNo=None, order_type=None, is_payment=None):
    """returns the active invoice linked to the given table"""

    if table:
        filters = {"docstatus": 0}
        if invoiceNo:
            filters["name"] = invoiceNo
        elif is_payment != "Payments":
            filters["invoice_printed"] = 0
            
        or_filters = {
            "restaurant_table": table,
            "custom_merged_tables": ["like", f"%{table}%"]
        }
        
        invoices = frappe.get_all("POS Invoice", filters=filters, or_filters=or_filters, limit=1)
        invoice_name = invoices[0].name if invoices else None
        branch, menu_name, restaurant = get_restaurant_and_menu_name(table)

        if invoice_name:
            invoice = frappe.get_doc("POS Invoice", invoice_name)

        else:
            invoice = frappe.new_doc("POS Invoice")

            invoice.naming_series = frappe.db.get_value(
                "URY Restaurant", restaurant, "invoice_series_prefix"
            )

            invoice.is_pos = 1
            invoice.update_stock = 1
            invoice.restaurant = restaurant
            invoice.branch = branch

            is_take_away = frappe.db.get_value("URY Table", table, "is_take_away")
            if is_take_away == 1:
                invoice.order_type = "Take Away"
            else:
                invoice.order_type= "Dine In"

        invoice.taxes_and_charges = frappe.db.get_value(
            "URY Restaurant", restaurant, "default_tax_template"
        )

        invoice.selling_price_list = frappe.db.get_value(
            "Price List", dict(restaurant_menu=menu_name, enabled=1)
        )

        if invoice_name and invoice.restaurant_table:
            _reconcile_invoice_merged_tables(invoice, persist=True)

    else:

        if is_payment == "Payments":
            invoice_name = frappe.get_value(
                "POS Invoice", dict(restaurant_table=table, docstatus=0, name=invoiceNo)
            )
            
        else:
            invoice_name = frappe.get_value(
                "POS Invoice", dict(docstatus=0, name=invoiceNo)
            )
            
        if invoice_name:
            invoice = frappe.get_doc("POS Invoice", invoice_name)
            

        else:
            invoice = frappe.new_doc("POS Invoice")
            invoice.is_pos = 1
            invoice.update_stock = 1
        
        branch = getBranch()
        restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch}, "name")
   
        menu=get_menu_name(order_type)
 
        if (order_type == "Aggregators" and frappe.db.get_value("Branch", branch, "custom_no_taxes") == 0) or order_type != "Aggregators":
            invoice.taxes_and_charges = frappe.db.get_value("URY Restaurant", restaurant, "default_tax_template")
        
        invoice.selling_price_list = frappe.db.get_value(
            "Price List", dict(restaurant_menu=menu, enabled=1)
        )

        if invoice_name and invoice.restaurant_table:
            _reconcile_invoice_merged_tables(invoice, persist=True)

    return invoice


@frappe.whitelist()
def sync_order(
    items,
    cashier,
    owner,
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
    order_type=None,
    aggregator_id=None,
    room=None,
    merged_tables=None
):
    
    user_role = frappe.get_roles()
    posprofile = frappe.get_doc("POS Profile", pos_profile)
    
    billing_user = any(
        role.role in user_role for role in posprofile.role_allowed_for_billing
    )

    # Check if the last invoice was already billed
    if (
        last_invoice
        and frappe.db.get_value("POS Invoice", last_invoice, "invoice_printed") == 1
        and (not billing_user)
    ):
        frappe.msgprint(
            title="Invoice Already Billed",
            indicator="red",
            msg=("This order has already been billed. Please reload the page."),
        )
        return {"status": "Failure"}

    invoice = get_order_invoice(table, invoice,order_type)

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
        if invoice.name and invoice.invoice_printed == 0 and not billing_user:
            frappe.msgprint(
                title="Table occupied ",
                indicator="red",
                msg=("{0} is already occupied . Please refresh the page.").format(
                    table
                ),
            )
            return {"status": "Failure"}

    if not customer:
        frappe.throw("Please enter valid customer details")
    else:
        invoice.customer = customer

    if order_type:
        invoice.order_type = order_type

    customerdoc = frappe.get_doc("Customer", customer)
    invoice.mobile_number = customerdoc.mobile_number
    if comments:
        invoice.custom_comments = comments
    invoice.no_of_pax = no_of_pax
    invoice.pos_profile = pos_profile
    invoice.cashier = cashier
    invoice.waiter = waiter
    invoice.custom_aggregator_id = aggregator_id
    invoice.custom_restaurant_room =room
    if not invoice.restaurant_table:
        invoice.restaurant_table = table

    if invoice.restaurant_table:
        _reconcile_invoice_merged_tables(invoice)
    
    if order_type == "Aggregators":
        price_list = frappe.db.get_value("Aggregator Settings",{"customer": customer, "parent": invoice.branch, "parenttype": "Branch"},"price_list",)
        
        if not price_list:
            frappe.throw(f"Price list for customer {customer} in branch {invoice.branch} not found in Aggregator Settings.")
    else:
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
        

    # Conditional checking for 'items' type:
    # - 'ury': JSON passed, hence using isinstance
    # - 'ury_pos': Already formatted list, hence using else
    if isinstance(items, str):
        items = json.loads(items)
    invoice.items = []
    
    menu = frappe.db.get_value("URY Menu", {"branch": invoice.branch}, "name")
   
    for d in items:
        
        course = frappe.db.get_value("URY Menu Item", {"item": d.get("item"),"parent":menu}, "course")
        
        item_prices = frappe.db.get_list(
            "Item Price",
            filters={"item_code": d.get("item"), "price_list": price_list},
            fields=["price_list_rate"],
        )

        if not item_prices:
            frappe.throw(_("No item price found for Item: {0} in Price List: {1}. Please check the price list settings.").format(d.get("item"), price_list))

        else:
            invoice.append(
                "items",
                dict(
                    item_code=d.get("item"),
                    item_name=d.get("item_name"),
                    qty=d.get("qty"),
                    **({"custom_course": course} if course else {}),
                    comment=d.get("comment"),
                    rate = item_prices[0].price_list_rate,
                    price_list_rate = item_prices[0].price_list_rate,
                    base_price_list_rate = item_prices[0].price_list_rate,
                    cost_center = frappe.db.get_value(
                        "POS Profile", pos_profile, "cost_center"
                        ),
                ),
            )

    try:
        invoice.save()
    except Exception as e:
        frappe.throw(f"Error while updating order: {e}")   


    try:
        kot_execute(invoice.name, customer, table, items, past_item, comments)

    except Exception as e:
        # If an exception occurs (e.g., "kot" app not found), it will be caught here without affect the code execution.
        error_msg = f"KOT Creation Failes {str(e)}"            
        frappe.log_error(error_msg, "KOT Error")

    # table status
    if invoice.invoice_printed == 0:
        frappe.db.set_value(
            "URY Table", invoice.restaurant_table, {"occupied": 1, "latest_invoice_time": invoice.creation}
        )
        if invoice.custom_merged_tables:
            for merged_table in invoice.custom_merged_tables.split(","):
                frappe.db.set_value(
                    "URY Table", merged_table.strip(), {"occupied": 1, "latest_invoice_time": invoice.creation}
                )

    invoice.db_set("owner", owner)
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
def get_menu_name(order_type):
    branch = getBranch()
    restaurant = frappe.get_value(
        "URY Restaurant",
        {"branch": branch},
        "name",
    )
    order_type_wise_menu = frappe.db.get_value(
            "URY Restaurant", restaurant, "order_type_wise_menu"
        )
    
    if order_type_wise_menu:
        menu = frappe.db.get_value(
            "Order Type Menu",
            {"parent": restaurant, "order_type": order_type},
            "menu"
        )
        if not menu:
            menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
    else:
        menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")   
    return menu  
    

@frappe.whitelist()
def pos_opening_check():
    
    user = frappe.session.user
    # Handle the administrator case differently
    if user == "Administrator":
        return {
            "opening_exists": False,  # Assuming no POS opening entry is needed for Administrator
            "cashier": None,
            "pos_profile": None,
        }
    
    details = getBranchRoom()
    room = details[0].get('name')    # 'Beach'
    branch = details[0].get('branch') # 'Beach'
    
    pos_opening_list = frappe.db.sql("""
        SELECT DISTINCT `tabPOS Opening Entry`.name 
        FROM `tabPOS Opening Entry`
        INNER JOIN `tabMultiple Rooms` 
        ON `tabMultiple Rooms`.parent = `tabPOS Opening Entry`.name
        WHERE `tabPOS Opening Entry`.branch = %s
        AND `tabPOS Opening Entry`.status = 'Open'
        AND `tabPOS Opening Entry`.docstatus = 1
        AND `tabMultiple Rooms`.room = %s
    """, (branch, room), as_dict=True)
    
    
    result = {
        "opening_exists": len(pos_opening_list) > 0,
        "cashier": None,
        "pos_profile": None,
    }

    if result["opening_exists"]:
        # If POS opening entry exists, fetch the cashier from the first entry
        opening_entry = frappe.get_doc("POS Opening Entry", pos_opening_list[0].name)
        result["cashier"] = (
            opening_entry.user
        )  # Fetch values from POS Profile linked to POS Opening Entry
        result["pos_profile"] = opening_entry.pos_profile
        
    return result


@frappe.whitelist()
def table_transfer(table, newTable, invoice):
    current_table = frappe.get_doc("URY Table", table)
    pos_invoice = frappe.get_doc("POS Invoice", invoice)
    new_table = frappe.get_doc("URY Table", newTable)

    merge_members, _ = _get_merge_cluster(table)
    if len(merge_members) > 1:
        frappe.throw(_("Table transfer is not allowed for merged tables. Unmerge first."))

    if current_table.branch != new_table.branch:
        frappe.throw(_("Table transfer between different branches is restricted."))

    if new_table.occupied == 1:
        frappe.throw(f"Table {new_table.name} is already occupied")

    frappe.db.set_value(
        "URY Table",
        new_table.name,
        {"occupied": 1, "latest_invoice_time": pos_invoice.creation},
    )
    frappe.db.set_value(
        "URY Table",
        current_table.name,
        {"occupied": 0, "latest_invoice_time": None},
    )

    pos_invoice.restaurant_table = new_table.name
    pos_invoice.custom_restaurant_room = new_table.restaurant_room
    pos_invoice.save()

    try:
        change_table_in_kot(
            pos_invoice.name, new_table.name, pos_invoice.branch
        )
    except Exception:
        pass


@frappe.whitelist()
def captain_transfer(currentCaptain, newCaptain, invoice):
    pos_profile=frappe.get_value("POS Invoice", invoice,"pos_profile")
    multiple_cashier = frappe.db.get_value("POS Profile",pos_profile,"custom_enable_multiple_cashier")
    branch=frappe.get_value("POS Invoice", invoice,"branch")
    if multiple_cashier:
        table=pos_profile=frappe.get_value("POS Invoice", invoice,"restaurant_table")
        current_room = frappe.get_value("URY Table", table,"restaurant_room")
        new_captain_room =  frappe.db.sql("""
                SELECT room
                FROM `tabURY User`
                WHERE parent=%s AND user=%s         
            """,(branch,newCaptain),as_dict=True)
        room_match = any(room['room'] == current_room for room in new_captain_room)
        if not room_match:
            frappe.throw(_("Captain transfer is not allowed between different rooms"))
        else:
            current_captain_doc = frappe.get_doc("User", currentCaptain)
            pos_invoice = frappe.get_doc("POS Invoice", invoice)
            new_captain_doc = frappe.get_doc("User", newCaptain)

            # Update the waiter field of the POS Invoice
            pos_invoice.waiter = new_captain_doc.name
            pos_invoice.save()

    else:
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

    # Release the full merge cluster, not only the primary table and CSV partners.
    if pos_invoice.restaurant_table:
        release_merge_cluster_tables(pos_invoice.restaurant_table)

    try:
        cancel_kot(invoice_id)

    except Exception as e:
        # If an exception occurs (e.g., "kot" app not found), it will be caught here without effecting execution
        pass

    # Update invoice status
    frappe.db.sql("""
        UPDATE `tabPOS Invoice Item`
        SET docstatus = 2
        WHERE parent = %s
    """, (invoice_id,))

    frappe.db.set_value("POS Invoice", invoice_id, "docstatus", 2)
    frappe.db.set_value("POS Invoice", invoice_id, "status", "Cancelled")
    frappe.db.set_value("POS Invoice", invoice_id, "cancel_reason", reason)

# Method for URY POS
@frappe.whitelist()
def make_invoice(customer, payments, cashier, pos_profile,owner, additionalDiscount=None, table=None, invoice=None):
    order_type =  invoice_name = frappe.get_value("POS Invoice",invoice , "order_type")
    invoice = get_order_invoice(table, invoice, order_type, "Payments")

    if table:
        restaurant = get_restaurant_and_menu_name(table)
        invoice.restaurant = restaurant

    invoice.customer = customer
    invoice.pos_profile = pos_profile
    invoice.additional_discount_percentage=additionalDiscount
    invoice.calculate_taxes_and_totals()

    for pay in invoice.payments:
        pay.delete(pay.mode_of_payment)

    for d in payments:
        invoice.append(
            "payments", dict(mode_of_payment=d["mode_of_payment"], amount=d["amount"])
        )

    # invoice.owner = owner
    invoice.save()
    try:
        invoice.submit()
    except Exception as e:
        frappe.throw(f"Error while settling order: {e}")
        
    # Free the table when no other open drafts remain on this table group
    if invoice.restaurant_table:
        _free_tables_if_no_open_invoices(
            invoice.restaurant_table,
            invoice.custom_merged_tables,
        )
    
    

# Cancel KOT Doc Creation
def cancel_kot(invoice_id):

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

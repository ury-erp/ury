import json

import frappe
from frappe import _
from ury.ury_pos.api import getBranch


# Load JSON data or return as is if it's already a Python dictionary
def load_json(data):
    if isinstance(data, str):
        return json.loads(data)
    return data


# Create a list of order items from a list of input items
def create_order_items(items):
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


# Create a KOT (Kitchen Order Ticket) document
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
):
    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)
    order_number = pos_invoice.custom_ury_order_number
    is_aggregator = 0
    if pos_invoice.order_type == "Aggregators":
        is_aggregator = 1
    kot_doc = frappe.get_doc(
        {
            "doctype": "URY KOT",
            "invoice": invoice_id,
            "restaurant_table": restaurant_table,
            "custom_merged_tables": pos_invoice.get("custom_merged_tables"),
            "customer_name": customer,
            "pos_profile": pos_profile_id,
            "comments": comments,
            "type": kot_type,
            "naming_series": kot_naming_series,
            "production": production,
            "aggregator_id":pos_invoice.custom_aggregator_id,
            "is_aggregator":is_aggregator,
            "order_no":order_number
        }
    )
    branch = getBranch()
    if restaurant_table:
        room = frappe.db.get_value("URY Table", restaurant_table, "restaurant_room")
        restaurant = frappe.db.get_value("URY Table", restaurant_table, "restaurant")
        menu = frappe.db.get_value("Menu for Room", {"room": room,"parent":restaurant}, "menu")
        
    else:
        menu = frappe.db.get_value("URY Restaurant", {"branch": branch}, "active_menu")

    for item in items:
        course = frappe.db.get_value("URY Menu Item", {"item": item["item_code"],"parent":menu}, "course")
        kot_doc.append(
            "kot_items",
            {
                "item": item["item_code"],
                "item_name": item["item_name"],
                "quantity": item["qty"],
                "comments": item["comments"],
                "course":course
            },
        )
    kot_doc.insert()
    kot_doc.submit()

# Function to get all production item groups for a given branch
def get_all_production_item_groups(branch):
    productions = frappe.db.get_all(
        "URY Production Unit", filters={"branch": branch}, fields=["name"]
    )
    if productions:
        all_production_item_groups = set()
        for production in productions:
            productionItemGroupslist = frappe.get_all(
                "URY Production Item Groups",
                fields=["item_group"],
                filters={
                    "parent": production.name,
                    "parenttype": "URY Production Unit",
                },
                order_by="idx",
            )
            productionItemGroups = [
                item_group.item_group for item_group in productionItemGroupslist
            ]
            all_production_item_groups.update(productionItemGroups)
        return all_production_item_groups


# Process items to create KOT documents
def process_items_for_kot(
    invoice_id,
    customer,
    restaurant_table,
    items,
    comments,
    pos_profile_id,
    kot_naming_series,
    kot_type,
):
    kot_items = create_order_items(items)
    pos_profile = frappe.get_doc("POS Profile", pos_profile_id)
    productions = frappe.db.get_all(
        "URY Production Unit", filters={"branch": pos_profile.branch}, fields=["name"]
    )

    if productions:
        all_production_item_groups = get_all_production_item_groups(pos_profile.branch)
        
        # Iterate through each item and check if item group belongs to a production unit
        for item in kot_items:
            item_group = frappe.db.get_value("Item", item["item_code"], "item_group")
            item_code = item["item_code"]
            if item_group not in all_production_item_groups:
                frappe.msgprint(
                    f"Item group '{item_group}' for item '{item_code}' is not in any production."
                )
        for production in productions:
            productionItemGroupslist = frappe.get_all(
                "URY Production Item Groups",
                fields=["item_group"],
                filters={
                    "parent": production.name,
                    "parenttype": "URY Production Unit",
                },
                order_by="idx",
            )
            productionItemGroups = [
                item_group.item_group for item_group in productionItemGroupslist
            ]
            production_items = [
                item
                for item in kot_items
                if frappe.db.get_value("Item", item["item_code"], "item_group")
                in productionItemGroups
            ]

            if production_items:
                invoice_exist = frappe.db.exists(
                    "URY KOT",
                    {
                        "invoice": invoice_id,
                        "docstatus": 1,
                        "production": production.name,
                    },
                )
                if invoice_exist:
                    kot_type = "Order Modified"

                create_kot_doc(
                    invoice_id,
                    customer,
                    restaurant_table,
                    production_items,
                    kot_type,
                    comments,
                    pos_profile_id,
                    kot_naming_series,
                    production.name,
                )
    else:
        frappe.throw(
            "Create URY Production unit against POS Profile: %s " % pos_profile.name
        )


# Process items to create a cancel KOT document
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
):

    kot_items = create_order_items(items)
    pos_profile = frappe.get_doc("POS Profile", pos_profile_id)
    productions = frappe.db.get_all(
        "URY Production Unit", filters={"branch": pos_profile.branch}, fields=["name"]
    )

    for production in productions:
        productionDoc = frappe.get_doc("URY Production Unit", production.name)
        productionItemGroups = [
            item_group.item_group for item_group in productionDoc.item_groups
        ]
        production_items = [
            item
            for item in kot_items
            if frappe.get_doc("Item", item["item_code"]).item_group
            in productionItemGroups
        ]

        if production_items:
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
            )


# Create a cancel KOT document
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
):
    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)
    order_number = pos_invoice.custom_ury_order_number  
    is_aggregator = 0
    if pos_invoice.order_type == "Aggregators":
        is_aggregator = 1
    kot_list = frappe.db.get_list(
        "URY KOT",
        filters={
            "invoice": invoice_id,
            "type": ("in", ("New Order", "Order Modified")),
        },
        fields=("name"),
    )

    # Find original KOTs related to the cancel items
    original_kots = []
    for cancelItem in cancel_items:
        for kot in kot_list:
            kot_doc = frappe.get_doc("URY KOT", kot.name)
            kot_cancel_items = kot_doc.kot_items
            itemCheckFlag = False
            for kotItem in kot_cancel_items:
                if cancelItem["item_code"] == kotItem.item:
                    itemCheckFlag = True
            if itemCheckFlag:
                original_kots.append(kot_doc.name)
                break

    # Remove duplicate KOT names and join them into a single string
    set_kots = [*set(original_kots)]
    set_kots = ",".join(set_kots)
    kot_cancel_doc = frappe.get_doc(
        {
            "doctype": "URY KOT",
            "naming_series": cancel_kot_naming_series,
            "original_kot": set_kots,
            "restaurant_table": restaurant_table,
            "customer_name": customer,
            "type": kot_type,
            "invoice": invoice_id,
            "pos_profile": pos_profile_id,
            "comments": comments,
            "production": production,
            "is_aggregator":is_aggregator,
            "order_no":order_number
        }
    )

    branch = getBranch()
    if restaurant_table:
        room = frappe.db.get_value("URY Table", restaurant_table, "restaurant_room")
        restaurant = frappe.db.get_value("URY Table", restaurant_table, "restaurant")
        menu = frappe.db.get_value("Menu for Room", {"room": room,"parent":restaurant}, "menu")
        
    else:
        menu = frappe.db.get_value("URY Restaurant", {"branch": branch}, "active_menu")
    for cancelItem in cancel_items:
        course = frappe.db.get_value("URY Menu Item", {"item": cancelItem["item_code"],"parent":menu}, "course")
        for item in invoiceItems:
            if cancelItem["item_code"] == item["item_code"]:
                kot_cancel_doc.append(
                    "kot_items",
                    {
                        "item": cancelItem["item_code"],
                        "item_name": cancelItem["item_name"],
                        "cancelled_qty": abs(int(cancelItem["qty"])),
                        "quantity": item["qty"],
                        "comments": cancelItem["comments"],
                        "course":course
                    },
                )

    kot_cancel_doc.insert()
    kot_cancel_doc.submit()


def _get_user_branches(user=None):
    """Return the branches the given user is assigned to via URY User."""
    user = user or frappe.session.user
    return frappe.db.sql(
        """
        SELECT b.branch
        FROM `tabURY User` AS a
        INNER JOIN `tabBranch` AS b ON a.parent = b.name
        WHERE a.user = %s
        """,
        user,
        pluck="branch",
    )


def _validate_kot_access(pos_invoice):
    """Ensure the session user is authorized to generate KOTs for a POS Invoice.

    Requires write permission on the POS Invoice and, for non-admin users,
    assignment to the invoice's branch (via URY User).
    """
    if not frappe.has_permission("POS Invoice", "write", doc=pos_invoice):
        frappe.throw(
            _("Not permitted to generate KOTs for POS Invoice {0}.").format(
                pos_invoice.name
            ),
            frappe.PermissionError,
        )

    user = frappe.session.user
    if user == "Administrator" or "System Manager" in frappe.get_roles(user):
        return

    if pos_invoice.branch and pos_invoice.branch not in _get_user_branches(user):
        frappe.throw(
            _("You are not assigned to branch {0}.").format(pos_invoice.branch),
            frappe.PermissionError,
        )


@frappe.whitelist()
def kot_execute_for_invoice(
    invoice_id,
    restaurant_table=None,
    previous_items=None,
    comments=None,
):
    """Whitelisted endpoint used by the POS Invoice form to update KOTs.

    Validates POS Invoice write permission and branch/profile access, then
    derives the current items from the saved invoice instead of trusting
    client-supplied item data.
    """
    previous_items = load_json(previous_items) or []

    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)

    _validate_kot_access(pos_invoice)

    if pos_invoice.docstatus != 0:
        frappe.throw(
            _("KOTs can only be updated for draft POS Invoice {0}.").format(
                invoice_id
            )
        )

    current_items = [
        {
            "item_code": item.item_code,
            "qty": item.qty,
            "item_name": item.item_name,
            "comments": item.get("comment") or "",
        }
        for item in pos_invoice.items
    ]

    kot_execute(
        invoice_id,
        pos_invoice.customer,
        restaurant_table or pos_invoice.restaurant_table,
        current_items,
        previous_items,
        comments,
    )


# Server-side only: handles KOT entry. Called from the URY order sync flow
# (ury_order.sync_order) and from kot_execute_for_invoice after authorization.
def kot_execute(
    invoice_id,
    customer,
    restaurant_table=None,
    current_items=[],
    previous_items=[],
    comments=None,
):
    current_items = load_json(current_items)
    previous_items = load_json(previous_items)
    new_invoice_items_array = create_order_items(previous_items)
    new_Order_items_array = create_order_items(current_items)

    final_array = compare_two_array(new_Order_items_array, new_invoice_items_array)
    removed_item = get_removed_items(new_invoice_items_array, new_Order_items_array)

    pos_invoice = frappe.get_doc("POS Invoice", invoice_id)
    pos_profile_id = pos_invoice.pos_profile
    pos_profile = frappe.get_doc("POS Profile", pos_profile_id)
    kot_naming_series = pos_profile.custom_kot_naming_series
    if kot_naming_series:
        cancel_kot_naming_series = "CNCL-" + kot_naming_series
    else:
        frappe.throw(
            "KOT Naming Series is mandatory for the auto creation of KOT.Ensure it is configured in the POS Profile: %s"
            % pos_profile.name
        )

    positive_qty_items = [item for item in final_array if int(item["qty"]) > 0]
    negative_qty_items = [item for item in final_array if int(item["qty"]) <= 0]
    total_cancel_items = negative_qty_items + removed_item
    if positive_qty_items:
        process_items_for_kot(
            invoice_id,
            customer,
            restaurant_table,
            positive_qty_items,
            comments,
            pos_profile_id,
            kot_naming_series,
            "New Order",
        )
    if total_cancel_items:
        process_items_for_cancel_kot(
            invoice_id,
            customer,
            restaurant_table,
            total_cancel_items,
            comments,
            pos_profile_id,
            cancel_kot_naming_series,
            "Partially cancelled",
            new_invoice_items_array,
        )


# Compare two arrays and return the items that are different
def compare_two_array(array_1, array_2):
    finalarray = []
    for index, x in enumerate(array_1):
        a = list(
            filter(
                lambda y: y["item_code"] == x["item_code"] and y["qty"] == x["qty"],
                array_2,
            )
        )
        if len(a) == 0:
            b = list(filter(lambda z: z["item_code"] == x["item_code"], array_2))
            for qtb in b:
                x["qty"] = int(x["qty"]) - int(qtb["qty"])
            finalarray.append(x)
    return finalarray


# Get the items that have been removed from the second array compared to the first array
def get_removed_items(array_1, array_2):
    removed_objects = [
        obj
        for obj in array_1
        if obj["item_code"] not in [x["item_code"] for x in array_2]
    ]
    return removed_objects

import frappe
import json
from frappe import _
from datetime import date, datetime, timedelta
from frappe.utils import validate_phone_number


#GetTable  decripted temporarily
# @frappe.whitelist()
# def getTable(room):
#     branch_name = getBranch()
#     tables = frappe.get_all(
#         "URY Table",
#         fields=["name", "occupied", "latest_invoice_time", "is_take_away", "restaurant_room","table_shape","no_of_seats","layout_x","layout_y"],
#         filters={"branch": branch_name,"restaurant_room":room,}
#     )
#     return tables

def resolve_restaurant_menu(branch, room=None, order_type=None, cashier=False):
    """
    Resolve and return menu for a given branch, room, and order type.

    Args:
        branch: Branch name string (already resolved)
        room: Optional room name
        order_type: Optional order type
        cashier: Boolean indicating if user is a cashier

    Returns:
        Dict with keys: items, modified_time, name
    """
    menu_items = []
    menu_items_with_image = []

    restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch}, "name")

    if room:

        room_wise_menu = frappe.db.get_value(
            "URY Restaurant", restaurant, "room_wise_menu"
        )

        if room_wise_menu:
            menu = frappe.db.get_value(
                "Menu for Room",
                {"parent": restaurant, "room": room},
                "menu"
            )
            if not menu:
                 menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
        else:
            menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")

    elif cashier and order_type:
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

    # Default menu if nothing is selected
    else:
        menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")

    if not menu:
        frappe.throw(_("Please set an active menu for Restaurant {0}").format(restaurant))


    # Get menu items (your existing code)
    menu_items = frappe.get_all(
        "URY Menu Item",
        filters={"parent": menu, "disabled": 0},
        fields=["item", "item_name", "rate", "special_dish", "disabled", "course"],
        order_by="item_name asc"
    )

    menu_items_with_image = [
        {
            "item": item.item,
            "item_name": _(item.item_name) if item.item_name else item.item_name,
            "rate": item.rate,
            "special_dish": item.special_dish,
            "disabled": item.disabled,
            "item_image": frappe.db.get_value("Item", item.item, "image"),
            "course": item.course,
            "course_label": _(item.course) if item.course else item.course,
        }
        for item in menu_items
    ]
    modified = frappe.db.get_value("URY Menu", menu, "modified")


    return {
        "items": menu_items_with_image,
        "modified_time": modified,
        "name": menu
    }

@frappe.whitelist()
def getRestaurantMenu(pos_profile, room=None, order_type=None):
    user_role = frappe.get_roles()

    pos_profile = frappe.get_doc("POS Profile", pos_profile)

    cashier = any(
        role.role in user_role for role in pos_profile.role_allowed_for_billing
    )
    branch_name = getBranch()

    return resolve_restaurant_menu(branch_name, room, order_type, cashier)

@frappe.whitelist()
def getMenuCourses():
    courses = frappe.get_all("URY Menu Course", fields=["name", "icon"])
    return [{"name": d.name, "label": _(d.name), "icon": d.icon} for d in courses]

@frappe.whitelist()
def getBranch():
    user = frappe.session.user
    sql_query = """
        SELECT b.branch
        FROM `tabURY User` AS a
        INNER JOIN `tabBranch` AS b ON a.parent = b.name
        WHERE a.user = %s
    """
    branch_array = frappe.db.sql(sql_query, user, as_dict=True)
    if not branch_array:
        frappe.throw("User is not Associated with any Branch.Please refresh Page")

    branch_name = branch_array[0].get("branch")

    return branch_name

@frappe.whitelist()
def getBranchRoom():
    user = frappe.session.user
    sql_query = """
        SELECT b.branch , a.room
        FROM `tabURY User` AS a
        INNER JOIN `tabBranch` AS b ON a.parent = b.name
        WHERE a.user = %s
    """
    branch_array = frappe.db.sql(sql_query, user, as_dict=True)
    
    branch_name = branch_array[0].get("branch")
    room_name = branch_array[0].get("room")

    if not branch_name:
        frappe.throw("Branch information is missing for the user. Please contact your administrator.")

    if not room_name:
        frappe.throw("No room assigned to this user. Please contact your administrator.")

    return [{
        "name":room_name ,
        "branch": branch_name,
    }]

@frappe.whitelist()
def getRoom():
    user = frappe.session.user
    sql_query = """
        SELECT b.branch, a.room
        FROM `tabURY User` AS a
        INNER JOIN `tabBranch` AS b ON a.parent = b.name
        WHERE a.user = %s
    """
    branch_array = frappe.db.sql(sql_query, user, as_dict=True)
    
    if not branch_array:
        frappe.throw("No branch or room information found for the user. Please contact your administrator.")
    
    room_details = [
        {
            "name": row.get("room"),
            "branch": row.get("branch")
        } 
        for row in branch_array
    ]

    return room_details

@frappe.whitelist()
def getModeOfPayment():
    posDetails = getPosProfile()
    posProfile = posDetails["pos_profile"]
    posProfiles = frappe.get_doc("POS Profile", posProfile)
    mode_of_payments = posProfiles.payments
    modeOfPayments = []
    for mop in mode_of_payments:
        modeOfPayments.append(
            {"mode_of_payment": mop.mode_of_payment, "opening_amount": float(0)}
        )
    return modeOfPayments


@frappe.whitelist()
def get_production_units_for_branch():
	"""Fetch all production unit names for the current user's branch.

	Returns a list of production unit names that should be subscribed to for
	KOT error channels on the POS terminal.
	"""
	try:
		branch = getBranch()
	except frappe.exceptions.ValidationError:
		# Fallback if getBranch() throws (e.g., Administrator with no branch)
		return {"production_units": []}

	if not branch:
		return {"production_units": []}

	productions = frappe.get_all(
		"URY Production Unit",
		filters={"branch": branch},
		fields=["name"]
	)

	production_names = [p.name for p in productions]

	return {"production_units": production_names}


def format_merged_table_label(primary, merged_tables=None):
    if not primary:
        return ""
    partners = [p.strip() for p in (merged_tables or "").split(",") if p.strip()]
    if not partners:
        return primary
    return " + ".join([primary] + sorted(partners))


def _backfill_split_groups(invoices):
    parent_names = [
        inv["custom_split_from"]
        for inv in invoices
        if inv.get("custom_split_from") and not inv.get("custom_split_group")
    ]
    if not parent_names:
        return

    parent_rows = frappe.get_all(
        "POS Invoice",
        filters={"name": ["in", parent_names]},
        fields=["name", "custom_split_group"],
    )
    parent_group_map = {
        row.name: row.custom_split_group
        for row in parent_rows
        if row.custom_split_group
    }
    for inv in invoices:
        if not inv.get("custom_split_group") and inv.get("custom_split_from"):
            inv["custom_split_group"] = parent_group_map.get(inv["custom_split_from"])


def _enrich_split_group_meta(invoices):
    if not invoices:
        return invoices

    _backfill_split_groups(invoices)

    groups = list(
        {inv.get("custom_split_group") for inv in invoices if inv.get("custom_split_group")}
    )
    if not groups:
        for inv in invoices:
            inv["split_index"] = 0
            inv["split_total"] = 0
            inv["split_siblings"] = []
        return invoices

    group_members = frappe.db.sql(
        """
        SELECT name, custom_split_group
        FROM `tabPOS Invoice`
        WHERE custom_split_group IN %(groups)s AND docstatus < 2
        ORDER BY creation asc
        """,
        {"groups": groups},
        as_dict=True,
    )

    group_order = {}
    for row in group_members:
        group_order.setdefault(row.custom_split_group, []).append(row.name)

    for group, names in list(group_order.items()):
        children = frappe.get_all(
            "POS Invoice",
            filters={"custom_split_from": ["in", names], "docstatus": ["<", 2]},
            fields=["name"],
            order_by="creation asc",
        )
        for child in children:
            if child.name not in names:
                names.append(child.name)

    for inv in invoices:
        group = inv.get("custom_split_group")
        if not group or group not in group_order:
            inv["split_index"] = 0
            inv["split_total"] = 0
            inv["split_siblings"] = []
            continue
        names = group_order[group]
        inv["split_total"] = len(names)
        inv["split_siblings"] = [name for name in names if name != inv["name"]]
        try:
            inv["split_index"] = names.index(inv["name"]) + 1
        except ValueError:
            inv["split_index"] = 0
            inv["split_total"] = 0
            inv["split_siblings"] = []

    return invoices


@frappe.whitelist()
def get_split_group(invoice):
    pos_invoice = frappe.get_doc("POS Invoice", invoice)
    
    if not frappe.has_permission("POS Invoice", "read", doc=pos_invoice):
        frappe.throw(frappe._("Not permitted to view this order"), frappe.PermissionError)
        
    user_branch = getBranch()
    if pos_invoice.branch and user_branch and pos_invoice.branch != user_branch:
        frappe.throw(frappe._("Not permitted to view orders outside your active branch"), frappe.PermissionError)

    group = pos_invoice.custom_split_group
    if not group:
        split_from = frappe.db.get_value("POS Invoice", invoice, "custom_split_from")
        if split_from:
            group = frappe.db.get_value("POS Invoice", split_from, "custom_split_group")
    if not group:
        return {"invoices": [], "current": invoice, "group": None}

    split_fields = [
        "name",
        "custom_split_from",
        "custom_split_group",
        "invoice_printed",
        "restaurant_table",
        "custom_merged_tables",
        "rounded_total",
        "grand_total",
        "customer",
        "customer_name",
        "status",
        "docstatus",
        "posting_date",
        "posting_time",
        "order_type",
        "cashier",
        "waiter",
        "mobile_number",
        "net_total",
        "total_taxes_and_charges",
        "creation",
        "branch",
        "additional_discount_percentage",
        "discount_amount",
    ]

    invoices = frappe.get_all(
        "POS Invoice",
        filters={"custom_split_group": group, "docstatus": ["<", 2]},
        fields=split_fields,
        order_by="creation asc",
    )

    member_names = [inv["name"] for inv in invoices]
    if member_names:
        children = frappe.get_all(
            "POS Invoice",
            filters={"custom_split_from": ["in", member_names], "docstatus": ["<", 2]},
            fields=split_fields,
            order_by="creation asc",
        )
        existing = {inv["name"] for inv in invoices}
        for child in children:
            if child.name not in existing:
                invoices.append(child)
                existing.add(child.name)

    invoices.sort(key=lambda row: row.get("creation") or row.get("name"))

    valid_invoices = []
    for inv in invoices:
        if inv.get("branch") and user_branch and inv.get("branch") != user_branch:
            continue
        if not frappe.has_permission("POS Invoice", "read", doc=inv.get("name")):
            continue
        valid_invoices.append(inv)
    invoices = valid_invoices

    total = len(invoices)
    for index, inv in enumerate(invoices, start=1):
        inv["split_index"] = index
        inv["split_total"] = total
        inv["is_original"] = not inv.get("custom_split_from")
        inv["split_siblings"] = [row["name"] for row in invoices if row["name"] != inv["name"]]

    return {"invoices": invoices, "current": invoice, "group": group}


@frappe.whitelist()
def getInvoiceForCashier(status, cashier, limit, limit_start):
    # U27: `cashier` was previously accepted as-is from the caller, so any
    # authenticated user in a branch could read another cashier's invoices.
    # Only an elevated role may look up someone else's invoices; everyone
    # else is scoped to their own session user regardless of what they pass.
    if cashier != frappe.session.user:
        elevated_roles = {"System Manager", "URY Manager", "URY Captain"}
        if not elevated_roles.intersection(frappe.get_roles()):
            cashier = frappe.session.user
    branch = getBranch()
    updatedlist = []
    limit = int(limit)+1
    limit_start = int(limit_start)
    if status == "Draft":
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, custom_merged_tables,
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number, 
                posting_date, rounded_total, order_type 
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s AND cashier = %s
            AND (invoice_printed = 1 OR (invoice_printed = 0 AND COALESCE(restaurant_table, '') = ''))
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, status, cashier, limit,limit_start),
            as_dict=True,
        )
        updatedlist.extend(invoices)
    elif status == "Unbilled":
        
        docstatus = "Draft"
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, custom_merged_tables,
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number, 
                posting_date, rounded_total, order_type 
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s AND cashier = %s
            AND (invoice_printed = 0 AND restaurant_table IS NOT NULL)
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, docstatus, cashier, limit, limit_start),
            as_dict=True,
        )
        updatedlist.extend(invoices)
    elif status == "Recently Paid":
        docstatus = "Paid"
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, custom_merged_tables,
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number,
                posting_date, rounded_total, order_type,additional_discount_percentage,discount_amount 
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s AND cashier = %s
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, docstatus, cashier, limit, limit_start),
            as_dict=True,
        )
        updatedlist.extend(invoices)    
    else:
        
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, custom_merged_tables,
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number,
                posting_date, rounded_total, order_type,additional_discount_percentage,discount_amount
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s AND cashier = %s
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, status, cashier, limit, limit_start),
            as_dict=True,
        )

        updatedlist.extend(invoices)
    if len(updatedlist) == limit and status != "Recently Paid":
            next = True
            updatedlist.pop()
    else:
            next = False   
    return  { "data":updatedlist,"next":next}



@frappe.whitelist()
def getPosInvoice(status, limit, limit_start):
    branch = getBranch()
    updatedlist = []
    limit = int(limit)+1
    limit_start = int(limit_start)
    if status == "Draft":
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, custom_merged_tables,
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number, 
                posting_date, rounded_total, order_type,
                custom_split_group, custom_split_from,
                custom_merged_pos_invoice, custom_merged_total,
                additional_discount_percentage, discount_amount
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s 
            AND (invoice_printed = 1 OR (invoice_printed = 0 AND COALESCE(restaurant_table, '') = ''))
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, status, limit,limit_start),
            as_dict=True,
        )
        updatedlist.extend(invoices)
    elif status == "Unbilled":
        
        docstatus = "Draft"
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, custom_merged_tables,
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number, 
                posting_date, rounded_total, order_type,
                custom_split_group, custom_split_from,
                custom_merged_pos_invoice, custom_merged_total,
                additional_discount_percentage, discount_amount
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s 
            AND (invoice_printed = 0 AND restaurant_table IS NOT NULL)
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, docstatus, limit, limit_start),
            as_dict=True,
        )
        updatedlist.extend(invoices)
    elif status == "Recently Paid":
        docstatus = "Paid"
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, custom_merged_tables,
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number,
                posting_date, rounded_total, order_type, additional_discount_percentage,
                discount_amount, custom_split_group, custom_split_from,
                custom_merged_pos_invoice, custom_merged_total
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s 
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, docstatus, limit, limit_start),
            as_dict=True,
        )
        updatedlist.extend(invoices)    
    else:
        
        invoices = frappe.db.sql(
            """
            SELECT 
                name, invoice_printed, grand_total, restaurant_table, custom_merged_tables,
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number,
                posting_date, rounded_total, order_type, additional_discount_percentage,
                discount_amount, custom_split_group, custom_split_from,
                custom_merged_pos_invoice, custom_merged_total
            FROM `tabPOS Invoice` 
            WHERE branch = %s AND status = %s 
            ORDER BY modified desc
            LIMIT %s OFFSET %s
            """,
            (branch, status, limit, limit_start),
            as_dict=True,
        )

        updatedlist.extend(invoices)
    if len(updatedlist) == limit and status != "Recently Paid":
            next = True
            updatedlist.pop()
    else:
            next = False
    updatedlist = _enrich_split_group_meta(updatedlist)
    return  { "data":updatedlist,"next":next}


@frappe.whitelist()
def searchPosInvoice(query,status):
    if not query:
        return {"data": [], "next": False}
    query = query.lower()
    filters = {"status": "Paid" if status == "Recently Paid" else status}
    
    try:
        branch = getBranch()
    except frappe.ValidationError:
        if frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles():
            branch = None
        else:
            raise
            
    if branch:
        filters["branch"] = branch

    # Add additional conditions for Unbilled status
    if status == "Unbilled":
        filters.update({
            "status":"draft",
            "restaurant_table": ["not in", [None, ""]],  # Check if restaurant_table has value
            "invoice_printed": 0  # Check if invoice_printed is 0
        })
    pos_invoices = frappe.get_all(
        "POS Invoice",
        filters=filters,           
        or_filters=[
            ["name", "like", f"%{query}%"],
            ["customer", "like", f"%{query}%"],
            ["mobile_number", "like", f"%{query}%"],
        ],
        fields=[
            "name",
            "customer",
            "grand_total",
            "posting_date",
            "posting_time",
            "order_type",
            "restaurant_table",
            "custom_merged_tables",
            "status",
            "rounded_total",
            "net_total",
            "mobile_number",
            "invoice_printed",
            "cashier",
            "waiter",
            "total_taxes_and_charges",
            "custom_split_group",
            "custom_split_from",
            "custom_merged_pos_invoice",
            "custom_merged_total",
            "additional_discount_percentage",
            "discount_amount"
        ],
        limit_page_length=10 
    )
    pos_invoices = _enrich_split_group_meta(pos_invoices)
    
    return {"data": pos_invoices, "next": len(pos_invoices) == 10}
    

@frappe.whitelist()
def get_select_field_options():
    options = frappe.get_meta("POS Invoice").get_field("order_type").options
    if options:
        return [{"name": option} for option in options.split("\n")]
    else:
        return []


@frappe.whitelist()
def fav_items(customer):
    if not frappe.has_permission("Customer", "read", customer):
        frappe.throw(_("Not permitted to access this Customer"), frappe.PermissionError)

    filters = {"customer": customer}
    try:
        branch = getBranch()
        if branch:
            filters["branch"] = branch
    except frappe.exceptions.ValidationError:
        # Fallback if getBranch() throws (e.g., Administrator with no branch)
        pass

    pos_invoices = frappe.get_all(
        "POS Invoice", filters=filters, fields=["name"]
    )
    item_qty = {}

    for invoice in pos_invoices:
        pos_invoice = frappe.get_doc("POS Invoice", invoice.name)
        for item in pos_invoice.items:
            item_name = item.item_name
            qty = item.qty
            if item_name not in item_qty:
                item_qty[item_name] = 0
            item_qty[item_name] += qty

    favorite_items = [
        {"item_name": item_name, "qty": qty} for item_name, qty in item_qty.items()
    ]
    return favorite_items

@frappe.whitelist()
def getCashier(room):
    branch = getBranch()
    cashier = None
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
    if pos_opening_list:
        cashier = frappe.db.get_value(
            "POS Opening Entry",
            {"name": pos_opening_list[0].name},
            "user",)
    return cashier       
    

@frappe.whitelist()
def getPosProfile():
    branchName = getBranch()
    waiter = frappe.session.user
    bill_present = False
    qz_host = None
    printer = None
    cashier = None
    owner = None
    posProfile = frappe.db.exists("POS Profile", {"branch": branchName})
    pos_profiles = frappe.get_doc("POS Profile", posProfile)
    global_defaults = frappe.get_single('Global Defaults')
    disable_rounded_total = global_defaults.disable_rounded_total
    

    if pos_profiles.branch == branchName:
        pos_profile_name = pos_profiles.name
        warehouse = pos_profiles.warehouse
        branch = pos_profiles.branch
        company = pos_profiles.company
        tableAttention = pos_profiles.table_attention_time
        get_cashier = frappe.get_doc("POS Profile", pos_profile_name)
        print_format = pos_profiles.print_format
        paid_limit=pos_profiles.paid_limit
        enable_discount = pos_profiles.custom_enable_discount
        multiple_cashier = pos_profiles.custom_enable_multiple_cashier
        edit_order_type = pos_profiles.custom_edit_order_type
        enable_kot_reprint = pos_profiles.custom_enable_kot_reprint
        if multiple_cashier:
            details = getBranchRoom()
            room = details[0].get('name') 
            branch = details[0].get('branch')

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
            if pos_opening_list:
                pos_opened_cashier = frappe.db.get_value(
                    "POS Opening Entry",
                    {"name": pos_opening_list[0].name},
                    "user",)
            else:
                pos_opened_cashier = None
            for user_details in get_cashier.applicable_for_users:
                if user_details.custom_main_cashier:
                    owner = user_details.user
                
                if frappe.session.user == owner:
                    cashier = owner
                else:
                    cashier = pos_opened_cashier    
                
        else:    
            cashier = get_cashier.applicable_for_users[0].user
            owner = get_cashier.applicable_for_users[0].user
        
        qz_print = pos_profiles.qz_print
        print_type = None

        printers = []
        for pos_profile in pos_profiles.printer_settings:
            
            if pos_profile.bill == 1:
                printers.append(pos_profile.printer)
                bill_present = True
                
        if printers:
            printer = ",".join(printers)

        if qz_print == 1:
            print_type = "qz"
            qz_host = pos_profiles.qz_host

        elif bill_present == True:
            print_type = "network"

        else:
            print_type = "socket"

    invoice_details = {
        "pos_profile": pos_profile_name,
        "branch": branch,
        "company": company,
        "waiter": waiter,
        "warehouse": warehouse,
        "cashier": cashier,
        "print_format": print_format,
        "qz_print": qz_print,
        "qz_host": qz_host,
        "printer": printer,
        "print_type": print_type,
        "tableAttention": tableAttention,
        "paid_limit":paid_limit,
        "disable_rounded_total":disable_rounded_total,
        "enable_discount":enable_discount,
        "multiple_cashier":multiple_cashier,
        "owner":owner,
        "edit_order_type":edit_order_type,
        "enable_kot_reprint":enable_kot_reprint

    }

    return invoice_details


@frappe.whitelist()
def getPosProfileFull(pos_profile):
    """Return the subset of POS Profile fields the POS frontend needs beyond
    getPosProfile()'s limited set (role-permission child tables, company/branch
    identity fields, etc). Cashier/Captain roles don't have doctype-level read
    permission on POS Profile, so the frontend can't fetch these via the raw
    `/api/resource/POS Profile/<name>` REST read - this whitelisted method
    reads server-side instead, scoped to the caller's own branch.
    """
    branch_name = getBranch()
    profile = frappe.get_doc("POS Profile", pos_profile)
    if profile.branch != branch_name:
        frappe.throw(frappe._("Not permitted to view this POS Profile"), frappe.PermissionError)

    return {
        "name": profile.name,
        "owner": profile.owner,
        "creation": profile.creation,
        "modified": profile.modified,
        "modified_by": profile.modified_by,
        "docstatus": profile.docstatus,
        "idx": profile.idx,
        "company": profile.company,
        "customer": profile.customer,
        "country": profile.country,
        "disabled": profile.disabled,
        "warehouse": profile.warehouse,
        "campaign": profile.campaign,
        "company_address": profile.company_address,
        "restaurant": profile.restaurant,
        "branch": profile.branch,
        "currency": profile.currency,
        "paid_limit": profile.paid_limit,
        "role_allowed_for_billing": [row.as_dict() for row in profile.role_allowed_for_billing],
        "role_restricted_for_table_order": [row.as_dict() for row in profile.role_restricted_for_table_order],
        "transfer_role_permissions": [row.as_dict() for row in profile.transfer_role_permissions],
        "view_all_status": profile.get("view_all_status"),
        "custom_daily_pos_close": profile.get("custom_daily_pos_close"),
    }


@frappe.whitelist()
def getPosInvoiceItems(invoice):
    itemDetails = []
    taxDetails = []
    orderdItems = frappe.get_doc("POS Invoice", invoice)
    
    if not frappe.has_permission("POS Invoice", "read", doc=orderdItems):
        frappe.throw(frappe._("Not permitted to view this order"), frappe.PermissionError)
        
    user_branch = getBranch()
    if orderdItems.branch and user_branch and orderdItems.branch != user_branch:
        frappe.throw(frappe._("Not permitted to view orders outside your active branch"), frappe.PermissionError)

    posItems = orderdItems.items
    for items in posItems:
        itemDetails.append(
            {
                "name": items.name,
                "item_name": items.item_name,
                "qty": items.qty,
                "rate": items.rate,
                "amount": items.amount,
                "is_disposable": items.is_disposable,
            }
        )
    taxDetail = orderdItems.taxes
    for tax in taxDetail:
        description = tax.description
        rate = tax.tax_amount
        taxDetails.append(
            {
                "description": description,
                "rate": rate,
            }
        )
    return itemDetails, taxDetails


@frappe.whitelist()
def posOpening():
    branchName = getBranch()
    pos_opening_list = frappe.get_all(
        "POS Opening Entry",
        fields=["name", "docstatus", "status", "posting_date"],
        filters={"branch": branchName},
    )
    flag = 1
    for pos_opening in pos_opening_list:
        if pos_opening.status == "Open" and pos_opening.docstatus == 1:
            flag = 0
    if flag == 1:
        frappe.msgprint(title="Message", indicator="red", msg=("Please Open POS Entry"))
    return flag


@frappe.whitelist()
def getAggregator():
    branchName = getBranch()
    aggregatorList = frappe.get_all(
        "Aggregator Settings",
        fields=["customer"],
        filters={"parent": branchName, "parenttype": "Branch"},
    )
    return aggregatorList


@frappe.whitelist()
def getAggregatorItem(aggregator):
    branchName = getBranch()
    aggregatorItem = []
    aggregatorItemList = []
    priceList = frappe.db.get_value(
        "Aggregator Settings",
        {"customer": aggregator, "parent": branchName, "parenttype": "Branch"},
        "price_list",
    )
    aggregatorItem = frappe.get_all(
        "Item Price",
        fields=["item_code", "item_name", "price_list_rate"],
        filters={"selling": 1, "price_list": priceList},
    )
    aggregatorItemList = [
        {
            "item": item.item_code,
            "item_name": item.item_name,
            "rate": item.price_list_rate,
            "item_image": frappe.db.get_value("Item", item.item, "image"),
        }
        for item in aggregatorItem
        if not frappe.db.get_value("Item", item.item_code, "disabled")
    ]
    return aggregatorItemList

@frappe.whitelist()
def getAggregatorMOP(aggregator):
    branchName = getBranch()
    
    modeOfPayment = frappe.db.get_value(
        "Aggregator Settings",
        {"customer": aggregator, "parent": branchName, "parenttype": "Branch"},
        "mode_of_payments",
    )
    modeOfPaymentsList = []
    modeOfPaymentsList.append(
            {"mode_of_payment": modeOfPayment, "opening_amount": float(0)}
    )
    return modeOfPaymentsList
@frappe.whitelist()
def create_customer(customer_name, mobile_number=None, customer_group="Individual", territory="India"):
    if not frappe.has_permission("Customer", "create"):
        frappe.throw("Not permitted to create customers", frappe.PermissionError)
        
    if not customer_name:
        frappe.throw("Customer name is required")
    if not mobile_number:
        frappe.throw("Mobile Number is required")
    try:
        validate_phone_number(mobile_number, throw=True)
    except Exception:
        frappe.throw("Invalid mobile number format")

    """Create a new customer"""
    try:
        if territory and not frappe.db.exists("Territory", territory):
            fallback_territory = frappe.db.get_single_value("Selling Settings", "territory")
            if fallback_territory and frappe.db.exists("Territory", fallback_territory):
                territory = fallback_territory
            else:
                territory = frappe.db.get_value("Territory", {"is_group": 1}, "name") or territory

        customer = frappe.get_doc({
            "doctype": "Customer",
            "customer_name": customer_name,
            "mobile_number": mobile_number,
            "customer_group": customer_group,
            "territory": territory
        })
        customer.insert()
        frappe.db.commit()

        return {
            "status": "success",
            "message": "Customer created successfully",
            # Additive link id — distinct from display `customer_name` when
            # naming series ≠ customer_name (e.g. CUST-00042 vs "Alice").
            "name": customer.name,
            "customer_name": customer_name,
            "mobile_number": mobile_number,
            "customer_group": customer_group,
            "territory": territory
        }

    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title="Customer Creation Failed")
        return {
            "status": "error",
            "message": str(e)
        }

@frappe.whitelist()
def get_open_pos_opening_entries(pos_profile):
    """Currently open (status=Open, submitted) POS Opening Entries for the
    given POS Profile. Backs the React Closing flow (pos-closing-api.ts's
    getOpenPosOpeningEntries) so it can find the requesting user's own
    session -- referenced there since the POSClosingDialog work landed, but
    never actually implemented until now (found via a live E2E test: the
    Close Shift dialog failed outright with "no attribute
    'get_open_pos_opening_entries'").

    Scoped by branch (the POS Profile must belong to the session user's
    branch) and, for non-supervisors, by user (only their own open entries
    are returned) -- matches this file's existing getBranch()/System Manager
    supervisor-bypass convention used elsewhere (e.g. searchPosInvoice,
    fav_items).
    """
    if not frappe.has_permission("POS Opening Entry", "read"):
        frappe.throw(_("Not permitted to view POS Opening Entries."), frappe.PermissionError)

    session_user = frappe.session.user
    is_supervisor = session_user == "Administrator" or "System Manager" in frappe.get_roles()

    try:
        session_branch = getBranch()
    except frappe.ValidationError:
        if is_supervisor:
            # Supervisors may not be mapped to a branch
            session_branch = None
        else:
            raise

    profile_branch = frappe.db.get_value("POS Profile", pos_profile, "branch")

    if not profile_branch:
        frappe.throw(
            _("POS Profile {0} not found.").format(pos_profile),
            frappe.DoesNotExistError,
        )

    if session_branch and profile_branch != session_branch:
        frappe.throw(
            _("You do not have permission to access opening entries for POS Profile {0}.").format(
                pos_profile
            ),
            frappe.PermissionError,
        )

    filters = {
        "pos_profile": pos_profile,
        "status": "Open",
        "docstatus": 1,
    }

    # Non-supervisors only see their own open entries
    if not is_supervisor:
        filters["user"] = session_user

    return frappe.get_all(
        "POS Opening Entry",
        filters=filters,
        fields=["name", "period_start_date", "user", "pos_profile"],
    )


@frappe.whitelist()
def validate_pos_close(pos_profile):
    enable_unclosed_pos_check = frappe.db.get_value("POS Profile",pos_profile,"custom_daily_pos_close")
    
    if enable_unclosed_pos_check:
        current_datetime = frappe.utils.now_datetime()
        start_of_day = current_datetime.replace(hour=5, minute=0, second=0, microsecond=0)
        
        if current_datetime > start_of_day:
            previous_day = start_of_day - timedelta(days=1)
            
        else:
            previous_day = start_of_day
    
        # A session left open for 2+ days (missed close, not just yesterday's)
        # must still be caught, not just one opened exactly on `previous_day`.
        unclosed_pos_opening = frappe.db.exists(
            "POS Opening Entry",
            {
                "posting_date": ["<=", previous_day.date()],
                "status": "Open",
                "pos_profile": pos_profile,
                "docstatus": 1
            }
        )
    
        if unclosed_pos_opening:
            return "Failed"
        
        return "Success"
    
    return "Success"


def _get_allowed_pos_profiles(company: str, user: str) -> list:
    """Return POS Profiles the user may open for the given company.

    Replicates ``erpnext.accounts.doctype.pos_profile.pos_profile.pos_profile_query``:
    non-disabled profiles for the company where the user is listed in
    ``applicable_for_users`` or where ``applicable_for_users`` is empty.

    Returns a list of ``{"name": ..., "label": ...}`` dicts suitable for the
    ORI POS Opening screen.
    """
    if not company or not user:
        return []

    profiles = frappe.get_all(
        "POS Profile",
        filters={"company": company, "disabled": 0},
        fields=["name"],
    )
    if not profiles:
        return []

    profile_names = [p["name"] for p in profiles]

    # Bulk-fetch applicable users for all candidate profiles.
    user_rows = frappe.get_all(
        "POS Profile User",
        filters={"parent": ["in", profile_names], "parenttype": "POS Profile"},
        fields=["parent", "user"],
    )

    profile_users = {}
    for row in user_rows:
        profile_users.setdefault(row["parent"], set()).add(row["user"])

    allowed_names = [
        name
        for name in profile_names
        if not profile_users.get(name) or user in profile_users[name]
    ]

    if not allowed_names:
        return []

    return [{"name": name, "label": name} for name in sorted(allowed_names)]


def _get_main_cashier_status(pos_profile_name: str) -> dict:
    """Return multi-cashier status for the given POS Profile.

    Returns ``{"enabled": bool, "main_cashier_configured": bool,
    "main_cashier_open": bool}``.
    """
    if not pos_profile_name:
        return {"enabled": False, "main_cashier_configured": False, "main_cashier_open": False}

    try:
        pos_profile_doc = frappe.get_doc("POS Profile", pos_profile_name)
        enabled = bool(pos_profile_doc.custom_enable_multiple_cashier)

        main_cashier = None
        for user_row in pos_profile_doc.applicable_for_users:
            if user_row.custom_main_cashier:
                main_cashier = user_row.user
                break

        main_cashier_configured = bool(main_cashier)
        main_cashier_open = False
        if main_cashier:
            today = frappe.utils.today()
            main_cashier_open = bool(
                frappe.db.exists(
                    "POS Opening Entry",
                    {
                        "user": main_cashier,
                        "pos_profile": pos_profile_name,
                        "posting_date": today,
                        "status": "Open",
                        "docstatus": 1,
                    },
                )
            )

        return {
            "enabled": enabled,
            "main_cashier_configured": main_cashier_configured,
            "main_cashier_open": main_cashier_open,
        }
    except Exception:
        return {"enabled": False, "main_cashier_configured": False, "main_cashier_open": False}


@frappe.whitelist()
def create_pos_opening_entry(pos_profile: str, company: str = None, balance_details=None) -> dict:
    """Create and submit a POS Opening Entry for the ORI native screen.

    Wraps the standard ERPNext flow but fills URY-mandatory fields
    (branch, restaurant, and company) from the selected POS Profile so ORI
    users do not need to leave the React app, and so a caller cannot submit
    an Opening Entry against a company the POS Profile isn't actually
    configured for.

    ``balance_details`` may be a JSON string (legacy Desk shape) or a list of
    ``{"mode_of_payment": ..., "opening_amount": ...}`` dicts.
    """
    if not frappe.has_permission("POS Opening Entry", "create"):
        frappe.throw(_("Not permitted to create POS Opening Entry"), frappe.PermissionError)

    if not frappe.has_permission("POS Opening Entry", "submit"):
        frappe.throw(_("Not permitted to submit POS Opening Entry"), frappe.PermissionError)

    if isinstance(balance_details, str):
        balance_details = json.loads(balance_details)

    pos_profile_doc = frappe.get_doc("POS Profile", pos_profile)

    if not pos_profile_doc.branch:
        frappe.throw(_("Selected POS Profile has no Branch."))
    if not pos_profile_doc.restaurant:
        frappe.throw(_("Selected POS Profile has no Restaurant."))
    if not pos_profile_doc.company:
        frappe.throw(_("Selected POS Profile has no Company."))

    if not frappe.has_permission("POS Profile", "read", doc=pos_profile_doc):
        frappe.throw(_("Not permitted to use this POS Profile."), frappe.PermissionError)

    # U24: derive company from the resolved POS Profile the same way
    # branch/restaurant already are, rather than trusting a caller-supplied
    # value that may not match the profile at all.
    company = pos_profile_doc.company

    for entry in balance_details or []:
        opening_amount = entry.get("opening_amount") if isinstance(entry, dict) else None
        if opening_amount is not None and frappe.utils.flt(opening_amount) < 0:
            frappe.throw(_("Opening amount cannot be negative."))

    opening = frappe.get_doc(
        {
            "doctype": "POS Opening Entry",
            "period_start_date": frappe.utils.get_datetime(),
            "posting_date": frappe.utils.getdate(),
            "user": frappe.session.user,
            "company": company,
            "pos_profile": pos_profile,
            "branch": pos_profile_doc.branch,
            "restaurant": pos_profile_doc.restaurant,
        }
    )
    opening.set("balance_details", balance_details)
    opening.submit()

    return opening.as_dict()


@frappe.whitelist()
def get_pos_opening_screen_data() -> dict:
    """Return the full context needed by the ORI native POS Opening screen.

    This is a read-only, permission-aware context call. It aggregates the
    current user/company, the POS Profiles the user may open, the active
    POS Profile data (including branch, restaurant and multi-cashier flags),
    payment modes seeded with an opening amount of zero, the daily-close
    pre-check status, create/submit permission flags, and any existing open
    POS Opening Entry for the current user.

    The method does not create or mutate any document; submit-time
    validations (payment accounts, duplicate entries, multi-cashier rules)
    remain on the server.
    """
    user = frappe.session.user

    # Company resolution: user default first, then global default.
    company = frappe.defaults.get_user_default("Company")
    if not company:
        company = frappe.db.get_default("Company")

    allowed_profiles = _get_allowed_pos_profiles(company, user)

    # Resolve the active POS Profile. Prefer the existing URY helper; fall
    # back to the first allowed profile if the helper cannot resolve one.
    pos_profile_data = None
    pos_profile_name = None
    try:
        pos_profile_data = getPosProfile()
        pos_profile_name = pos_profile_data.get("pos_profile")
    except Exception:
        pos_profile_data = None
        pos_profile_name = None

    if not pos_profile_name and allowed_profiles:
        pos_profile_name = allowed_profiles[0]["name"]
        try:
            pos_profile_doc = frappe.get_doc("POS Profile", pos_profile_name)
            pos_profile_data = {
                "pos_profile": pos_profile_doc.name,
                "branch": pos_profile_doc.branch,
                "company": pos_profile_doc.company,
                "restaurant": pos_profile_doc.restaurant,
                "warehouse": pos_profile_doc.warehouse,
                "cashier": user,
                "multiple_cashier": pos_profile_doc.custom_enable_multiple_cashier,
                "custom_daily_pos_close": pos_profile_doc.custom_daily_pos_close,
            }
        except Exception:
            pos_profile_data = None

    # Payment modes with opening_amount default 0.
    payment_modes = []
    if pos_profile_name:
        try:
            pos_profile_doc = frappe.get_doc("POS Profile", pos_profile_name)
            payment_modes = [
                {"mode_of_payment": mop.mode_of_payment, "opening_amount": 0.0}
                for mop in pos_profile_doc.payments
            ]
        except Exception:
            payment_modes = []

    # Daily close pre-check for the selected POS Profile.
    daily_close_pending = False
    if pos_profile_name:
        try:
            daily_close_pending = validate_pos_close(pos_profile_name) == "Failed"
        except Exception:
            daily_close_pending = False

    # Multi-cashier status for the selected POS Profile.
    multi_cashier = _get_main_cashier_status(pos_profile_name)

    # DocType permission flags for POS Opening Entry.
    can_create = bool(frappe.has_permission("POS Opening Entry", "create"))
    can_submit = bool(frappe.has_permission("POS Opening Entry", "submit"))

    # Existing open entries for the current user (user-wide check).
    open_entries = frappe.get_all(
        "POS Opening Entry",
        filters={
            "user": user,
            "docstatus": 1,
            "status": "Open",
        },
        fields=[
            "name",
            "company",
            "pos_profile",
            "period_start_date",
            "branch",
            "status",
        ],
        order_by="period_start_date desc",
    )

    # Currency information for display.
    company_currency = None
    currency_symbol = None
    if company:
        try:
            company_doc = frappe.get_doc("Company", company)
            company_currency = company_doc.default_currency
            currency_symbol = frappe.db.get_value(
                "Currency", company_currency, "symbol"
            )
        except Exception:
            company_currency = None
            currency_symbol = None

    user_full_name = None
    try:
        user_full_name = frappe.db.get_value("User", user, "full_name")
    except Exception:
        user_full_name = None

    return {
        "user": user,
        "user_full_name": user_full_name,
        "company": company,
        "company_currency": company_currency,
        "currency_symbol": currency_symbol,
        "allowed_profiles": allowed_profiles,
        "selected_profile": pos_profile_name,
        "branch": pos_profile_data.get("branch") if pos_profile_data else None,
        "restaurant": pos_profile_data.get("restaurant") if pos_profile_data else None,
        "payment_modes": payment_modes,
        "daily_close_pending": daily_close_pending,
        "multi_cashier": multi_cashier,
        "permissions": {"create": can_create, "submit": can_submit},
        "open_entries": open_entries,
    }


def _validate_checklist_branch(pos_profile):
    """Ensure the session user's branch matches the given POS Profile's branch."""
    session_branch = getBranch()
    profile_branch = frappe.db.get_value("POS Profile", pos_profile, "branch")

    if not profile_branch:
        frappe.throw(
            _("POS Profile {0} not found.").format(pos_profile),
            frappe.DoesNotExistError,
        )

    if profile_branch != session_branch:
        frappe.throw(
            _("You do not have permission to access the checklist for POS Profile {0}.").format(
                pos_profile
            ),
            frappe.PermissionError,
        )


# Dependent Checklist Option -> the checklist-type gates that collect it.
# "Order Taking" and "RM Checklist" have no dedicated frontend checklist type
# of their own: they ride along with the Opening gate (captain route entry)
# and the Closing gate (manager shift close) so that every configured row has
# a UI path through the same ChecklistGateDialog card flow instead of being
# silently dropped (the desk APIs that used to own them are gone/unwired).
OPTIONS_BY_CHECKLIST_TYPE = {
    "Opening": ["POS Opening Entry", "Order Taking"],
    "Closing": ["POS Closing Entry", "RM Checklist"],
}


def _role_matched_dependent_goals(pos_profile, checklist_type):
    """Quality Goals from the POS Profile's Dependent Checklist (grillax port)
    whose Option belongs to this checklist type and whose Role is assigned to
    the session user."""
    mapped_options = OPTIONS_BY_CHECKLIST_TYPE.get(checklist_type)
    if not mapped_options:
        return []

    rows = frappe.get_all(
        "Dependent Checklist",
        fields=["quality_checklist", "select_2", "role"],
        filters={"parent": pos_profile, "parenttype": "POS Profile"},
    )
    if not rows:
        return []

    user_roles = set(frappe.get_roles())
    return [
        row.quality_checklist
        for row in rows
        if row.select_2 in mapped_options and row.role in user_roles
    ]


def _checklist_period_date(branch):
    """Date the grillax validations compare Quality Reviews against: the open
    shift's posting date when one exists, else today."""
    open_shift = frappe.get_all(
        "POS Opening Entry",
        fields=["posting_date"],
        filters={"branch": branch, "docstatus": 1, "status": "Open"},
        limit=1,
    )
    if open_shift:
        return open_shift[0].posting_date
    return date.today()


def _existing_goal_review(goal, branch, period_date):
    """The session user's live Quality Review for this goal/period, if any.

    No document-status filter: ERPNext derives the review's doc-level status
    from its rows, so a review recording a failure has status "Failed" -- it
    is still the user's live review and must be found for updates/resume."""
    name = frappe.db.exists(
        "Quality Review",
        {
            "goal": goal,
            "branch": branch,
            "date": period_date,
            "owner": frappe.session.user,
        },
    )
    return frappe.get_doc("Quality Review", name) if name else None


def _goal_objectives(goal):
    return frappe.get_doc("Quality Goal", goal).objectives or []


def _goal_review_pending(goal, branch, period_date):
    """A goal is done once the session user's review exists and every
    objective has an explicit result -- Passed or Failed both count (a
    recorded failure is a final answer, not an incomplete one). Rows still
    Open (or written before this flow existed) keep the goal pending."""
    review = _existing_goal_review(goal, branch, period_date)
    if not review:
        return True
    return any(row.status not in ("Passed", "Failed") for row in review.reviews or [])


def _item_status(state):
    """Resolve a submitted item's explicit status. New frontends send
    status="Passed"/"Failed"; the legacy is_checked contract maps
    True -> Passed and False/omitted -> Open."""
    status = state.get("status")
    if status in ("Passed", "Failed"):
        return status
    return "Passed" if state.get("is_checked") else "Open"


def _require_remarks_for_failures(item_states):
    for label, state in item_states.items():
        if _item_status(state) == "Failed" and not (state.get("remarks") or "").strip():
            frappe.throw(
                _("Remarks are required for failed checklist items: {0}").format(label),
                frappe.ValidationError,
            )


def _review_row(objective, state):
    return {
        "objective": objective.objective,
        "target": objective.target,
        "uom": objective.uom,
        "status": _item_status(state),
        "review": state.get("remarks") or "",
    }


def _create_goal_review(goal, branch, period_date, item_states):
    """Create the Quality Review that satisfies the grillax checklist
    validations (POS Opening/Closing hooks) for one Dependent Checklist goal.
    Each objective's status mirrors the checkbox the user actually ticked in
    the POS checklist UI."""
    review = frappe.new_doc("Quality Review")
    review.goal = goal
    review.date = period_date
    review.branch = branch
    review.employee = frappe.session.user
    remarks = next(
        (state.get("remarks") for state in item_states.values() if state.get("remarks")),
        None,
    )
    if remarks:
        review.additional_information = remarks

    for objective in _goal_objectives(goal):
        review.append("reviews", _review_row(objective, item_states.get(objective.objective, {})))

    review.insert()
    return review.name


def _update_goal_review(review, item_states):
    """Fold a resubmitted checklist into the existing review: update statuses
    for objectives already on it, append rows for objectives it doesn't have."""
    seen = {row.objective for row in review.reviews or []}
    for row in review.reviews or []:
        state = item_states.get(row.objective)
        if state is None:
            continue
        row.status = _item_status(state)
        if state.get("remarks"):
            row.review = state["remarks"]

    for objective in _goal_objectives(review.goal):
        if objective.objective in seen:
            continue
        review.append(
            "reviews",
            _review_row(objective, item_states.get(objective.objective, {})),
        )

    review.save()
    return review.name


@frappe.whitelist()
def get_checklist(pos_profile, checklist_type):
    _validate_checklist_branch(pos_profile)

    configured_items = frappe.get_all(
        "URY Checklist Item",
        fields=["item_label", "applies_to", "is_mandatory"],
        filters={"parent": pos_profile, "applies_to": ["in", [checklist_type, "Both"]]},
        parent_doctype="POS Profile",
    )

    # Merge in the role-based Dependent Checklist (grillax port): pending
    # goals expand into their individual Quality Goal objectives so the UI
    # lists checkable tasks instead of the goal's document name. The goal name
    # rides along on each item for submit-time Quality Review creation, and
    # each item carries its previously saved result so reopening the gate
    # restores the user's last PASS/FAIL selection.
    branch = getBranch()
    goals = _role_matched_dependent_goals(pos_profile, checklist_type)
    period_date = _checklist_period_date(branch) if goals else None
    goal_items = []
    pending_goals = []
    for goal in goals:
        review = _existing_goal_review(goal, branch, period_date)
        states = (
            {row.objective: row for row in review.reviews or []} if review else {}
        )
        objectives = [o.objective for o in _goal_objectives(goal)]
        if not objectives:
            # Goal without configured objectives: the goal name is the item.
            if not review:
                pending_goals.append(goal)
                goal_items.append(
                    {
                        "item_label": goal,
                        "is_mandatory": 1,
                        "applies_to": checklist_type,
                        "goal": goal,
                        "status": None,
                        "remarks": "",
                    }
                )
            continue
        # An objective is answered once its review row is Passed or Failed.
        # While ANY objective is still unanswered (no row / Open), the
        # unanswered ones resurface for completion and the answered Failed
        # ones resurface alongside them -- prefilled -- so the failure stays
        # visible and correctable. Once EVERY objective is answered, nothing
        # resurfaces: a recorded failure is final and must not reopen the
        # gate on every status re-check (which looped the UI after submit).
        unanswered = {
            o
            for o in objectives
            if states.get(o) is None or states[o].status not in ("Passed", "Failed")
        }
        if not unanswered:
            continue
        remaining = [
            o
            for o in objectives
            if o in unanswered
            or (states.get(o) is not None and states[o].status == "Failed")
        ]
        if remaining:
            pending_goals.append(goal)
            goal_items += [
                {
                    "item_label": o,
                    "is_mandatory": 1,
                    "applies_to": checklist_type,
                    "goal": goal,
                    "status": (
                        states[o].status
                        if states.get(o) and states[o].status in ("Passed", "Failed")
                        else None
                    ),
                    "remarks": (states[o].review or "") if states.get(o) else "",
                }
                for o in remaining
            ]

    if not configured_items and not goals:
        return {
            "items": [],
            "log_name": None,
            "log_status": "Complete",
        }

    existing_log = frappe.get_all(
        "URY POS Checklist Log",
        fields=["name", "status"],
        filters={
            "pos_profile": pos_profile,
            "checklist_type": checklist_type,
            "shift_date": date.today(),
        },
        limit=1,
    )

    # Prefill legacy items with the user's previously saved result so
    # reopening an in-progress log restores the last PASS/FAIL selection.
    if existing_log:
        log_rows = frappe.get_all(
            "URY Checklist Log Item",
            fields=["item_label", "is_checked", "status", "remarks"],
            filters={"parent": existing_log[0].name},
        )
        log_states = {row.item_label: row for row in log_rows}
        for item in configured_items:
            saved = log_states.get(item.item_label)
            if not saved:
                continue
            saved_status = saved.status or ("Passed" if saved.is_checked else None)
            item["status"] = (
                saved_status if saved_status in ("Passed", "Failed") else None
            )
            item["remarks"] = saved.remarks or ""

    items = list(configured_items) + goal_items

    log_name = None
    log_status = None
    if existing_log:
        log_name = existing_log[0].name
        log_status = existing_log[0].status
    if not items:
        log_status = "Complete"
    elif pending_goals and log_status == "Complete":
        # Legacy log is complete but role-based goals are still pending --
        # keep the gate open, otherwise the grillax validations block
        # opening/closing server-side with no way to clear them from the UI.
        log_status = None

    return {
        "items": items,
        "log_name": log_name,
        "log_status": log_status,
    }


@frappe.whitelist()
def submit_checklist(pos_profile, checklist_type, items, pos_opening_entry=None):
    _validate_checklist_branch(pos_profile)

    configured_items = frappe.get_all(
        "URY Checklist Item",
        fields=["item_label", "is_mandatory"],
        filters={"parent": pos_profile, "applies_to": ["in", [checklist_type, "Both"]]},
        parent_doctype="POS Profile",
    )
    goals = _role_matched_dependent_goals(pos_profile, checklist_type)

    if not configured_items and not goals:
        return {
            "status": "Complete",
            "name": None,
        }

    items = json.loads(items)

    # A FAIL without a reason is not submittable -- enforced server-side in
    # addition to the frontend gate.
    _require_remarks_for_failures(
        {item.get("item_label"): item for item in items if item.get("item_label")}
    )

    # Persist role-based checklist completions as Quality Reviews (grillax
    # model) so the POS Opening/Closing validations and the desk flows all
    # see the same completion state. Items carry the goal they belong to
    # (falling back to matching the objective text against the role-matched
    # goals); each objective's review row mirrors the user's checkbox, and a
    # resubmission updates the existing review instead of duplicating it.
    branch = getBranch()
    period_date = _checklist_period_date(branch) if goals else None
    objective_goal = {}
    for goal in goals:
        for objective in _goal_objectives(goal):
            objective_goal[objective.objective] = goal

    items_by_goal = {}
    for item in items:
        label = item.get("item_label")
        if not label:
            continue
        goal = (
            item.get("goal")
            if item.get("goal") in goals
            else objective_goal.get(label)
        )
        if goal:
            items_by_goal.setdefault(goal, {})[label] = item

    for goal, item_states in items_by_goal.items():
        review = _existing_goal_review(goal, branch, period_date)
        if review:
            _update_goal_review(review, item_states)
        else:
            _create_goal_review(goal, branch, period_date, item_states)

    existing_log = frappe.get_all(
        "URY POS Checklist Log",
        fields=["name", "status"],
        filters={
            "pos_profile": pos_profile,
            "checklist_type": checklist_type,
            "shift_date": date.today(),
        },
        limit=1,
    )

    if not configured_items:
        # No legacy items: completion is driven purely by Quality Reviews.
        if existing_log:
            return {
                "status": existing_log[0].status,
                "name": existing_log[0].name,
            }
        goals_pending = any(
            _goal_review_pending(goal, branch, period_date) for goal in goals
        )
        return {
            "status": "In Progress" if goals_pending else "Complete",
            "name": None,
        }

    mandatory_by_label = {row.item_label: row.is_mandatory for row in configured_items}

    if existing_log:
        log_doc = frappe.get_doc("URY POS Checklist Log", existing_log[0].name)
    else:
        log_doc = frappe.new_doc("URY POS Checklist Log")
        log_doc.pos_profile = pos_profile
        log_doc.branch = branch
        log_doc.checklist_type = checklist_type
        log_doc.shift_date = date.today()

    if pos_opening_entry:
        log_doc.pos_opening_entry = pos_opening_entry

    log_doc.set("items", [])
    for item in items:
        status = _item_status(item)
        log_doc.append(
            "items",
            {
                "item_label": item.get("item_label"),
                # Dependent Checklist goals are always mandatory; legacy
                # items keep their own configured flag.
                "is_mandatory": 1
                if item.get("item_label") in goals
                else mandatory_by_label.get(item.get("item_label"), 0),
                # is_checked is kept in sync with the explicit status so
                # pre-change consumers (and pre-change rows, read back via
                # the is_checked fallback below) keep working.
                "is_checked": 1 if status == "Passed" else 0,
                "status": status,
                "remarks": item.get("remarks"),
            },
        )

    def _row_answered(row):
        # Rows written before the status field existed have status=None and
        # fall back to is_checked.
        saved = row.status or ("Passed" if row.is_checked else None)
        return saved in ("Passed", "Failed")

    all_mandatory_answered = all(
        _row_answered(row) for row in log_doc.items if row.is_mandatory
    )

    if all_mandatory_answered:
        log_doc.status = "Complete"
        log_doc.completed_by = frappe.session.user
        log_doc.completed_at = frappe.utils.now()
    else:
        log_doc.status = "In Progress"

    log_doc.save()

    # A complete legacy log does not override still-pending Quality Reviews.
    goals_pending = any(
        _goal_review_pending(goal, branch, period_date) for goal in goals
    )
    if goals_pending:
        return {
            "status": "In Progress",
            "name": log_doc.name,
        }

    return {
        "status": log_doc.status,
        "name": log_doc.name,
    }


@frappe.whitelist()

def merge_bills(primary_invoice, secondary_invoice):

    try:

        if primary_invoice == secondary_invoice:
            frappe.throw("Cannot merge an invoice with itself.")

        primary_doc = frappe.get_doc("POS Invoice", primary_invoice)
        secondary_doc = frappe.get_doc("POS Invoice", secondary_invoice)

        # Authorization: caller must have write permission on both invoices
        if not frappe.has_permission("POS Invoice", "write", doc=primary_doc):
            frappe.throw(
                "You do not have permission to merge this bill.",
                frappe.PermissionError,
            )

        if not frappe.has_permission("POS Invoice", "write", doc=secondary_doc):
            frappe.throw(
                "You do not have permission to merge the selected bill.",
                frappe.PermissionError,
            )

          # Prevent cross-branch merging
        if primary_doc.branch != secondary_doc.branch:
            frappe.throw(
                "Cannot merge bills from different branches.",
                frappe.PermissionError,
            )

        # Validation
        if (primary_doc.docstatus != 0 or secondary_doc.docstatus != 0):
            frappe.throw("Both invoices must be in Draft state to merge.")

        if primary_doc.branch != secondary_doc.branch:
            frappe.throw("Cannot merge bills from different branches.")

        if primary_doc.custom_merged_pos_invoice:
            frappe.throw("This bill already includes a merged bill.")

        if secondary_doc.custom_merged_pos_invoice:
            frappe.throw("The selected bill already includes another bill.")

        if not secondary_doc.items:
            frappe.throw("The selected bill has no items to merge.")


        def update_merge_details(target_invoice,source_invoice,):

            doc = frappe.get_doc("POS Invoice",target_invoice,)

            # clear old rows
            doc.set("custom_merged_pos_invoice_details",[],)

            # only linked invoice items
            for item in source_invoice.items:

                doc.append(
                    "custom_merged_pos_invoice_details",
                    {
                        "item_code": item.item_code,
                        "item_name": item.item_name,
                        "qty": item.qty,
                        "rate": item.rate,
                        "amount": item.amount,
                    },
                )

            doc.custom_merged_total = source_invoice.rounded_total

            doc.flags.ignore_version = True

            doc.save(
                ignore_version=True,
            )


        # Update merge references directly
        frappe.db.set_value(
            "POS Invoice",
            primary_doc.name,
            "custom_merged_pos_invoice",
            secondary_doc.name,
            update_modified=False,
        )

        frappe.db.set_value(
            "POS Invoice",
            secondary_doc.name,
            "custom_merged_pos_invoice",
            primary_doc.name,
            update_modified=False,
        )


        # Build detail table
        update_merge_details(primary_doc.name,secondary_doc,)

        update_merge_details(secondary_doc.name,primary_doc,)


        frappe.db.commit()


        return {
            "status": "success",
            "message": "Bills merged successfully",
            "name": primary_doc.name,
        }


    except frappe.PermissionError:

        frappe.db.rollback()

        raise


    except Exception as e:

        frappe.db.rollback()

        frappe.log_error(
            title="Bill Merge Error",
            message=frappe.get_traceback(),
        )

        return {
            "status": "error",
            "message": str(e),
        }


@frappe.whitelist()
def ensure_payment_mode_accounts(modes, company):
    """Ensure every Mode of Payment in `modes` has a default account for `company`.

    Called from the frontend POS Profile form right before save, so a payment
    mode with no company-scoped default account (e.g. Cheque, Credit Card,
    Zomato, Swiggy, Direct -- anything the dev-seed's Cash/Card/UPI wiring
    never covers) doesn't crash ERPNext's standard POS Profile validation
    ("Please set default Cash or Bank account in Mode of Payments ...").
    """
    from ury.ury.dev_seed.profiles import _ensure_mode_of_payment

    # Mode of Payment / Account records are accounts-configuration data, so
    # require the same permission ERPNext's own Mode of Payment desk form
    # requires (Accounts Manager / URY Manager per this app's DocPerm
    # fixtures -- System Manager is NOT granted create on either doctype
    # here, live-verified) -- not just any authenticated session.
    if not frappe.has_permission("Mode of Payment", "create") or not frappe.has_permission("Account", "create"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    if isinstance(modes, str):
        modes = frappe.parse_json(modes)
    if not modes or not company:
        return []

    ensured = []
    for mode in modes:
        if not mode:
            continue
        _ensure_mode_of_payment(mode, company)
        ensured.append(mode)
    return ensured

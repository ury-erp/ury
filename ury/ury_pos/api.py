import frappe
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

@frappe.whitelist()
def getRestaurantMenu(pos_profile, room=None, order_type=None):
    menu_items = []
    menu_items_with_image = []

    user_role = frappe.get_roles()

    pos_profile = frappe.get_doc("POS Profile", pos_profile)

    cashier = any(
        role.role in user_role for role in pos_profile.role_allowed_for_billing
    )
    branch_name = getBranch()
    restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch_name}, "name")
    
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
def getMenuCourses():
    courses = frappe.get_all("URY Menu Course", fields=["name"])
    return [{"name": d.name, "label": _(d.name)} for d in courses]

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
def validate_pos_close(pos_profile): 
    enable_unclosed_pos_check = frappe.db.get_value("POS Profile",pos_profile,"custom_daily_pos_close")
    
    if enable_unclosed_pos_check:
        current_datetime = frappe.utils.now_datetime()
        start_of_day = current_datetime.replace(hour=5, minute=0, second=0, microsecond=0)
        
        if current_datetime > start_of_day:
            previous_day = start_of_day - timedelta(days=1)
            
        else:
            previous_day = start_of_day
    
        unclosed_pos_opening = frappe.db.exists(
            "POS Opening Entry",
            {
                "posting_date": previous_day.date(),
                "status": "Open",
                "pos_profile": pos_profile,
                "docstatus": 1
            }
        )
    
        if unclosed_pos_opening:
            return "Failed"
        
        return "Success"
    
    return "Success"


@frappe.whitelist()
def merge_bills(primary_invoice, secondary_invoice):

    try:

        if primary_invoice == secondary_invoice:
            frappe.throw("Cannot merge an invoice with itself.")

        primary_doc = frappe.get_doc("POS Invoice",primary_invoice,)
        secondary_doc = frappe.get_doc("POS Invoice",secondary_invoice,)

        # Authorization: caller must have write permission on BOTH invoices
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
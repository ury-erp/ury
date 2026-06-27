import frappe
from frappe import _
from frappe.utils import flt, validate_phone_number
from datetime import datetime, timedelta


@frappe.whitelist()
def getRestaurantMenu(pos_profile, room=None, order_type=None):
    menu_items_with_image = []

    user_roles = set(frappe.get_roles())

    # Check billing roles without loading full POS Profile document
    billing_roles = frappe.get_all(
        "POS Profile Role",
        filters={"parent": pos_profile},
        fields=["role"],
        pluck="role",
    )
    cashier = bool(user_roles.intersection(billing_roles))

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
    
    # Batch-fetch item images in a single query
    item_codes = [item.item for item in menu_items]
    image_map = {}
    if item_codes:
        image_rows = frappe.db.get_values(
            "Item",
            {"name": ("in", item_codes)},
            ["name", "image"],
            as_dict=True,
        )
        image_map = {row.name: row.image for row in image_rows}

    menu_items_with_image = [
        {
            "item": item.item,
            "item_name": _(item.item_name) if item.item_name else item.item_name,
            "rate": item.rate,
            "special_dish": item.special_dish,
            "disabled": item.disabled,
            "item_image": image_map.get(item.item),
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
        frappe.throw(_("User is not associated with any branch. Please refresh the page."))

    branch_name = branch_array[0].get("branch")

    return branch_name

def _get_user_branch_rooms():
    """Shared query for user's branch-room mapping."""
    return frappe.db.sql("""
        SELECT b.branch, a.room
        FROM `tabURY User` AS a
        INNER JOIN `tabBranch` AS b ON a.parent = b.name
        WHERE a.user = %s
    """, frappe.session.user, as_dict=True)

@frappe.whitelist()
def getBranchRoom():
    rows = _get_user_branch_rooms()
    if not rows:
        frappe.throw(_("No branch or room information found for the user. Please contact your administrator."))
    row = rows[0]
    if not row.branch:
        frappe.throw(_("Branch information is missing for the user. Please contact your administrator."))
    if not row.room:
        frappe.throw(_("No room assigned to this user. Please contact your administrator."))
    return [{"name": row.room, "branch": row.branch}]

@frappe.whitelist()
def getRoom():
    rows = _get_user_branch_rooms()
    if not rows:
        frappe.throw(_("No branch or room information found for the user. Please contact your administrator."))
    return [{"name": row.room, "branch": row.branch} for row in rows]

@frappe.whitelist()
def getModeOfPayment():
    posDetails = getPosProfile()
    posProfile = posDetails["pos_profile"]
    payments = frappe.get_all(
        "POS Profile Payment",
        filters={"parent": posProfile},
        fields=["mode_of_payment"],
    )
    return [{"mode_of_payment": p.mode_of_payment, "opening_amount": 0.0} for p in payments]

def _get_invoices_list(branch, status, limit, limit_start, cashier=None):
    """Shared invoice list query logic for getPosInvoice and getInvoiceForCashier."""
    limit = int(limit) + 1
    limit_start = int(limit_start)
    
    base_fields = """name, invoice_printed, grand_total, restaurant_table, 
                cashier, waiter, net_total, posting_time, 
                total_taxes_and_charges, customer, status, mobile_number, 
                posting_date, rounded_total, order_type"""
    extra_fields = ", additional_discount_percentage, discount_amount"
    
    if status == "Draft":
        sql_status = status
        extra_where = "AND (invoice_printed = 1 OR (invoice_printed = 0 AND COALESCE(restaurant_table, '') = ''))"
        use_extra_fields = False
    elif status == "Unbilled":
        sql_status = "Draft"
        extra_where = "AND (invoice_printed = 0 AND restaurant_table IS NOT NULL)"
        use_extra_fields = False
    elif status == "Recently Paid":
        sql_status = "Paid"
        extra_where = ""
        use_extra_fields = True
    else:
        sql_status = status
        extra_where = ""
        use_extra_fields = True
    
    fields = base_fields + (extra_fields if use_extra_fields else "")
    cashier_clause = "AND cashier = %s" if cashier else ""
    
    sql = f"""
        SELECT {fields}
        FROM `tabPOS Invoice` 
        WHERE branch = %s AND status = %s {cashier_clause} {extra_where}
        ORDER BY modified desc
        LIMIT %s OFFSET %s
    """.strip()
    
    params = [branch, sql_status]
    if cashier:
        params.append(cashier)
    params.extend([limit, limit_start])
    
    invoices = frappe.db.sql(sql, tuple(params), as_dict=True)
    
    has_next = len(invoices) == limit and status != "Recently Paid"
    if has_next:
        invoices.pop()
    
    return {"data": invoices, "next": has_next}


@frappe.whitelist()
def getInvoiceForCashier(status, cashier, limit, limit_start):
    branch = getBranch()
    return _get_invoices_list(branch, status, limit, limit_start, cashier=cashier)


@frappe.whitelist()
def getPosInvoice(status, limit, limit_start):
    branch = getBranch()
    return _get_invoices_list(branch, status, limit, limit_start)


@frappe.whitelist()
def searchPosInvoice(query,status):
    if not query:
        return {"data": [], "next": False}
    query = query.lower()
    escaped = query.replace("%", r"\\%").replace("_", r"\\_")
    search_value = f"%{escaped}%"
    filters = {"status": "Paid" if status == "Recently Paid" else status}
    
    # Add additional conditions for Unbilled status
    if status == "Unbilled":
        filters.update({
            "status":"draft",
            "restaurant_table": ["not in", [None, ""]],
            "invoice_printed": 0
        })
    pos_invoices = frappe.get_all(
        "POS Invoice",
        filters=filters,           
        or_filters=[
            ["name", "like", search_value],
            ["customer", "like", search_value],
            ["mobile_number", "like", search_value],
        ],
        fields=["name", "customer", "grand_total", "posting_date", "posting_time", "order_type", "restaurant_table", "status", "rounded_total", "net_total", "mobile_number"],
        limit_page_length=10 
    )
    
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
    invoice_names = frappe.get_all(
        "POS Invoice", filters={"customer": customer}, fields=["name"], pluck="name"
    )
    if not invoice_names:
        return []

    item_qty = {}
    invoice_items = frappe.get_all(
        "POS Invoice Item",
        filters={"parent": ("in", invoice_names)},
        fields=["item_name", "qty"],
    )
    for row in invoice_items:
        item_qty[row.item_name] = item_qty.get(row.item_name, 0) + flt(row.qty)

    return [{"item_name": name, "qty": qty} for name, qty in item_qty.items()]

def _get_opening_entry_for_room(branch, room):
    """Find an open POS Opening Entry that includes the given room via Multiple Rooms."""
    result = frappe.db.sql("""
        SELECT DISTINCT `tabPOS Opening Entry`.name
        FROM `tabPOS Opening Entry`
        INNER JOIN `tabMultiple Rooms`
        ON `tabMultiple Rooms`.parent = `tabPOS Opening Entry`.name
        WHERE `tabPOS Opening Entry`.branch = %s
        AND `tabPOS Opening Entry`.status = 'Open'
        AND `tabPOS Opening Entry`.docstatus = 1
        AND `tabMultiple Rooms`.room = %s
    """, (branch, room), as_dict=True)
    return result[0].name if result else None

@frappe.whitelist()
def getCashier(room):
    branch = getBranch()
    opening_name = _get_opening_entry_for_room(branch, room)
    if opening_name:
        return frappe.db.get_value("POS Opening Entry", opening_name, "user")
    return None       
    

@frappe.whitelist()
def getPosProfile():
    branchName = getBranch()
    waiter = frappe.session.user

    pos_profile_name = frappe.db.exists("POS Profile", {"branch": branchName})
    if not pos_profile_name:
        frappe.throw(_("No POS Profile found for branch {0}").format(branchName))

    # Fetch all needed scalar fields in one query (no child tables)
    fields = [
        "branch", "company", "warehouse", "print_format", "paid_limit",
        "table_attention_time", "custom_enable_discount",
        "custom_enable_multiple_cashier", "custom_edit_order_type",
        "custom_enable_kot_reprint", "qz_print", "qz_host",
    ]
    vals = frappe.db.get_value("POS Profile", pos_profile_name, fields, as_dict=True)

    if vals.branch != branchName:
        frappe.throw(_("POS Profile branch mismatch"))

    disable_rounded_total = frappe.db.get_value("Global Defaults", None, "disable_rounded_total")

    # Determine cashier
    cashier = None
    owner = None
    multiple_cashier = vals.custom_enable_multiple_cashier

    if multiple_cashier:
        # Find main cashier with a single query instead of iterating child table
        owner = frappe.db.get_value(
            "POS Profile User",
            {"parent": pos_profile_name, "custom_main_cashier": 1},
            "user",
        )

        if frappe.session.user == owner:
            cashier = owner
        else:
            # Find the currently open POS Opening Entry for this user's room
            details = getBranchRoom()
            room = details[0].get("name")
            branch = details[0].get("branch")
            opening_name = _get_opening_entry_for_room(branch, room)
            cashier = frappe.db.get_value("POS Opening Entry", opening_name, "user") if opening_name else None
    else:
        # Single cashier mode — get first user from POS Profile
        first_user = frappe.db.get_value(
            "POS Profile User",
            {"parent": pos_profile_name},
            "user",
        )
        cashier = first_user
        owner = first_user

    # Determine printer setup
    printer = None
    bill_present = False
    if not vals.qz_print:
        # Check printer settings child table without loading full doc
        bill_row = frappe.db.get_value(
            "POS Profile Printer Settings",
            {"parent": pos_profile_name, "bill": 1},
            "printer",
        )
        if bill_row:
            printer = bill_row
            bill_present = True
        print_type = "network" if bill_present else "socket"
    else:
        print_type = "qz"

    return {
        "pos_profile": pos_profile_name,
        "branch": vals.branch,
        "company": vals.company,
        "waiter": waiter,
        "warehouse": vals.warehouse,
        "cashier": cashier,
        "print_format": vals.print_format,
        "qz_print": vals.qz_print,
        "qz_host": vals.qz_host,
        "printer": printer,
        "print_type": print_type,
        "tableAttention": vals.table_attention_time,
        "paid_limit": vals.paid_limit,
        "disable_rounded_total": disable_rounded_total,
        "enable_discount": vals.custom_enable_discount,
        "multiple_cashier": multiple_cashier,
        "owner": owner,
        "edit_order_type": vals.custom_edit_order_type,
        "enable_kot_reprint": vals.custom_enable_kot_reprint,
    }


@frappe.whitelist()
def getPosInvoiceItems(invoice):
    items = frappe.get_all(
        "POS Invoice Item",
        filters={"parent": invoice},
        fields=["item_name", "qty", "rate"],
    )
    taxes = frappe.get_all(
        "POS Invoice Item Tax",
        filters={"parent": invoice},
        fields=["description", "tax_amount"],
    )
    item_details = [{"item_name": i.item_name, "qty": i.qty, "amount": i.rate} for i in items]
    tax_details = [{"description": t.description, "rate": t.tax_amount} for t in taxes]
    return item_details, tax_details


@frappe.whitelist()
def posOpening():
    branchName = getBranch()
    has_open = frappe.db.exists(
        "POS Opening Entry",
        {"branch": branchName, "status": "Open", "docstatus": 1},
    )
    if not has_open:
        frappe.msgprint(title="Message", indicator="red", msg=_("Please Open POS Entry"))
    return 0 if has_open else 1


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

    # Batch-fetch image and disabled status in a single query
    item_codes = [item.item_code for item in aggregatorItem]
    item_info = {}
    if item_codes:
        rows = frappe.db.get_values(
            "Item",
            {"name": ("in", item_codes)},
            ["name", "image", "disabled"],
            as_dict=True,
        )
        item_info = {row.name: row for row in rows}

    aggregatorItemList = [
        {
            "item": item.item_code,
            "item_name": item.item_name,
            "rate": item.price_list_rate,
            "item_image": item_info.get(item.item_code, {}).get("image"),
        }
        for item in aggregatorItem
        if not item_info.get(item.item_code, {}).get("disabled")
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
    if not modeOfPayment:
        frappe.throw(_("No mode of payment configured for aggregator {0}").format(aggregator))
    return [{"mode_of_payment": modeOfPayment, "opening_amount": 0.0}]
@frappe.whitelist()
def create_customer(customer_name, mobile_number=None, customer_group="Individual", territory="India"):
    if not customer_name:
        frappe.throw(_("Customer name is required"))
    if not mobile_number:
        frappe.throw(_("Mobile Number is required"))
    try:
        validate_phone_number(mobile_number, throw=True)
    except Exception:
        frappe.throw(_("Invalid mobile number format"))

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
            "message": _("Customer created successfully"),
            "customer_name": customer_name,
            "mobile_number": mobile_number,
            "customer_group": customer_group,
            "territory": territory
        }

    except frappe.ValidationError:
        raise  # Let frappe.throw() validation errors propagate to the client
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title="Customer Creation Failed")
        frappe.throw(_("Failed to create customer: {0}").format(str(e)))

@frappe.whitelist()
def validate_pos_close(pos_profile): 
    enable_unclosed_pos_check = frappe.db.get_value("POS Profile", pos_profile, "custom_daily_pos_close")
    
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


import frappe
from frappe import _


@frappe.whitelist()
def getRestaurantMenu(pos_profile, table=None):
    menu_items = []

    user_role = frappe.get_roles()

    pos_profile = frappe.get_doc("POS Profile", pos_profile)

    cashier = any(
        role.role in user_role for role in pos_profile.role_allowed_for_billing
    )

    if cashier:
        branch_name = getBranch()
        menu = frappe.db.get_value(
            "URY Restaurant", {"branch": branch_name}, "active_menu"
        )

        if menu:
            menu_items = frappe.get_all(
                "URY Menu Item",
                filters={"parent": menu},
                fields=["item", "item_name", "rate", "special_dish", "disabled"],
                order_by="item_name asc",
            )

    elif table:
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

        else:
            menu_items = frappe.get_all(
                "URY Menu Item",
                filters={"parent": menu},
                fields=["item", "item_name", "rate", "special_dish", "disabled"],
                order_by="item_name asc",
            )

    return menu_items


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
def getPosInvoice(status):
    branchName = getBranch()
    updated_list = []
    if status == "Draft":
        pos_invoice = frappe.get_all(
            "POS Invoice",
            fields=(
                "name",
                "invoice_printed",
                "grand_total",
                "restaurant_table",
                "cashier",
                "waiter",
                "net_total",
                "posting_time",
                "total_taxes_and_charges",
                "customer",
                "status",
                "posting_date",
                "rounded_total",
            ),
            filters={"branch": branchName, "status": status},
            order_by="modified desc",
        )
        for invoice in pos_invoice:
            if invoice.invoice_printed == 1 or not invoice.restaurant_table:
                updated_list.append(invoice)
    elif status == "Unbilled":
        pos_invoice = frappe.get_all(
            "POS Invoice",
            fields=(
                "name",
                "invoice_printed",
                "grand_total",
                "restaurant_table",
                "cashier",
                "waiter",
                "net_total",
                "posting_time",
                "total_taxes_and_charges",
                "customer",
                "status",
                "posting_date",
                "rounded_total",
            ),
            filters={"branch": branchName},
            order_by="modified desc",
        )
        for invoice in pos_invoice:
            if (
                invoice.status == "Draft"
                and invoice.restaurant_table
                and invoice.invoice_printed == 0
            ):
                updated_list.append(invoice)

    else:
        pos_invoice = frappe.get_all(
            "POS Invoice",
            fields=(
                "name",
                "invoice_printed",
                "grand_total",
                "restaurant_table",
                "cashier",
                "waiter",
                "net_total",
                "posting_time",
                "total_taxes_and_charges",
                "customer",
                "status",
                "posting_date",
                "rounded_total",
            ),
            filters={"branch": branchName, "status": status},
            order_by="modified desc",
        )
        for invoice in pos_invoice:
            updated_list.append(invoice)
    return updated_list


@frappe.whitelist()
def fav_items(customer):
    pos_invoices = frappe.get_all(
        "POS Invoice", filters={"customer": customer}, fields=["name"]
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
def getPosProfile():
    branchName = getBranch()
    waiter = frappe.session.user
    bill_present = False
    qz_host = None
    printer = None
    posProfile = frappe.db.exists("POS Profile", {"branch": branchName})
    pos_profiles = frappe.get_doc("POS Profile", posProfile)

    if pos_profiles.branch == branchName:
        pos_profile_name = pos_profiles.name
        warehouse = pos_profiles.warehouse
        branch = pos_profiles.branch
        company = pos_profiles.company
        get_cashier = frappe.get_doc("POS Profile", pos_profile_name)
        print_format = pos_profiles.print_format
        cashier = get_cashier.applicable_for_users[0].user
        qz_print = pos_profiles.qz_print
        print_type = None

        for pos_profile in pos_profiles.printer_settings:
            if pos_profile.bill == 1:
                printer = pos_profile.printer
                bill_present = True
                break

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
    }
    return invoice_details


@frappe.whitelist()
def getPosInvoiceItems(invoice):
    itemDetails = []
    taxDetails = []
    orderdItems = frappe.get_doc("POS Invoice", invoice)
    posItems = orderdItems.items
    for items in posItems:
        item_name = items.item_name
        qty = items.qty
        amount = items.rate
        itemDetails.append(
            {
                "item_name": item_name,
                "qty": qty,
                "amount": amount,
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

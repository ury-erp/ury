import frappe
from frappe.utils import flt


def get_closing_invoice_rows(start, end, pos_profile, user):
    """Unconsolidated POS invoices a cashier's closing should take, on v15 and v16.

    Returns dicts with at least `doctype` and `name`. ERPNext v16 replaced
    `get_pos_invoices` (a list of invoice dicts) with `get_invoices` (a dict
    of invoices, payments and taxes) and can also close Sales Invoices.
    Permission checks are the caller's job.
    """
    from erpnext.accounts.doctype.pos_closing_entry import pos_closing_entry

    build_query = getattr(pos_closing_entry, "build_invoice_query", None)
    if build_query is None:
        return [
            frappe._dict(inv, doctype="POS Invoice")
            for inv in pos_closing_entry.get_pos_invoices(start, end, pos_profile, user)
        ]

    query = build_query("Sales Invoice", user, pos_profile, start, end)
    if frappe.db.get_single_value("POS Settings", "invoice_type") == "POS Invoice":
        query = query + build_query("POS Invoice", user, pos_profile, start, end)
    return query.orderby(query.timestamp).run(as_dict=True)


def before_validate(doc, method):
    fill_closing_invoices(doc)


def fill_closing_invoices(doc):
    """Fill the invoice table of a closing entry that was created without one.

    The POS app creates the closing entry from totals only. Without invoice
    rows, submitting it consolidates nothing, so the shift's sales never
    reach the ledger or stock.
    """
    table = "pos_invoices" if doc.meta.has_field("pos_invoices") else "pos_transactions"
    has_sales_table = doc.meta.has_field("sales_invoices")
    if doc.docstatus != 1 or doc.get(table) or (has_sales_table and doc.get("sales_invoices")):
        return

    rows = get_closing_invoice_rows(doc.period_start_date, doc.period_end_date, doc.pos_profile, doc.user)
    doc.grand_total = doc.net_total = doc.total_quantity = 0
    for inv in rows:
        if inv.doctype == "Sales Invoice":
            if not has_sales_table:
                continue
            child, link = "sales_invoices", "sales_invoice"
        else:
            child, link = table, "pos_invoice"
        doc.append(
            child,
            {
                link: inv.name,
                "posting_date": inv.posting_date,
                "grand_total": inv.grand_total,
                "customer": inv.customer,
                "is_return": inv.get("is_return"),
                "return_against": inv.get("return_against"),
            },
        )
        doc.grand_total += flt(inv.grand_total)
        doc.net_total += flt(inv.net_total)
        doc.total_quantity += flt(inv.total_qty)


def before_save(doc, method):
    sub_pos_close_check(doc, method)

def validate(doc, method):
    calculate_closing_amount(doc, method)
    validate_cashier(doc, method)


def sub_pos_close_check(doc,method):
    cashier = None
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:
        get_cashier = frappe.get_doc("POS Profile", doc.pos_profile)
        for user_details in get_cashier.applicable_for_users:
            if not user_details.custom_main_cashier:
                cashier = user_details.user
        if frappe.session.user != cashier:
            branch=frappe.db.get_value("POS Profile",doc.pos_profile,"branch")
            pos_opening_list = frappe.get_all(
                "POS Opening Entry",
                fields=["name", "docstatus", "status", "posting_date"],
                filters={"branch": branch,"user":cashier},
            )
            flag = 0
            for pos_opening in pos_opening_list:
                if pos_opening.status == "Open" and pos_opening.docstatus == 1:
                    flag = 1
            if flag == 1:
                frappe.throw(("Sub Cashier POS  must be closed"), title=("Sub Cashier POS Closing Required"))
                
            return flag
    else:
        pass

def calculate_closing_amount(doc, method):
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:  
        sub_pos_closing = frappe.get_all(
            "Sub POS Closing",
            filters=[
                ["posting_date", "<=", doc.posting_date],
                ["period_start_date", ">=", doc.period_start_date],
                ["docstatus", "=", 1]
            ],
            fields=["name"] 
        )
        if sub_pos_closing:
            for closing_details in doc.payment_reconciliation:
                sub_closing_amount = frappe.db.get_value("Sub POS Closing Payment",{"parent":sub_pos_closing[0].name,"mode_of_payment":closing_details.mode_of_payment},"closing_amount") or 0
                main_closing_amount = closing_details.custom_closing_amount or 0
                total_closing_amount = sub_closing_amount + main_closing_amount
                closing_details.closing_amount = total_closing_amount
                closing_details.difference = total_closing_amount - closing_details.expected_amount
        else:
            frappe.throw("No Sub POS Closing entries found between the given dates")
            return None
    else:
        pass
def validate_cashier(doc, method):
    cashier = None
    multiple_cashier = frappe.db.get_value("POS Profile",doc.pos_profile,"custom_enable_multiple_cashier")
    if multiple_cashier:
        get_cashier = frappe.get_doc("POS Profile", doc.pos_profile)
        for user_details in get_cashier.applicable_for_users:
            if not user_details.custom_main_cashier:
                cashier = user_details.user
        if frappe.session.user == cashier:
            frappe.throw("Sub Cashiers are not allowed to make POS Closing Entries.")
    else:
        pass
    
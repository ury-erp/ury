from datetime import datetime

import frappe


def before_validate(doc, method):
    if frappe.db.get_single_value("POS Settings", "invoice_type") == "POS Invoice":
        # Native validation assumes the closing user owns every invoice. URY
        # waiters own them, so rebuild the server-owned list after validation.
        doc.set("pos_invoices", [])


def before_submit(doc, method):
    if frappe.db.get_single_value("POS Settings", "invoice_type") != "POS Invoice":
        return

    from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import get_taxes
    from ury.ury_pos.api import _till_invoice_rows

    start = frappe.utils.get_datetime(frappe.db.get_value(
        "POS Opening Entry", doc.pos_opening_entry, "period_start_date"
    ))
    end = frappe.utils.get_datetime(doc.period_end_date)
    rows = frappe.get_all(
        "POS Invoice",
        filters={
            "docstatus": 1,
            "pos_profile": doc.pos_profile,
            "consolidated_invoice": ["is", "not set"],
        },
        fields=[
            "name", "posting_date", "posting_time", "customer", "grand_total",
            "net_total", "total_qty", "total_taxes_and_charges", "is_return", "return_against",
        ],
        order_by="posting_date asc, posting_time asc",
        limit_page_length=0,
    )
    before, inside, after = [], [], []
    for row in rows:
        timestamp = datetime.combine(
            frappe.utils.get_datetime(row.posting_date).date(),
            frappe.utils.get_time(row.posting_time),
        )
        if timestamp < start:
            before.append(row)
        elif timestamp > end:
            after.append(row)
        else:
            inside.append(row)

    if after:
        frappe.throw("[URY-CLOSE-LATE-INVOICE] Unconsolidated invoices exist after the closing end.")
    if before:
        frappe.throw("[URY-CLOSE-ORPHAN-INVOICE] Unconsolidated invoices exist before the opening start.")

    readable = _till_invoice_rows(doc.pos_profile, start, end, frappe.get_list)
    if {row.name for row in inside} != {row.name for row in readable}:
        frappe.throw("[URY-CLOSE-UNREADABLE-INVOICE] Not all till invoices are readable by this user.")

    doc.set("pos_invoices", [])
    for row in inside:
        doc.append("pos_invoices", {
            "pos_invoice": row.name,
            "posting_date": row.posting_date,
            "customer": row.customer,
            "grand_total": row.grand_total,
            "is_return": row.is_return,
            "return_against": row.return_against,
        })
    doc.set("taxes", [
        {"account_head": tax.account_head, "amount": tax.tax_amount}
        for tax in get_taxes(inside)
    ])
    doc.grand_total = sum(row.grand_total or 0 for row in inside)
    doc.net_total = sum(row.net_total or 0 for row in inside)
    doc.total_quantity = sum(row.total_qty or 0 for row in inside)
    doc.total_taxes_and_charges = sum(row.total_taxes_and_charges or 0 for row in inside)


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

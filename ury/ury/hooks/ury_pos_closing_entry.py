import frappe

def before_save(doc, method):
    sub_pos_close_check(doc, method)

def validate(doc, method):
    populate_pos_transactions(doc, method)
    calculate_closing_amount(doc, method)
    validate_cashier(doc, method)


def populate_pos_transactions(doc, method=None):
    """Fill `doc.pos_transactions` with this session's submitted,
    unconsolidated POS Invoices, if it isn't already populated.

    Guard (referenced by `ury_pos_closing_reconciliation.py`'s
    `_session_invoice_names`, which self-calls this function so its own
    correctness never depends on `hooks.py` doc_event ordering): if
    `pos_transactions` already has rows -- e.g. hand-picked by a cashier in
    the desk form, or already populated by an earlier call in the same
    request -- this is a no-op. Never overwrites caller-supplied rows.

    Mirrors core ERPNext's own `pos_closing_entry.get_pos_invoices`
    filtering intent (submitted, not yet consolidated, within the session
    window) but scoped by this app's `cashier` field rather than core's
    `owner`, since a POS Invoice's `cashier` (set at billing time, and
    distinct from whichever user's session created/owns the document) is
    the correct session-attribution field here -- `sub_pos_close_check`/
    `validate_cashier` above already treat `cashier` as that source of
    truth for this same doctype.

    `consolidated_invoice` is filtered in Python (`not` truthy check), not
    SQL, matching how `ury_pos_closing_reconciliation._confirm_genuinely_
    empty` reads this same field -- core's storage of it as `""`/NULL
    inconsistently makes a plain SQL falsy filter less reliable.
    """
    if doc.get("pos_transactions"):
        return
    if not doc.get("pos_profile") or not doc.get("period_start_date") or not doc.get("period_end_date"):
        return

    invoices = frappe.get_all(
        "POS Invoice",
        filters={
            "docstatus": 1,
            "pos_profile": doc.pos_profile,
            "cashier": doc.user,
            "posting_date": ["between", [doc.period_start_date, doc.period_end_date]],
        },
        fields=["name", "posting_date", "grand_total", "customer", "consolidated_invoice"],
        order_by="posting_date asc",
    )
    unconsolidated = [inv for inv in invoices if not inv.get("consolidated_invoice")]

    for inv in unconsolidated:
        doc.append(
            "pos_transactions",
            {
                "pos_invoice": inv.name,
                "posting_date": inv.posting_date,
                "grand_total": inv.grand_total,
                "customer": inv.customer,
            },
        )


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
    
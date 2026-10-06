import frappe
from frappe.utils import get_datetime

def before_save(doc, method):
    sub_pos_close_check(doc, method)

def validate(doc, method):
    populate_pos_transactions(doc, method)
    calculate_closing_amount(doc, method)
    validate_cashier(doc, method)
    validate_ported_checks(doc, method)

def validate_ported_checks(doc, method):
    pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
    branch = pos_profile.branch
    warehouse = pos_profile.warehouse
    errors = []

    start_date = doc.period_start_date
    end_date = doc.period_end_date
    period_start_date = get_datetime(start_date).date()

    if pos_profile.validate_stock_correction:
        stock_correction = frappe.db.get_value(
            "Stock Correction", 
            {"branch": branch, "set_warehouse": warehouse, "period_end_date": ["between", [start_date, end_date]]}, 
            "name"
        )
        if not stock_correction:
            errors.append("Stock Correction: not generated for today")

    if pos_profile.validate_daily_p_and_l:
        daily_p_and_l = frappe.db.get_value(
            "URY Daily P and L", 
            {"docstatus": 0, "branch": branch, "date": period_start_date}, 
            "name"
        )
        if not daily_p_and_l:
            errors.append("Daily P and L: No entries today")

    if pos_profile.validate_attendance:
        attnd_query = """
            SELECT a.name
            FROM `tabAttendance` a
            INNER JOIN `tabEmployee` b ON b.name = a.employee
            WHERE b.branch = %s AND a.docstatus = 1 AND a.attendance_date = %s
        """
        attendance = frappe.db.sql(attnd_query, (branch, period_start_date), as_dict=True)
        if not attendance:
            errors.append("Attendance: Not marked for today")

    if pos_profile.validate_wastage:
        wtg_query = """
            SELECT name
            FROM `tabURY Wastage`
            WHERE docstatus = 1 AND branch = %s AND posting_datetime >= %s AND posting_datetime <= %s
        """
        wastage = frappe.db.sql(wtg_query, (branch, start_date, end_date), as_dict=True)
        if not wastage:
            errors.append("Wastage: No recording for today")

    if errors:
        frappe.throw(errors, title="Validation Error", as_list=True)



def populate_pos_transactions(doc, method):
    """Rebuild `pos_transactions` server-side from unconsolidated POS
    Invoices for this closing user/profile/period, exactly like
    ``SubPOSClosing.validate()`` does for the sub-cashier close.

    The custom POS frontend's ``createPosClosingEntry`` call (unlike native
    ERPNext's own Desk JS, which builds the child table client-side via
    ``make_closing_entry_from_opening`` before creating the document) never
    sends ``pos_transactions`` -- it only fetches invoices to render the
    on-screen closing totals. Without this, a POS Closing Entry created via
    the custom frontend submits with an empty ``pos_transactions``, so
    ``consolidate_pos_invoices()`` (called from ``on_submit``) has nothing
    to merge and no consolidated Sales Invoice is created for the session,
    even though the closing totals shown to the cashier were correct.

    Only fills the table when it is empty, so an explicit caller-supplied
    ``pos_transactions`` (e.g. a future frontend fix, or native Desk usage)
    is never overwritten.

    ERPNext core's own ``POSClosingEntry.validate_pos_invoices()`` (invoked
    again on submit) requires ``pos_invoice.owner == self.user`` for every
    row in this table -- a check against the *creator* of the invoice, not
    this app's custom ``cashier`` field, which can differ from the creator
    in multi-cashier POS Profiles (see ``ury_order.py``'s ``main_cashier`` /
    ``pos_opened_cashier`` assignment). This function populates exactly the
    child table core's submit-time check validates against ``owner``, so it
    selects candidates by ``owner`` up front -- the query itself guarantees
    every row satisfies core's invariant, rather than selecting by
    ``cashier`` and then dropping rows that fail it after the fact.
    """
    if doc.get("pos_transactions"):
        return
    if not doc.pos_profile or not doc.period_start_date or not doc.period_end_date:
        return

    invoices = frappe.get_all(
        "POS Invoice",
        filters={
            "docstatus": 1,
            "pos_profile": doc.pos_profile,
            "owner": doc.user,
            "posting_date": ["between", [doc.period_start_date, doc.period_end_date]],
        },
        fields=["name", "owner", "posting_date", "posting_time", "customer", "grand_total", "net_total", "total_qty", "consolidated_invoice"],
    )

    period_start = get_datetime(doc.period_start_date)
    period_end = get_datetime(doc.period_end_date)

    for invoice in invoices:
        if invoice.consolidated_invoice:
            continue
        invoice_ts = get_datetime(f"{invoice.posting_date} {invoice.posting_time or '00:00:00'}")
        if not (period_start <= invoice_ts <= period_end):
            continue
        doc.append(
            "pos_transactions",
            {
                "pos_invoice": invoice.name,
                "posting_date": invoice.posting_date,
                "grand_total": invoice.grand_total,
                "customer": invoice.customer,
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
    
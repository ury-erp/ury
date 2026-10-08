import frappe
from frappe.utils import get_datetime
from frappe import _
from datetime import datetime

from ury.ury_pos.api import (
	_goal_submitted_since,
	_phase_dependent_rows,
	_role_rank,
)

def before_save(doc, method):
    sub_pos_close_check(doc, method)

def validate(doc, method):
    populate_pos_transactions(doc, method)
    populate_draft_stock_correction(doc)
    calculate_closing_amount(doc, method)
    validate_cashier(doc, method)
    validate_ported_checks(doc, method)

def populate_draft_stock_correction(doc):
    if doc.get("draft_stock_correction"):
        return
    submit_stock_correction_val = frappe.get_value("POS Profile", doc.pos_profile, "submit_stock_correction")
    if submit_stock_correction_val == 1:
        branch = frappe.get_value("POS Profile", doc.pos_profile, "branch")
        if not branch: return
        corrections = frappe.get_all(
            "Stock Correction",
            filters={"docstatus": 0, "branch": branch, "period_end_date": ["between", [doc.period_start_date, doc.period_end_date]]},
            fields=["name as stock_correction"]
        )
        if corrections:
            for corr in corrections:
                doc.append("draft_stock_correction", {"stock_correction": corr.stock_correction})
        else:
            frappe.msgprint("No draft stock correction found for this shift.", title="Stock Correction Missing", indicator="orange")

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
            {"docstatus": 1, "branch": branch, "date": period_start_date}, 
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
            WHERE docstatus = 1 AND branch = %s AND TIMESTAMP(posting_date, posting_time) >= %s AND TIMESTAMP(posting_date, posting_time) <= %s
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
    if doc.get("pos_invoices"):
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
            "pos_invoices",
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

def validate_daily_checklists(doc, method):
	"""Closing runs Order Taker -> Cashier -> Restaurant Manager, and the
	POS Closing Entry is the FINAL step -- the cashier may close only after
	all three submitted their closing checklist for this shift (each review
	created since the shift opened). Role-level: one submission per role
	suffices no matter how many users hold it. A submitted checklist may
	contain FAIL objectives -- valid response, not a blocker."""
	pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
	branch = pos_profile.branch

	# Parse start date
	start_date = doc.period_start_date
	if isinstance(start_date, str):
		try:
			start_date = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S.%f")
		except ValueError:
			start_date = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S")

	non_completed_checklists = []

	def validate_and_throw(error_messages):
		if error_messages != []:
			error_list = [_("{}".format(msg)) for msg in error_messages]
			frappe.throw(error_list, title=_("Validation Error"), as_list=True)

	for row in _phase_dependent_rows(doc.pos_profile, "Closing"):
		if _goal_submitted_since(row.quality_checklist, branch, start_date):
			doc.append(
				"quality_checklist",
				{"checklist": row.quality_checklist, "check_2": 1},
			)
		elif _role_rank(row.role) is not None:
			# Every ranked role in the closing sequence gates the closing
			# document: Order Taker AND Cashier AND Restaurant Manager.
			non_completed_checklists.append(
				_("Pending checklist: {} ").format(
					frappe.bold(row.quality_checklist)
				)
			)

	validate_and_throw(non_completed_checklists)




def submit_stock_correction(doc, method=None):
	submit_stock_correction_val = frappe.get_value("POS Profile", doc.pos_profile, "submit_stock_correction")
	if submit_stock_correction_val == 1:
		if not doc.get("draft_stock_correction"):
			frappe.throw("Cannot submit POS Closing Entry: No draft stock correction entries found against the branch.", title="Stock Correction Required")
		
		for row in doc.get("draft_stock_correction"):
			if row.stock_correction:
				frappe.enqueue(
					"ury.ury.hooks.ury_pos_closing_entry.process_stock_correction",
					queue="long",
					timeout=1500,
					closing_entry=doc.name,
					stock_correction_name=row.stock_correction,
					pos_profile=doc.pos_profile,
					period_start_date=doc.period_start_date
				)

def process_stock_correction(closing_entry, stock_correction_name, pos_profile, period_start_date):
	from frappe.utils import getdate, get_time
	from datetime import datetime, timedelta
	try:
		wstg_time = frappe.db.get_value("POS Profile", pos_profile, "custom_wastage_time")
		sales_time = frappe.db.get_value("POS Profile", pos_profile, "custom_sales_closing_time")
		p_time = wstg_time if wstg_time else sales_time
		
		p_date = getdate(period_start_date)
		if p_time:
			date_time = datetime.combine(p_date, get_time(p_time))
		else:
			date_time = datetime.combine(p_date, datetime.now().time())
			
		delay_minutes = 10
		new_date_time = date_time + timedelta(minutes=delay_minutes)
		
		date = new_date_time.date()
		time = new_date_time.time()
		
		sc_doc = frappe.get_doc("Stock Correction", stock_correction_name)
		owner = sc_doc.owner
		sc_doc.db_set("edit_posting_date", 1)
		sc_doc.posting_date = date
		sc_doc.posting_time = time
		sc_doc.save()
		sc_doc.submit()
		
		frappe.db.set_value(
			"Stock Correction",
			stock_correction_name,
			"modified_by",
			owner,
			update_modified=False,
		)
		frappe.db.commit()
	except Exception as e:
		error_msg = f"Stock Correction Failed for POS Closing Entry {closing_entry}: {str(e)}"
		sc_doc = frappe.get_doc("Stock Correction", stock_correction_name)
		sc_doc.db_set("status", "Failed")
		sc_doc.db_set("error", str(e))
		frappe.log_error(error_msg, "Stock Correction Failed")
		frappe.db.commit()
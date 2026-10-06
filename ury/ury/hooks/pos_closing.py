import frappe
from frappe import _
from datetime import datetime

from ury.ury_pos.api import (
	POS_EVENT_ROLE_RANK,
	_goal_review_passed_since,
	_phase_dependent_rows,
	_role_rank,
)


def validate_daily_checklists(doc, method):
	"""Closing runs Order Taker -> Cashier -> RM. The POS Closing Entry is
	created at the Cashier step, so every role BEFORE the cashier in the
	closing sequence -- the Order Taker -- must have a fully-Passed closing
	checklist (review created since the shift opened) before the shift can
	close. Roles after the cashier (RM) close later and do not gate this
	document."""
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
		rank = _role_rank(row.role)
		if _goal_review_passed_since(row.quality_checklist, branch, start_date):
			doc.append(
				"quality_checklist",
				{"checklist": row.quality_checklist, "check_2": 1},
			)
		elif rank is not None and rank > POS_EVENT_ROLE_RANK:
			# Only roles before the Cashier step block the closing document.
			non_completed_checklists.append(
				_("Pending checklist: {} ").format(
					frappe.bold(row.quality_checklist)
				)
			)

	validate_and_throw(non_completed_checklists)

def validate_stock_correction(closing_entry, method=None):
    pos_profile = closing_entry.get("pos_profile")
    if not pos_profile:
        return
        
    submit_stock_correction_enabled = frappe.db.get_value("POS Profile", pos_profile, "submit_stock_correction")
    if submit_stock_correction_enabled:
        stock_corrections = closing_entry.get("draft_stock_correction")
        if not stock_corrections:
            frappe.throw(
                "No draft Stock Correction found for this shift. Please ensure a Stock Correction is created before saving the POS Closing Entry.",
                title="Stock Correction Missing"
            )

def submit_stock_correction(closing_entry, method=None):
    """Separate function to enqueue stock correction submission"""
    stock_corrections = closing_entry.get("draft_stock_correction")  
    if not stock_corrections:
        return
        
    frappe.enqueue(
        "ury.ury.hooks.pos_closing.process_stock_corrections_background",
        queue="long",
        closing_entry=closing_entry.name,
        now=frappe.flags.in_test
    )

def process_stock_corrections_background(closing_entry):
    closing_entry_doc = frappe.get_doc("POS Closing Entry", closing_entry)
    stock_corrections = closing_entry_doc.get("draft_stock_correction")
    if not stock_corrections:
        return

    pos_profile = closing_entry_doc.get("pos_profile")
    wstg_time = frappe.db.get_value("POS Profile", pos_profile, "custom_wastage_time")
    sales_time = frappe.db.get_value("POS Profile", pos_profile, "custom_sales_closing_time")
    p_time = wstg_time if wstg_time else sales_time
    
    from frappe.utils import getdate, get_time
    from datetime import datetime, timedelta
    p_date = getdate(closing_entry_doc.get("period_start_date"))
    if not p_time:
        date_time = datetime.now()
    else:
        date_time = datetime.combine(p_date, get_time(p_time))
    
    # 10 mins delay
    delay_minutes = 10
    new_date_time = date_time + timedelta(minutes=delay_minutes)
    date = new_date_time.date()
    time = new_date_time.time()

    for row in stock_corrections:
        if not row.stock_correction:
            continue
            
        try:
            sstock_correcton_doc = frappe.get_doc("Stock Correction", row.stock_correction)
            if sstock_correcton_doc.docstatus != 0:
                continue
                
            owner = sstock_correcton_doc.owner
            sstock_correcton_doc.db_set("edit_posting_date", 1)
            sstock_correcton_doc.posting_date = date
            sstock_correcton_doc.posting_time = time
            sstock_correcton_doc.save()
            sstock_correcton_doc.submit()
            frappe.db.set_value(
                "Stock Correction",
                row.stock_correction,
                "modified_by",
                owner,
                update_modified=False,
            )
            frappe.db.commit()
        except Exception as e:
            frappe.log_error(title="Failed to submit Stock Correction", message=frappe.get_traceback())

@frappe.whitelist()
def get_draft_stock_correction(pos_profile, period_end_date, period_start_date, closing_entry = None):
    # Fetching branch from POS profile
    branch = frappe.get_value("POS Profile", pos_profile, "branch")
    if not branch:
        frappe.throw("Branch not found for the given POS profile")
    
    submit_stock_correction = frappe.get_value("POS Profile", pos_profile, "submit_stock_correction")
    warehouse = frappe.get_value("POS Profile", pos_profile, "warehouse")
    
    start_date = period_start_date
    end_date = period_end_date

    # Getting all created stock correction documents for the branch
    stock_corrections = []
    try:
        stock_corrections = frappe.get_all(
            "Stock Correction", 
            filters={
                "docstatus": 0, 
                "branch": branch, 
                "period_end_date": ["between", [start_date, end_date]]
            },
            pluck="name"
        )
    except:
       pass

    if submit_stock_correction == 1:
        if stock_corrections:
            return [{"stock_correction": sc} for sc in stock_corrections]
        else:
            return False
    else:
        return True




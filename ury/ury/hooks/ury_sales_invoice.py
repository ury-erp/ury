import frappe
from frappe.utils import flt


def _employee_for_user(user):
    if not user:
        return None
    rows = frappe.db.sql(
        """
        SELECT name, status
        FROM `tabEmployee`
        WHERE user_id = %s
        ORDER BY CASE WHEN status = 'Active' THEN 0 ELSE 1 END,
                 date_of_joining ASC,
                 name ASC
        LIMIT 1
        """,
        (user,),
        as_dict=True,
    )
    return rows[0]["name"] if rows else None


def set_sales_invoice_commission_attribution(doc, method=None):
    # Opener is sticky: never overwrite once set
    if not doc.get("custom_waiter_employee"):
        doc.custom_waiter_employee = _employee_for_user(doc.waiter)
    doc.custom_closing_employee = _employee_for_user(doc.cashier) or doc.get("custom_closing_employee")


def before_insert(doc, method):
    sales_invoice_naming(doc, method)
    set_sales_invoice_commission_attribution(doc, method)

def on_update(doc,method):
    aggregator_unpaid(doc,method)
    
def sales_invoice_naming(doc, method):
    if not doc.is_pos:
        return
    
    if not doc.pos_profile:
        return
    
    pos_profile = frappe.db.get_value(
        "POS Profile", 
        doc.pos_profile, 
        ["restaurant_prefix", "restaurant"], 
        as_dict=True
    )

    if not pos_profile:
        frappe.throw(f"POS Profile '{doc.pos_profile}' does not exist. Please select a valid POS Profile.")
    
    restaurant = pos_profile.get("restaurant")

    if pos_profile.get("restaurant_prefix") == 1 and restaurant:
        if doc.order_type == "Aggregators":
            
            # Get the aggregator series prefix
            aggregator_series_prefix = frappe.db.get_value(
                "URY Restaurant", 
                restaurant, 
                "aggregator_series_prefix"
            )
            
            if aggregator_series_prefix: 
                doc.naming_series = "SINV-" +  aggregator_series_prefix
                
            else: 
                # Fallback to invoice_series_prefix if aggregator_series_prefix is not available            
                doc.naming_series = "SINV-" + frappe.db.get_value("URY Restaurant", restaurant, "invoice_series_prefix")
                      
        else:
            # Use invoice_series_prefix for non-aggregator orders
            doc.naming_series = "SINV-" + frappe.db.get_value(
                "URY Restaurant", restaurant, "invoice_series_prefix"
            )
            
            
def aggregator_unpaid(doc,method):
    if doc.order_type == "Aggregators" and frappe.db.get_value("Branch", doc.branch , "custom_make_unpaid") == 1 :
        doc.is_pos = 0
        
        
def round_off_journal_entry(doc, method=None):
    """Auto-create a Journal Entry for the rounding/cash-discount difference
    between rounded_total and paid_amount, posted against the POS Profile's
    configured cash discount account. Best-effort: never blocks submission."""
    try:
        if not doc.is_pos or not flt(doc.rounded_total) or not flt(doc.paid_amount):
            return

        diff = flt(doc.rounded_total) - flt(doc.paid_amount)
        if abs(diff) < 0.005:
            return

        # Safety ceiling, not a business rule: a genuine rounding/cash-discount
        # difference should be a small fraction of the invoice. If it's larger
        # than this, something is misconfigured (e.g. rounding disabled or an
        # unpaid consolidated invoice) — skip rather than write off the invoice.
        if abs(diff) > flt(doc.grand_total) * 0.1:
            return

        cash_discount_account = frappe.db.get_value(
            "POS Profile", doc.pos_profile, "cash_discount_account"
        )
        if not cash_discount_account:
            return

        debtors_account = doc.debit_to
        if not debtors_account:
            return

        if diff > 0:
            accounts = [
                {
                    "account": debtors_account,
                    "party_type": "Customer",
                    "party": doc.customer,
                    "credit_in_account_currency": diff,
                    "cost_center": doc.cost_center,
                    "reference_type": "Sales Invoice",
                    "reference_name": doc.name,
                },
                {
                    "account": cash_discount_account,
                    "debit_in_account_currency": diff,
                    "cost_center": doc.cost_center,
                },
            ]
        else:
            diff = abs(diff)
            accounts = [
                {
                    "account": debtors_account,
                    "party_type": "Customer",
                    "party": doc.customer,
                    "debit_in_account_currency": diff,
                    "cost_center": doc.cost_center,
                    "reference_type": "Sales Invoice",
                    "reference_name": doc.name,
                },
                {
                    "account": cash_discount_account,
                    "credit_in_account_currency": diff,
                    "cost_center": doc.cost_center,
                },
            ]

        frappe.db.savepoint("round_off_je")
        try:
            journal_entry = frappe.get_doc(
                {
                    "doctype": "Journal Entry",
                    "voucher_type": "Journal Entry",
                    "company": doc.company,
                    "posting_date": doc.posting_date,
                    "user_remark": f"Cash discount/round-off adjustment for Sales Invoice {doc.name}",
                    "accounts": accounts,
                }
            )
            journal_entry.insert(ignore_permissions=True)
            journal_entry.submit()

            doc.db_set("cash_discount_journal_entry", journal_entry.name)
        except Exception:
            frappe.db.rollback(save_point="round_off_je")
            raise
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Cash Discount Journal Entry Creation Failed",
        )


def journal_entry_cancel(doc, method=None):
    """Cancel the linked cash-discount Journal Entry (if any) when the
    Sales Invoice is cancelled. Best-effort: never blocks cancellation."""
    try:
        je_name = doc.get("cash_discount_journal_entry")
        if not je_name:
            return

        frappe.db.savepoint("round_off_je_cancel")
        try:
            journal_entry = frappe.get_doc("Journal Entry", je_name)
            if journal_entry.docstatus == 1:
                journal_entry.cancel()

            doc.db_set("cash_discount_journal_entry", None)
        except Exception:
            frappe.db.rollback(save_point="round_off_je_cancel")
            raise
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "Cash Discount Journal Entry Cancellation Failed",
        )


def remove_tax(doc,method):
    
    if doc.order_type == "Aggregators" and frappe.db.get_value("Branch", doc.branch , "custom_no_taxes") == 1 :

        doc.taxes_and_charges = None
        
        doc.taxes.clear()
       # Manually adjust totals
        # doc.total_taxes_and_charges = 0
        # doc.grand_total = doc.base_grand_total = doc.net_total
        # doc.outstanding_amount = doc.grand_total - doc.paid_amount
        # doc.run_method("validate")

        


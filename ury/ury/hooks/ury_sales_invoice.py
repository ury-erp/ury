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


def fulfil_reservations_on_consolidation(doc, method=None):
    """Close out URY stock reservations at the consolidated Sales Invoice submit.

    This is the sale-side reservation close-out, and it is deliberately
    attached to the NATIVE closing-time deduction event rather than to the
    URY fulfilment posting service, because that is the moment `Bin`
    actually drops:

        POS Closing Entry.on_submit
          -> consolidate_pos_invoices()
            -> POS Invoice Merge Log.on_submit
              -> consolidated Sales Invoice (is_consolidated=1,
                 update_stock=1) .submit()
                -> update_stock_ledger() writes the SLEs      <== here

    A POS Invoice submit writes no stock ledger entry at all (`POS Invoice`
    has no `update_stock` field); the whole session's sale-side deduction
    happens once, at closing, on this document. Before this handler existed,
    nothing ever transitioned a sold order's `URY Stock Reservation` rows out
    of `Reserved`: `fulfil_reservation` was only reachable from the
    fulfilment posting service (which only runs when POS Stock Authority V2
    is enabled) and `release_order_reservations` only from cancellation. So
    every successful sale left its reservations Reserved forever while `Bin`
    was separately reduced here, and since
    `get_available_capacity() = Bin.projected_qty - active reservations`,
    availability was double-debited and drifted monotonically toward zero.

    Because it hangs off the consolidated Sales Invoice, this runs for every
    sale in every configuration, with or without the feature flag.

    Not a credit note: a consolidated credit note (`is_return=1`) returns
    finished goods to the warehouse. Reversing the production side of a
    return is an explicit, still-undecided disposition question (see the
    Phase 3 / I-9 follow-up in
    tracks/sa-testing-issues-14sep/ARCHITECTURE_POS_STOCK_AUTHORITY.md), so
    this handler deliberately does nothing for returns rather than guessing.

    Never raises: a submitted, ledger-posting Sales Invoice must not be
    rolled back because a reservation row is in an unexpected state. Failures
    are logged; `expire_stale_reservations` (registered in `scheduler_events`)
    is the backstop that keeps a missed close-out from leaking capacity
    forever.
    """
    if not doc.get("is_consolidated"):
        return
    if doc.get("is_return"):
        return

    try:
        _fulfil_reservations_for_consolidated_invoice(doc)
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            "URY reservation close-out failed for {0}".format(doc.name),
        )


def _fulfil_reservations_for_consolidated_invoice(doc):
    from ury.ury.api.ury_reservation_service import (
        RESERVED,
        fulfil_reservation_if_pending,
    )

    # `merge_pos_invoice_into` carries the source POS Invoice onto every
    # consolidated row as `pos_invoice` (with `pos_invoice_item` for the
    # child row). Reservations are keyed on `order_ref` == the POS Invoice
    # name (see `ury_order._ensure_invoice_reservation_ref`), so the POS
    # Invoice is exactly the join key. Deduplicate: one consolidated invoice
    # merges many POS Invoices, each with many rows, but reservations are
    # resolved per order, not per row.
    order_refs = list(
        dict.fromkeys(
            row.get("pos_invoice") for row in (doc.get("items") or []) if row.get("pos_invoice")
        )
    )
    if not order_refs:
        return

    rows = frappe.get_all(
        "URY Stock Reservation",
        filters={"order_ref": ["in", order_refs], "status": RESERVED},
        fields=["reservation_group"],
    )
    groups = list(
        dict.fromkeys(row.reservation_group for row in rows if row.reservation_group)
    )

    for group in groups:
        # Idempotent and non-raising per group: under POS Stock Authority V2
        # the fulfilment posting service already fulfilled MADE_TO_ORDER
        # groups at production time, so finding a group already Fulfilled
        # (or mid-transition) is expected, not an error.
        try:
            fulfil_reservation_if_pending(group)
        except Exception:
            frappe.log_error(
                frappe.get_traceback(),
                "URY reservation close-out failed for group {0}".format(group),
            )

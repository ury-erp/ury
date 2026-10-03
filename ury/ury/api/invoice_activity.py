"""What happened to a bill, written on the bill itself.

Each operation — the order opened or changed, the bill printed, paid,
discounted, cancelled, split — is added to the POS Invoice as an "Info"
comment. That is the same activity timeline the desk shows under every
document, so staff and managers read one history whether they open the bill
from the dashboard or from ERPNext; the URY Audit Log keeps its own
append-only record of the money events alongside.
"""

import frappe
from frappe import _
from frappe.utils import fmt_money


def log_activity(invoice, text):
    """Add one activity line to a POS Invoice. Never raises.

    An activity note is a record of something that already happened; failing
    the payment or the print because the note could not be written would be
    worse than missing the note, so a failure is logged instead.
    """
    if not invoice or not text:
        return
    try:
        frappe.get_doc({
            "doctype": "Comment",
            "comment_type": "Info",
            "reference_doctype": "POS Invoice",
            "reference_name": invoice,
            "comment_email": frappe.session.user,
            "comment_by": frappe.utils.get_fullname(frappe.session.user),
            "content": text,
        }).insert(ignore_permissions=True)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Could not log invoice activity")


def money(amount, invoice=None):
    currency = frappe.db.get_value("POS Invoice", invoice, "currency") if invoice else None
    return fmt_money(amount or 0, precision=0, currency=currency)


def payments_summary(payments, invoice=None):
    """"نقدي 20,000 د.ع، بطاقة 5,000 د.ع" from a list of {mode_of_payment, amount}."""
    parts = []
    for row in payments or []:
        amount = float(row.get("amount") or 0)
        if amount:
            parts.append(f"{_(row.get('mode_of_payment'))} {money(amount, invoice)}")
    return "، ".join(parts)

"""Read-only payment totals calculated by the same invoice engine as settlement."""
import frappe
from frappe import _
from frappe.utils import flt

from ury.ury.doctype.ury_order.ury_order import (
    _enforce_order_access,
    _validate_additional_discount,
)
from ury.ury_pos.api import getBranch


def _amount_due(doc):
    return flt(doc.rounded_total) or flt(doc.grand_total)


@frappe.whitelist()
def preview_payment(invoice, pos_profile, additionalDiscount):
    """Validate the discount percentage and calculate without saving or paying."""
    doc = frappe.get_doc("POS Invoice", invoice)
    doc.check_permission("read")
    _enforce_order_access(doc)
    branch = getBranch()
    if branch and doc.branch and branch != doc.branch:
        frappe.throw(_("Not permitted to view orders outside your active branch"), frappe.PermissionError)
    if doc.docstatus != 0:
        frappe.throw(_("Only an open bill can be changed"))
    if doc.pos_profile and doc.pos_profile != pos_profile:
        frappe.throw(_("The POS Profile does not match this bill"))

    percentage = _validate_additional_discount(additionalDiscount, pos_profile)
    # Like make_invoice, apply the percentage to this invoice only. A merged
    # companion retains its own discount and server-calculated payable total.
    doc.pos_profile = pos_profile
    doc.additional_discount_percentage = percentage
    doc.calculate_taxes_and_totals()
    merged_due = 0
    if doc.custom_merged_pos_invoice:
        companion = frappe.get_doc("POS Invoice", doc.custom_merged_pos_invoice)
        companion.check_permission("read")
        _enforce_order_access(companion)
        companion.calculate_taxes_and_totals()
        merged_due = _amount_due(companion)

    return {
        "percentage": percentage,
        "discount_amount": flt(doc.discount_amount),
        "grand_total": flt(doc.grand_total) + merged_due,
        "rounded_total": _amount_due(doc) + merged_due,
    }

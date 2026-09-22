import frappe
from frappe import _, msgprint


def validate(doc, method):
    validate_bill_check(doc, method)
    validate_cost_center(doc, method)
    validate_credit_settlement(doc, method)


def validate_credit_settlement(doc, method=None):
    if not doc.get("custom_enable_credit_settlement"):
        return

    if not doc.get("custom_credit_mode_of_payment"):
        frappe.throw(_("Select a Credit Mode Of Payment to enable credit settlement."))

    # A credit bill submits with nothing paid, which ERPNext blocks unless the
    # profile allows partial payment.
    if not doc.get("allow_partial_payment"):
        frappe.throw(
            _("Enable 'Allow Partial Payment' on this POS Profile to settle orders on credit.")
        )

    modes = {row.mode_of_payment for row in (doc.get("payments") or [])}
    if doc.custom_credit_mode_of_payment not in modes:
        frappe.throw(
            _("Add {0} to this profile's Payments table before using it for credit.").format(
                doc.custom_credit_mode_of_payment
            )
        )


def validate_bill_check(doc, method):
    if getattr(doc, "printer_settings", None) and isinstance(doc.printer_settings, (list, tuple)):
        for row in doc.printer_settings:
            if hasattr(row, "bill") and hasattr(row, "printer"):
                if not getattr(row, "bill", None) or not getattr(row, "printer", None):
                    msgprint(
                        _(
                            "Either Bill is not enabled / Printer is not selected in Printer Settings."
                        )
                    )
            
def validate_cost_center(doc, method):
    if not doc.cost_center:
       frappe.throw(
                _(
                    "Cost center is mandatory."
                )
            )

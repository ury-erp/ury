import frappe
from frappe import _, msgprint
from frappe.utils import flt


def validate(doc, method):
    validate_bill_check(doc, method)
    validate_cost_center(doc, method)
    validate_credit_settlement(doc, method)
    validate_service_charge(doc, method)


def validate_service_charge(doc, method=None):
    if not doc.get("custom_enable_service_charge"):
        return
    if doc.get("custom_service_charge_order_types") != "Dine In":
        frappe.throw(_("Service charge is currently supported for Dine In orders only."))
    if not 0 < flt(doc.get("custom_service_charge_percentage")) <= 100:
        frappe.throw(_("Set a service charge percentage between 0 and 100."))
    account = doc.get("custom_service_charge_payable_account")
    details = frappe.db.get_value("Account", account, ["company", "root_type", "is_group"], as_dict=True) if account else None
    if not details or details.company != doc.company or details.root_type != "Liability" or details.is_group:
        frappe.throw(_("Choose a liability ledger in this POS Profile's company for waiter service payable."))


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
    pass

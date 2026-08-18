import frappe
from frappe import _, msgprint


def validate(doc, method):
    validate_bill_check(doc, method)
    validate_cost_center(doc, method)


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

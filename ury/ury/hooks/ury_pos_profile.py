import frappe
from frappe import _, msgprint


def validate(doc, method):
    validate_bill_check(doc, method)


def validate_bill_check(doc, method):
    for row in doc.printer_settings:
        if not row.bill or not row.printer:
            msgprint(
                _(
                    "Either Bill is not enabled / Printer is not selected in Printer Settings."
                )
            )

import frappe


def before_insert(doc, event):
    validate_mobile_number(doc, event)


def validate_mobile_number(doc, event):
    if not doc.mobile_number:
        frappe.throw("Mobile Number is Mandatory")

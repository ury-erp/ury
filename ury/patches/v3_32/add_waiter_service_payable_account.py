"""Add a dedicated liability account setting for guest-funded waiter service."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
    fields = [
        field for field in get_custom_fields()["POS Profile"]
        if field.get("fieldname") in {
            "custom_service_charge_income_account",
            "custom_service_charge_payable_account",
        }
    ]
    create_custom_fields({"POS Profile": fields}, update=True)
    for name in ("ury_short_goods_receipt", "merged_pos_invoice_format"):
        frappe.reload_doc("ury", "print_format", name, force=True)

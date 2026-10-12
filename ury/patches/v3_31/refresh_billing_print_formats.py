"""Refresh the two standard POS receipts with separate billing adjustments."""

import frappe


def execute():
    for name in ("ury_short_goods_receipt", "merged_pos_invoice_format"):
        frappe.reload_doc("ury", "print_format", name, force=True)

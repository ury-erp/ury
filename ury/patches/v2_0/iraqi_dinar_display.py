"""Show the Iraqi dinar the way Iraqi receipts write it: "25,000 د.ع".

ERPNext ships IQD as "ع.د" before the amount with three decimals
("ع.د 25,000.000"), which no one in an Iraqi restaurant writes or reads.
Only display fields change; amounts and rounding are untouched.
"""

import frappe


def execute():
    if not frappe.db.exists("Currency", "IQD"):
        return
    frappe.db.set_value(
        "Currency",
        "IQD",
        {"symbol": "د.ع", "symbol_on_right": 1, "number_format": "#,###"},
        update_modified=False,
    )
    frappe.clear_cache(doctype="Currency")

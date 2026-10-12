"""Audit fields for closing a table without printing the bill.

Until now the only way to free an occupied table was to print its invoice:
`qz_print_update` and `print_pos_page` both set `invoice_printed = 1` *and*
released the table, so the paper and the table were welded together. A
restaurant that settles a bill without handing over a receipt had to print one
anyway just to get the table back.

Separating the two needs a record of which is which. `invoice_printed` alone
can no longer answer "did a receipt actually come out", and "how many bills
were closed without one" is precisely the number a manager watches.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    create_custom_fields(
        {
            "POS Invoice": [
                {
                    "fieldname": "custom_closed_without_print",
                    "label": "Closed Without Printing",
                    "fieldtype": "Check",
                    "insert_after": "invoice_printed",
                    "read_only": 1,
                    "allow_on_submit": 1,
                    "description": (
                        "The table was released without a receipt being printed."
                    ),
                },
                {
                    "fieldname": "custom_close_reason",
                    "label": "Close Reason",
                    "fieldtype": "Small Text",
                    "insert_after": "custom_closed_without_print",
                    "read_only": 1,
                    "allow_on_submit": 1,
                    "depends_on": "custom_closed_without_print",
                },
                {
                    "fieldname": "custom_closed_by",
                    "label": "Closed By",
                    "fieldtype": "Link",
                    "options": "User",
                    "insert_after": "custom_close_reason",
                    "read_only": 1,
                    "allow_on_submit": 1,
                    "depends_on": "custom_closed_without_print",
                },
                {
                    "fieldname": "custom_closed_at",
                    "label": "Closed At",
                    "fieldtype": "Datetime",
                    "insert_after": "custom_closed_by",
                    "read_only": 1,
                    "allow_on_submit": 1,
                    "depends_on": "custom_closed_without_print",
                },
            ]
        },
        ignore_validate=True,
    )
    frappe.db.commit()

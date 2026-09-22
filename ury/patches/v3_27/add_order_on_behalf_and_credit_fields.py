"""Add the order-on-behalf and credit-settlement custom fields.

`create_custom_fields` only runs automatically via `after_install`, which does
not touch existing sites, so this patch applies the POS Invoice, Sales Invoice
and POS Profile field definitions idempotently on `bench migrate`.
"""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields

DOCTYPES = ("POS Invoice", "Sales Invoice", "POS Profile")


def execute():
	all_fields = get_custom_fields()
	fields = {dt: all_fields[dt] for dt in DOCTYPES if all_fields.get(dt)}
	if fields:
		create_custom_fields(fields, update=True)

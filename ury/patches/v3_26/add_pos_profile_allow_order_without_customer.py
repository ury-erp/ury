"""Add the `custom_allow_order_without_customer` custom field to POS Profile.

`create_custom_fields` only runs automatically via `after_install`, which
does not touch existing sites, so this patch applies the POS Profile field
definitions idempotently on `bench migrate`.
"""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	fields = get_custom_fields().get("POS Profile")
	if not fields:
		return
	create_custom_fields({"POS Profile": fields}, update=True)

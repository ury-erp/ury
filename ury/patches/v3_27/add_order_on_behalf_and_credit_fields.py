"""Add the order-on-behalf and credit-settlement custom fields.

`create_custom_fields` only runs automatically via `after_install`, which does
not touch existing sites, so this patch applies the POS Invoice, Sales Invoice
and POS Profile field definitions idempotently on `bench migrate`.
"""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields

FIELDNAMES = {
	"POS Invoice": {
		"custom_attribution_section",
		"custom_order_on_behalf",
		"custom_credit_account",
		"custom_settlement_stage",
	},
	"Sales Invoice": {
		"custom_attribution_section",
		"custom_order_on_behalf",
		"custom_credit_account",
		"custom_settlement_stage",
	},
	"POS Profile": {
		"custom_order_attribution_section",
		"custom_enable_order_on_behalf",
		"custom_roles_allowed_to_order_on_behalf",
		"custom_require_performer_on_order",
		"custom_credit_settlement_section",
		"custom_enable_credit_settlement",
		"custom_credit_mode_of_payment",
		"custom_roles_allowed_for_credit",
	},
}


def execute():
	all_fields = get_custom_fields()
	fields = {
		dt: [field for field in all_fields.get(dt, []) if field.get("fieldname") in fieldnames]
		for dt, fieldnames in FIELDNAMES.items()
	}
	fields = {dt: dt_fields for dt, dt_fields in fields.items() if dt_fields}
	if fields:
		create_custom_fields(fields, update=True)

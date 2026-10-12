"""Install service charge and staff discount fields on existing sites."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


FIELDNAMES = {
    "POS Invoice": {"custom_staff_discount_amount", "custom_service_charge_amount"},
    "POS Invoice Item": {
        "custom_staff_policy_discount",
        "custom_staff_policy_base_rate",
        "custom_staff_policy_base_discount_percentage",
    },
    "Sales Taxes and Charges": {"custom_is_service_charge"},
    "POS Profile": {
        "custom_enable_service_charge",
        "custom_service_charge_percentage",
        "custom_service_charge_order_types",
        "custom_service_charge_income_account",
    },
}


def execute():
    definitions = get_custom_fields()
    fields = {
        doctype: [field for field in definitions[doctype] if field.get("fieldname") in names]
        for doctype, names in FIELDNAMES.items()
    }
    create_custom_fields(fields, update=True)

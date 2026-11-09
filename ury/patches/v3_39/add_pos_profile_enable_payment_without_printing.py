import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields({
		"POS Profile": [
			{
				"fieldname": "custom_enable_payment_without_printing",
				"fieldtype": "Check",
				"label": "Enable Payment Without Printing",
				"description": "Allow payment without requiring prior invoice printing in POS",
				"insert_after": "show_image",
				"default": 0,
			}
		]
	}, update=True)

	if frappe.db.exists("Custom Field", "POS Profile-custom_enable_payment_without_printing"):
		frappe.db.set_value(
			"Custom Field",
			"POS Profile-custom_enable_payment_without_printing",
			"insert_after",
			"show_image",
		)

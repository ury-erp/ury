import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Huf is optional: add the chairman_cards field only where Agent Message exists."""
	if not frappe.db.exists("DocType", "Agent Message"):
		return
	create_custom_fields(
		{
			"Agent Message": [
				{
					"fieldname": "chairman_cards",
					"fieldtype": "Code",
					"options": "JSON",
					"label": "Chairman Cards",
					"hidden": 1,
					"read_only": 1,
					"no_copy": 1,
				}
			]
		},
		ignore_validate=True,
	)

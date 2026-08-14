import json
import os

import frappe


def execute():
	if not frappe.db.exists("Print Format", "URY Waiter Order Slip"):
		return

	format_path = os.path.join(
		frappe.get_app_path("ury", "ury", "print_format", "ury_waiter_order_slip"),
		"ury_waiter_order_slip.json",
	)
	with open(format_path) as format_file:
		data = json.load(format_file)

	frappe.db.set_value(
		"Print Format",
		data["name"],
		{
			"doc_type": data["doc_type"],
			"html": data["html"],
			"print_format_type": data["print_format_type"],
			"custom_format": data["custom_format"],
		},
		update_modified=False,
	)

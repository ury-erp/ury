# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ItemOpportunityCost(Document):
	pass


@frappe.whitelist()
def get_opportunity_cost(item_code, branch):
	"""Get the opportunity cost for an item in a specific branch."""
	result = frappe.db.get_value(
		"Item Opportunity Cost",
		{"parent": item_code, "branch": branch},
		"cost",
		as_dict=False,
	)
	return result or 0

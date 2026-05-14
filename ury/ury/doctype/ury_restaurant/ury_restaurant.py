# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class URYRestaurant(Document):
    def validate(self):
        if not frappe.flags.syncing_from_branch:
            frappe.throw("URY Restaurant is deprecated. Please enter or edit data through the Branch doctype.")


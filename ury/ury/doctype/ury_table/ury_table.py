# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import re
import frappe
from frappe import _
from frappe.model.naming import make_autoname
from frappe.model.document import Document


class URYTable(Document):
    def autoname(self):
        if not self.restaurant:
            frappe.throw(_("Restaurant is required to generate a table name"))
        prefix = re.sub("-+", "-", self.restaurant.replace(" ", "-"))
        self.name = make_autoname(prefix + "-.##")

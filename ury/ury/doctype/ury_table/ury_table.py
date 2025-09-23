# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import re
# import frappe
from frappe.model.document import Document
from frappe.model.naming import make_autoname


class URYTable(Document):
    def autoname(self):
        prefix = re.sub("-+", "-", self.restaurant.replace(" ", "-"))
        self.name = make_autoname(prefix + "-.##")

# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import re

class URYTable(Document):
    def autoname(self):
        from frappe.model.naming import make_autoname
        prefix = re.sub("-+", "-", self.branch.replace(" ", "-"))
        self.name = make_autoname(prefix + "-.##")

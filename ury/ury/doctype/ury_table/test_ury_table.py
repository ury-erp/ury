# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

# import frappe
import frappe
from frappe.tests.utils import FrappeTestCase


class TestURYTable(FrappeTestCase):
    def test_autoname_sanitizes_restaurant_name(self):
        table = frappe.get_doc(
            {"doctype": "URY Table", "restaurant": "Victoria's Corner"}
        )
        table.autoname()
        # The apostrophe and spaces must not leak into the naming series.
        self.assertNotIn("'", table.name)
        self.assertNotIn(" ", table.name)

    def test_autoname_keeps_valid_hyphens(self):
        table = frappe.get_doc(
            {"doctype": "URY Table", "restaurant": "Main Hall"}
        )
        table.autoname()
        self.assertTrue(table.name.startswith("Main-Hall-."))

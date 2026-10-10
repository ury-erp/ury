"""Choosing a customer is optional: an order without one is billed to its table."""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.ury_order.ury_order import WALK_IN_CUSTOMER, resolve_order_customer

TABLE = "_Test Customer Table"


class TestResolveOrderCustomer(FrappeTestCase):

    def tearDown(self):
        frappe.db.rollback()

    def _profile(self, **values):
        return frappe._dict(values)

    def test_a_chosen_customer_wins(self):
        self.assertEqual(
            resolve_order_customer("Ali", TABLE, frappe._dict(), self._profile()),
            "Ali",
        )

    def test_a_running_order_keeps_its_customer(self):
        invoice = frappe._dict(customer="Ali")
        self.assertEqual(resolve_order_customer("", TABLE, invoice, self._profile()), "Ali")

    def test_a_table_order_is_billed_to_the_table_registered_once(self):
        first = resolve_order_customer("", TABLE, frappe._dict(), self._profile())
        self.assertEqual(frappe.db.get_value("Customer", first, "customer_name"), TABLE)

        second = resolve_order_customer(None, TABLE, frappe._dict(), self._profile())
        self.assertEqual(first, second)
        self.assertEqual(frappe.db.count("Customer", {"customer_name": TABLE}), 1)

    def test_takeaway_uses_the_profile_default_customer(self):
        self.assertEqual(
            resolve_order_customer("", None, frappe._dict(), self._profile(customer="Walk In")),
            "Walk In",
        )

    def test_takeaway_without_a_default_gets_the_walk_in_customer(self):
        name = resolve_order_customer("", None, frappe._dict(), self._profile())
        self.assertEqual(frappe.db.get_value("Customer", name, "customer_name"), WALK_IN_CUSTOMER)

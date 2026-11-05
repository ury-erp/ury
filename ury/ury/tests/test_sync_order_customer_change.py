"""Customer change on an open order: allowed, except for Aggregators orders."""

from __future__ import annotations

import inspect
import unittest
from types import SimpleNamespace

import frappe

from ury.ury.doctype.ury_order import ury_order
from ury.ury.doctype.ury_order.ury_order import _validate_customer_change


class TestValidateCustomerChange(unittest.TestCase):
    def test_new_invoice_is_not_restricted(self):
        _validate_customer_change(SimpleNamespace(name=None, customer=None, order_type="Take Away"), "CUST-A")

    def test_open_order_customer_can_be_replaced(self):
        for order_type in ("Dine In", "Take Away", "Delivery", "Phone In"):
            invoice = SimpleNamespace(name="INV-1", customer="CUST-WALK", order_type=order_type)
            _validate_customer_change(invoice, "CUST-REAL")

    def test_same_customer_is_a_no_op(self):
        invoice = SimpleNamespace(name="INV-1", customer="CUST-A", order_type="Aggregators")
        _validate_customer_change(invoice, "CUST-A")

    def test_aggregator_order_customer_cannot_change(self):
        invoice = SimpleNamespace(name="INV-1", customer="Zomato", order_type="Aggregators")
        with self.assertRaises(frappe.ValidationError):
            _validate_customer_change(invoice, "CUST-REAL")


class TestSyncOrderWiring(unittest.TestCase):
    def test_sync_order_validates_the_change_and_refreshes_customer_name(self):
        src = inspect.getsource(ury_order.sync_order)
        self.assertIn("_validate_customer_change(invoice, customer)", src)
        self.assertIn("invoice.customer_name = customerdoc.customer_name", src)

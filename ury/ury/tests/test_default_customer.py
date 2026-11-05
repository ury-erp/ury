"""Per-order-type default customer: resolution, payload, validation, removed API.

DB access is mocked (``frappe.get_all``) so these run as plain unit tests.
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from ury.ury_pos import default_customer as dc


class FakeProfile:
	def __init__(self, rows=(), customer=None, name="Test Profile"):
		self.name = name
		self.customer = customer
		self.custom_order_type_customers = [
			SimpleNamespace(idx=i + 1, order_type=o, customer=c) for i, (o, c) in enumerate(rows)
		]

	def get(self, key, default=None):
		return getattr(self, key, default)


def _customers(*specs):
	"""specs: (name, customer_name, mobile_number, disabled)"""
	return [
		SimpleNamespace(name=n, customer_name=cn, mobile_number=m, disabled=d) for n, cn, m, d in specs
	]


WALK_IN = ("CUST-WALK", "Walk-In Customer", "000", 0)
REGULAR = ("CUST-REG", "Regular Customer", "999", 0)
DISABLED = ("CUST-OFF", "Gone Customer", "111", 1)


class TestPayload(unittest.TestCase):
	@patch.object(frappe, "get_all")
	def test_map_and_profile_default(self, get_all):
		get_all.return_value = _customers(WALK_IN, REGULAR)
		profile = FakeProfile(rows=[("Take Away", "CUST-WALK")], customer="CUST-REG")

		cfg = dc.get_default_customer_config(profile)

		self.assertEqual(
			cfg["order_type_customer_map"],
			{"Take Away": {"customer": "CUST-WALK", "customer_name": "Walk-In Customer", "mobile_number": "000"}},
		)
		self.assertEqual(cfg["default_customer"]["customer"], "CUST-REG")

	@patch.object(frappe, "get_all")
	def test_single_batched_query(self, get_all):
		get_all.return_value = _customers(WALK_IN, REGULAR)
		profile = FakeProfile(
			rows=[("Take Away", "CUST-WALK"), ("Dine In", "CUST-WALK")], customer="CUST-REG"
		)

		dc.get_default_customer_config(profile)

		self.assertEqual(get_all.call_count, 1)

	@patch.object(frappe, "get_all")
	def test_empty_when_nothing_configured(self, get_all):
		cfg = dc.get_default_customer_config(FakeProfile())

		self.assertEqual(cfg, {"order_type_customer_map": {}, "default_customer": None})
		get_all.assert_not_called()

	@patch.object(frappe, "get_all")
	def test_disabled_customer_is_skipped(self, get_all):
		get_all.return_value = _customers(DISABLED, WALK_IN)
		profile = FakeProfile(rows=[("Take Away", "CUST-OFF")], customer="CUST-WALK")

		cfg = dc.get_default_customer_config(profile)

		self.assertEqual(cfg["order_type_customer_map"], {})
		self.assertEqual(cfg["default_customer"]["customer"], "CUST-WALK")

	@patch.object(frappe, "get_all")
	def test_deleted_customer_is_skipped(self, get_all):
		get_all.return_value = []
		profile = FakeProfile(rows=[("Take Away", "CUST-GONE")], customer="CUST-GONE")

		cfg = dc.get_default_customer_config(profile)

		self.assertEqual(cfg, {"order_type_customer_map": {}, "default_customer": None})


class TestResolve(unittest.TestCase):
	def _resolve(self, profile, order_type, customers):
		with patch.object(frappe, "get_all", return_value=_customers(*customers)):
			return dc.resolve_default_customer(profile, order_type)

	def test_order_type_row_wins(self):
		profile = FakeProfile(rows=[("Take Away", "CUST-WALK")], customer="CUST-REG")
		self.assertEqual(self._resolve(profile, "Take Away", (WALK_IN, REGULAR)), "CUST-WALK")

	def test_falls_back_to_profile_default(self):
		profile = FakeProfile(rows=[("Take Away", "CUST-WALK")], customer="CUST-REG")
		self.assertEqual(self._resolve(profile, "Delivery", (WALK_IN, REGULAR)), "CUST-REG")

	def test_none_when_nothing_configured(self):
		self.assertIsNone(self._resolve(FakeProfile(), "Take Away", ()))

	def test_aggregators_never_resolved(self):
		profile = FakeProfile(rows=[("Take Away", "CUST-WALK")], customer="CUST-REG")
		self.assertIsNone(self._resolve(profile, "Aggregators", (WALK_IN, REGULAR)))

	def test_missing_order_type(self):
		profile = FakeProfile(customer="CUST-REG")
		self.assertIsNone(self._resolve(profile, None, (REGULAR,)))

	def test_disabled_row_falls_through_to_profile_default(self):
		profile = FakeProfile(rows=[("Take Away", "CUST-OFF")], customer="CUST-REG")
		self.assertEqual(self._resolve(profile, "Take Away", (DISABLED, REGULAR)), "CUST-REG")


class TestValidation(unittest.TestCase):
	def test_duplicate_order_type_rejected(self):
		profile = FakeProfile(rows=[("Take Away", "CUST-WALK"), ("Take Away", "CUST-REG")])
		with self.assertRaises(frappe.ValidationError):
			dc.validate_order_type_customers(profile)

	@patch.object(frappe, "get_all")
	def test_disabled_customer_rejected(self, get_all):
		get_all.return_value = [SimpleNamespace(name="CUST-OFF", disabled=1)]
		with self.assertRaises(frappe.ValidationError):
			dc.validate_order_type_customers(FakeProfile(rows=[("Take Away", "CUST-OFF")]))

	@patch.object(frappe, "get_all")
	def test_missing_customer_rejected(self, get_all):
		get_all.return_value = []
		with self.assertRaises(frappe.ValidationError):
			dc.validate_order_type_customers(FakeProfile(rows=[("Take Away", "CUST-GONE")]))

	@patch.object(frappe, "get_all")
	def test_valid_rows_pass(self, get_all):
		get_all.return_value = [
			SimpleNamespace(name="CUST-WALK", disabled=0),
			SimpleNamespace(name="CUST-REG", disabled=0),
		]
		dc.validate_order_type_customers(
			FakeProfile(rows=[("Take Away", "CUST-WALK"), ("Dine In", "CUST-REG")])
		)

	def test_empty_table_is_valid(self):
		dc.validate_order_type_customers(FakeProfile())


class TestRemovedApi(unittest.TestCase):
	def test_customer_by_order_type_endpoint_removed(self):
		from ury.ury_pos import api

		self.assertFalse(hasattr(api, "get_customers_by_order_type"))


class TestSyncOrderFallbackWiring(unittest.TestCase):
	def test_sync_order_uses_resolver_only_for_new_orders_without_customer(self):
		import inspect

		from ury.ury.doctype.ury_order import ury_order

		src = inspect.getsource(ury_order.sync_order)
		self.assertIn("if not customer and not invoice.name:", src)
		self.assertIn("resolve_default_customer(", src)

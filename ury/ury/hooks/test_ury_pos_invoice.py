"""Tests for `calculate_and_set_times` (fix-calculate-and-set-times-typeerror).

Mock-based unit tests, matching the established pattern in this package
(`test_ury_pos_closing_entry.py`): the behaviour under test is time-value
coercion, not ERPNext's invoice/submit machinery.

Pinned here:

  1. `doc.creation` as a string (the state of a freshly inserted-but-not-
     reloaded document) no longer raises a TypeError when subtracted from
     the current time.
  2. `total_spend_time` is set to a valid `HH:MM:SS` string in that case.
  3. `doc.creation` as a real `datetime.datetime` still works as before.
"""

import re
from datetime import datetime, timedelta
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.hooks.ury_pos_invoice import calculate_and_set_times, validate

MODULE = "ury.ury.hooks.ury_pos_invoice"

HHMMSS_RE = re.compile(r"^\d{2}:\d{2}:\d{2}$")


class _FakeInvoice:
	def __init__(self, creation):
		self.creation = creation
		self.arrived_time = None
		self.total_spend_time = None


class TestCalculateAndSetTimes(FrappeTestCase):
	def test_string_creation_does_not_raise_and_sets_valid_time(self):
		"""Reproduces the live bug: insert a POS Invoice and call
		calculate_and_set_times immediately, without an explicit
		doc.reload() in between, so doc.creation is still a plain string."""
		creation_dt = datetime.now() - timedelta(minutes=5)
		creation_str = creation_dt.strftime("%Y-%m-%d %H:%M:%S.%f")
		doc = _FakeInvoice(creation=creation_str)

		now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")
		with patch(f"{MODULE}.now", return_value=now_str):
			calculate_and_set_times(doc, "before_submit")

		self.assertEqual(doc.arrived_time, creation_str)
		self.assertIsNotNone(doc.total_spend_time)
		self.assertRegex(doc.total_spend_time, HHMMSS_RE)

	def test_datetime_creation_still_works(self):
		"""A loaded invoice retains datetime arithmetic."""
		creation_dt = datetime.now() - timedelta(minutes=10)
		doc = _FakeInvoice(creation=creation_dt)

		now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")
		with patch(f"{MODULE}.now", return_value=now_str):
			calculate_and_set_times(doc, "before_submit")

		self.assertEqual(doc.arrived_time, creation_dt)
		self.assertIsNotNone(doc.total_spend_time)
		self.assertRegex(doc.total_spend_time, HHMMSS_RE)

	def test_none_creation_handles_gracefully(self):
		"""doc.creation is None must fall back to current time without raising TypeError."""
		doc = _FakeInvoice(creation=None)

		now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")
		with patch(f"{MODULE}.now", return_value=now_str):
			calculate_and_set_times(doc, "before_submit")

		self.assertIsNotNone(doc.arrived_time)
		self.assertIsNotNone(doc.total_spend_time)
		self.assertRegex(doc.total_spend_time, HHMMSS_RE)


class TestPrintedChargeChange(FrappeTestCase):
	def test_revised_waiter_charge_requires_reprint(self):
		class Invoice(frappe._dict):
			def get_doc_before_save(self):
				return frappe._dict(invoice_printed=1, custom_service_charge_amount=0)

		doc = Invoice(
			pos_profile="Demo Profile", company="Test Co", branch="Test Branch",
			docstatus=0, invoice_printed=1, custom_service_charge_amount=0,
		)
		with patch(f"{MODULE}.validate_invoice"), patch(f"{MODULE}.validate_customer"), patch(
			f"{MODULE}.validate_price_list"
		), patch(f"{MODULE}.set_commission_attribution"), patch(
			f"{MODULE}.prepare_invoice_billing",
			side_effect=lambda invoice: invoice.update(custom_service_charge_amount=23),
		):
			validate(doc, "validate")
		self.assertEqual(doc.invoice_printed, 0)

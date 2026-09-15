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

from frappe.tests.utils import FrappeTestCase

from ury.ury.hooks.ury_pos_invoice import calculate_and_set_times

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
		"""doc.creation already a datetime.datetime (post-reload state)
		must keep working exactly as before the fix."""
		creation_dt = datetime.now() - timedelta(minutes=10)
		doc = _FakeInvoice(creation=creation_dt)

		now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")
		with patch(f"{MODULE}.now", return_value=now_str):
			calculate_and_set_times(doc, "before_submit")

		self.assertEqual(doc.arrived_time, creation_dt)
		self.assertIsNotNone(doc.total_spend_time)
		self.assertRegex(doc.total_spend_time, HHMMSS_RE)

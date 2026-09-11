# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching the test_ury_yield_variance.py
# convention) rather than a live bench -- no bench/Docker is available in this task's
# worktree. These were reviewed by hand (traced call-by-call against ury_item.py)
# rather than executed against a real site; see the task report for that walkthrough.
# Static validation performed: python3 -m py_compile and git diff --check.

import unittest
from unittest.mock import patch, MagicMock

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.hooks.ury_item import validate_yield_tracking


MODULE = "ury.ury.hooks.ury_item"


class TestValidateYieldTracking(FrappeTestCase):
	"""Test A1: validate_yield_tracking range checking."""

	def _create_item_doc(**kwargs):
		"""Helper to create an Item document with defaults."""
		defaults = {
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
			"item_name": "Test Item",
		}
		defaults.update(kwargs)
		doc = MagicMock()
		for key, value in defaults.items():
			doc.get = MagicMock(side_effect=lambda k, default=None: defaults.get(k, default))
		return doc

	def test_passes_when_yield_tracked_is_false(self):
		"""Validation passes when custom_yield_tracked=0, regardless of yield_percent."""
		doc = MagicMock()
		doc.get.side_effect = lambda k, default=None: {
			"custom_yield_tracked": 0,
			"custom_yield_percent": -10,  # Invalid, but should not be checked
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
		}.get(k, default)

		# Should not raise
		validate_yield_tracking(doc, "validate")

	def test_passes_when_yield_tracked_is_none(self):
		"""Validation passes when custom_yield_tracked is None/falsy."""
		doc = MagicMock()
		doc.get.side_effect = lambda k, default=None: {
			"custom_yield_tracked": None,
			"custom_yield_percent": 50,
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
		}.get(k, default)

		# Should not raise
		validate_yield_tracking(doc, "validate")

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_yield_percent_is_zero(self, mock_throw):
		"""Validation fails when custom_yield_percent=0 and custom_yield_tracked=1."""
		doc = MagicMock()
		doc.get.side_effect = lambda k, default=None: {
			"custom_yield_tracked": 1,
			"custom_yield_percent": 0,
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
		}.get(k, default)

		validate_yield_tracking(doc, "validate")

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("must be greater than 0 and at most 100", str(call_args[0]))

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_yield_percent_is_negative(self, mock_throw):
		"""Validation fails when custom_yield_percent < 0 and custom_yield_tracked=1."""
		doc = MagicMock()
		doc.get.side_effect = lambda k, default=None: {
			"custom_yield_tracked": 1,
			"custom_yield_percent": -10,
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
		}.get(k, default)

		validate_yield_tracking(doc, "validate")

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("must be greater than 0 and at most 100", str(call_args[0]))

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_yield_percent_exceeds_100(self, mock_throw):
		"""Validation fails when custom_yield_percent > 100 and custom_yield_tracked=1."""
		doc = MagicMock()
		doc.get.side_effect = lambda k, default=None: {
			"custom_yield_tracked": 1,
			"custom_yield_percent": 120,
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
		}.get(k, default)

		validate_yield_tracking(doc, "validate")

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("must be greater than 0 and at most 100", str(call_args[0]))

	def test_passes_when_yield_percent_is_valid_range_lower_bound(self):
		"""Validation passes when custom_yield_percent=0.1 (just above 0)."""
		doc = MagicMock()
		doc.get.side_effect = lambda k, default=None: {
			"custom_yield_tracked": 1,
			"custom_yield_percent": 0.1,
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
		}.get(k, default)

		# Should not raise
		validate_yield_tracking(doc, "validate")

	def test_passes_when_yield_percent_is_valid_range_mid(self):
		"""Validation passes when custom_yield_percent=85 (middle of range)."""
		doc = MagicMock()
		doc.get.side_effect = lambda k, default=None: {
			"custom_yield_tracked": 1,
			"custom_yield_percent": 85,
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
		}.get(k, default)

		# Should not raise
		validate_yield_tracking(doc, "validate")

	def test_passes_when_yield_percent_is_valid_range_upper_bound(self):
		"""Validation passes when custom_yield_percent=100 (upper bound)."""
		doc = MagicMock()
		doc.get.side_effect = lambda k, default=None: {
			"custom_yield_tracked": 1,
			"custom_yield_percent": 100,
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
		}.get(k, default)

		# Should not raise
		validate_yield_tracking(doc, "validate")

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_yield_percent_is_none(self, mock_throw):
		"""Validation fails when custom_yield_percent is None and custom_yield_tracked=1."""
		doc = MagicMock()
		doc.get.side_effect = lambda k, default=None: {
			"custom_yield_tracked": 1,
			"custom_yield_percent": None,
			"name": "TEST-ITEM-001",
			"item_code": "TEST-ITEM-001",
		}.get(k, default)

		validate_yield_tracking(doc, "validate")

		mock_throw.assert_called_once()


if __name__ == "__main__":
	unittest.main()

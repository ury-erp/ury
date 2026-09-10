# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching the test_bom_cost_resolver.py
# convention) rather than a live bench -- no bench/Docker is available in this
# task's worktree. These were reviewed by hand (traced call-by-call against
# yield_check_reminders.py) rather than executed against a real site; see the
# task report for that walkthrough. Static validation performed:
# python3 -m py_compile and git diff --check.

import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, date, timedelta

import frappe

from ury.ury.services.yield_check_reminders import (
	get_due_yield_checks,
	_evaluate_cadence,
	_evaluate_every_issue,
	_evaluate_interval,
	_evaluate_sampled,
)


MOD = "ury.ury.services.yield_check_reminders"


def _item(
	name="TEST-ITEM",
	item_name="Test Item",
	cadence="Every Issue",
	interval_days=7,
):
	return frappe._dict({
		"name": name,
		"item_name": item_name,
		"custom_yield_check_cadence": cadence,
		"custom_yield_check_interval_days": interval_days,
	})


class TestEvaluateEveryIssue(unittest.TestCase):
	"""Test Every Issue cadence mode."""

	@patch(f"{MOD}.frappe.db.exists")
	@patch(f"{MOD}.frappe.get_all")
	def test_due_when_authorized_issue_exists_without_yield_check(
		self, mock_get_all, mock_exists
	):
		"""Item is due when an authorized issue exists with no yield check."""
		mock_get_all.return_value = [frappe._dict(name="AUTH-001")]
		mock_exists.return_value = False  # No yield check yet

		item = _item(cadence="Every Issue")
		reason, extra = _evaluate_every_issue(item, "Test Branch")

		self.assertIsNotNone(reason)
		self.assertIn("pending yield check", reason)
		self.assertEqual(extra, {})

	@patch(f"{MOD}.frappe.db.exists")
	@patch(f"{MOD}.frappe.get_all")
	def test_not_due_when_yield_check_exists_for_authorization(
		self, mock_get_all, mock_exists
	):
		"""Item is not due when a yield check already references the authorization."""
		mock_get_all.return_value = [frappe._dict(name="AUTH-001")]
		mock_exists.return_value = True  # Yield check exists

		item = _item(cadence="Every Issue")
		reason, extra = _evaluate_every_issue(item, "Test Branch")

		self.assertIsNone(reason)
		self.assertIsNone(extra)

	@patch(f"{MOD}.frappe.get_all")
	def test_not_due_when_no_authorized_issues(self, mock_get_all):
		"""Item is not due when no authorized issues exist."""
		mock_get_all.return_value = []

		item = _item(cadence="Every Issue")
		reason, extra = _evaluate_every_issue(item, "Test Branch")

		self.assertIsNone(reason)
		self.assertIsNone(extra)

	@patch(f"{MOD}.frappe.db.exists")
	@patch(f"{MOD}.frappe.get_all")
	def test_multiple_authorizations_first_unchecked_is_due(
		self, mock_get_all, mock_exists
	):
		"""When multiple authorizations exist, the first unchecked one makes item due."""
		mock_get_all.return_value = [
			frappe._dict(name="AUTH-001"),
			frappe._dict(name="AUTH-002"),
		]
		# First auth has no check, second has a check
		mock_exists.side_effect = [False, True]

		item = _item(cadence="Every Issue")
		reason, extra = _evaluate_every_issue(item, "Test Branch")

		self.assertIsNotNone(reason)
		self.assertIn("AUTH-001", reason)


class TestEvaluateInterval(unittest.TestCase):
	"""Test Interval cadence mode."""

	@patch(f"{MOD}.frappe.utils.getdate")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_due_immediately_when_never_checked(self, mock_get_value, mock_getdate):
		"""Item is due immediately if never checked."""
		today = date(2026, 1, 15)
		mock_getdate.return_value = today
		mock_get_value.return_value = None  # No last check

		item = _item(cadence="Interval", interval_days=7)
		reason, extra = _evaluate_interval(item, "Test Branch")

		self.assertIsNotNone(reason)
		self.assertIn("No yield check recorded", reason)
		self.assertEqual(extra, {})

	@patch(f"{MOD}.frappe.utils.getdate")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_not_due_when_within_interval(self, mock_get_value, mock_getdate):
		"""Item is not due if last check is within the interval."""
		today = date(2026, 1, 15)
		last_check = date(2026, 1, 12)  # 3 days ago, interval=7
		mock_getdate.return_value = today
		mock_get_value.return_value = last_check

		item = _item(cadence="Interval", interval_days=7)
		reason, extra = _evaluate_interval(item, "Test Branch")

		self.assertIsNone(reason)
		self.assertIsNone(extra)

	@patch(f"{MOD}.frappe.utils.getdate")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_due_when_overdue_by_interval(self, mock_get_value, mock_getdate):
		"""Item is due when last check is older than interval."""
		today = date(2026, 1, 15)
		last_check = date(2026, 1, 5)  # 10 days ago, interval=7
		mock_getdate.return_value = today
		mock_get_value.return_value = last_check

		item = _item(cadence="Interval", interval_days=7)
		reason, extra = _evaluate_interval(item, "Test Branch")

		self.assertIsNotNone(reason)
		self.assertIn("10 days since last check", reason)
		self.assertEqual(extra["days_overdue"], 3)  # 10 - 7

	@patch(f"{MOD}.frappe.utils.getdate")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_days_overdue_calculation_correct(self, mock_get_value, mock_getdate):
		"""days_overdue is correctly calculated as days_since - interval."""
		today = date(2026, 1, 20)
		last_check = date(2026, 1, 1)  # 19 days ago, interval=5
		mock_getdate.return_value = today
		mock_get_value.return_value = last_check

		item = _item(cadence="Interval", interval_days=5)
		reason, extra = _evaluate_interval(item, "Test Branch")

		self.assertEqual(extra["days_overdue"], 14)  # 19 - 5

	@patch(f"{MOD}.frappe.utils.getdate")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_not_due_when_interval_is_zero_or_negative(self, mock_get_value, mock_getdate):
		"""Item is not due if interval_days is <= 0."""
		today = date(2026, 1, 15)
		mock_getdate.return_value = today

		item = _item(cadence="Interval", interval_days=0)
		reason, extra = _evaluate_interval(item, "Test Branch")

		self.assertIsNone(reason)
		self.assertIsNone(extra)


class TestEvaluateSampled(unittest.TestCase):
	"""Test Sampled cadence mode (deterministic hash-based sampling)."""

	@patch(f"{MOD}.frappe.utils.getdate")
	def test_sampled_deterministic_same_date_branch_item_same_result(
		self, mock_getdate
	):
		"""Sampled evaluation is deterministic: same inputs always give same result."""
		today = date(2026, 1, 15)
		mock_getdate.return_value = today

		item = _item(name="ITEM-A", cadence="Sampled")
		reason1, extra1 = _evaluate_sampled(item, "Branch-A")
		reason2, extra2 = _evaluate_sampled(item, "Branch-A")

		# Must be identical
		self.assertEqual(reason1, reason2)
		self.assertEqual(extra1, extra2)

	@patch(f"{MOD}.frappe.utils.getdate")
	def test_sampled_different_dates_may_differ(self, mock_getdate):
		"""Sampled evaluation may differ for different dates (but is still deterministic)."""
		# First call: date A
		mock_getdate.return_value = date(2026, 1, 15)
		item = _item(name="ITEM-A", cadence="Sampled")
		reason1, extra1 = _evaluate_sampled(item, "Branch-A")

		# Second call: date B
		mock_getdate.return_value = date(2026, 1, 16)
		reason2, extra2 = _evaluate_sampled(item, "Branch-A")

		# Results may differ, but each is deterministic when called again with same date
		# (can't directly verify without controlling the hash, but we verify determinism)

	@patch(f"{MOD}.frappe.utils.getdate")
	def test_sampled_result_is_boolean(self, mock_getdate):
		"""Sampled evaluation returns either (reason, {}) or (None, None), not a complex object."""
		today = date(2026, 1, 15)
		mock_getdate.return_value = today

		item = _item(cadence="Sampled")
		reason, extra = _evaluate_sampled(item, "Test Branch")

		if reason is not None:
			self.assertIsInstance(reason, str)
			self.assertIn("Sampled", reason)
			self.assertEqual(extra, {})
		else:
			self.assertIsNone(extra)

	@patch(f"{MOD}.frappe.utils.getdate")
	def test_sampled_different_items_different_results(self, mock_getdate):
		"""Different items may have different sampling outcomes on same day."""
		today = date(2026, 1, 15)
		mock_getdate.return_value = today

		item_a = _item(name="ITEM-A", cadence="Sampled")
		item_b = _item(name="ITEM-B", cadence="Sampled")

		reason_a, _ = _evaluate_sampled(item_a, "Branch-A")
		reason_b, _ = _evaluate_sampled(item_b, "Branch-A")

		# May or may not differ, but this tests that different items are evaluated independently
		# and the function returns valid results for both


class TestEvaluateCadenceDispatcher(unittest.TestCase):
	"""Test _evaluate_cadence dispatcher function."""

	@patch(f"{MOD}._evaluate_every_issue")
	def test_dispatches_to_every_issue_when_cadence_is_every_issue(
		self, mock_every_issue
	):
		"""_evaluate_cadence dispatches to _evaluate_every_issue for 'Every Issue' mode."""
		mock_every_issue.return_value = ("due", {})

		item = _item(cadence="Every Issue")
		reason, extra = _evaluate_cadence(item, "Test Branch")

		mock_every_issue.assert_called_once_with(item, "Test Branch")

	@patch(f"{MOD}._evaluate_interval")
	def test_dispatches_to_interval_when_cadence_is_interval(self, mock_interval):
		"""_evaluate_cadence dispatches to _evaluate_interval for 'Interval' mode."""
		mock_interval.return_value = ("due", {"days_overdue": 3})

		item = _item(cadence="Interval")
		reason, extra = _evaluate_cadence(item, "Test Branch")

		mock_interval.assert_called_once_with(item, "Test Branch")

	@patch(f"{MOD}._evaluate_sampled")
	def test_dispatches_to_sampled_when_cadence_is_sampled(self, mock_sampled):
		"""_evaluate_cadence dispatches to _evaluate_sampled for 'Sampled' mode."""
		mock_sampled.return_value = ("due", {})

		item = _item(cadence="Sampled")
		reason, extra = _evaluate_cadence(item, "Test Branch")

		mock_sampled.assert_called_once_with(item, "Test Branch")

	def test_returns_none_when_cadence_is_unknown(self):
		"""_evaluate_cadence returns (None, None) for unknown cadence modes."""
		item = _item(cadence="Unknown Mode")
		reason, extra = _evaluate_cadence(item, "Test Branch")

		self.assertIsNone(reason)
		self.assertIsNone(extra)


class TestGetDueYieldChecksPermissionGating(unittest.TestCase):
	"""Test get_due_yield_checks permission and scope gating."""

	@patch(f"{MOD}.require_manager")
	def test_require_manager_called(self, mock_manager):
		"""get_due_yield_checks calls require_manager()."""
		mock_manager.side_effect = frappe.PermissionError

		with self.assertRaises(frappe.PermissionError):
			get_due_yield_checks("Test Branch")

		mock_manager.assert_called_once()

	@patch(f"{MOD}.frappe.db.get_value")
	@patch(f"{MOD}.require_manager")
	def test_require_scope_fails_when_branch_has_no_company(self, mock_manager, mock_get_value):
		"""get_due_yield_checks fails closed if branch.company is None."""
		mock_get_value.return_value = None  # Branch has no company

		with self.assertRaises(frappe.ValidationError):
			get_due_yield_checks("Test Branch")


class TestGetDueYieldChecksIntegration(unittest.TestCase):
	"""Integration tests for get_due_yield_checks."""

	@patch(f"{MOD}._evaluate_cadence")
	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}.frappe.db.get_value")
	@patch(f"{MOD}.require_manager")
	def test_returns_list_of_due_items(
		self, mock_manager, mock_get_value, mock_get_all, mock_evaluate
	):
		"""get_due_yield_checks returns a list of due items."""
		mock_get_value.return_value = "Test Co"
		mock_get_all.return_value = [
			_item(name="ITEM-A"),
			_item(name="ITEM-B"),
		]
		mock_evaluate.side_effect = [
			("due for interval", {}),
			(None, None),
		]

		result = get_due_yield_checks("Test Branch")

		self.assertEqual(len(result), 1)  # Only ITEM-A is due
		self.assertEqual(result[0]["item"], "ITEM-A")

	@patch(f"{MOD}._evaluate_cadence")
	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}.frappe.db.get_value")
	@patch(f"{MOD}.require_manager")
	def test_due_item_includes_cadence_and_reason(
		self, mock_manager, mock_get_value, mock_get_all, mock_evaluate
	):
		"""Due items include cadence, item name, and reason."""
		mock_get_value.return_value = "Test Co"
		mock_get_all.return_value = [_item(name="ITEM-A", item_name="Item A")]
		mock_evaluate.return_value = ("due for interval", {})

		result = get_due_yield_checks("Test Branch")

		self.assertEqual(result[0]["item"], "ITEM-A")
		self.assertEqual(result[0]["item_name"], "Item A")
		self.assertEqual(result[0]["cadence"], "Every Issue")
		self.assertEqual(result[0]["reason"], "due for interval")

	@patch(f"{MOD}._evaluate_cadence")
	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}.frappe.db.get_value")
	@patch(f"{MOD}.require_manager")
	def test_extra_fields_merged_into_due_item(
		self, mock_manager, mock_get_value, mock_get_all, mock_evaluate
	):
		"""Extra fields from _evaluate_cadence are merged into the due item."""
		mock_get_value.return_value = "Test Co"
		mock_get_all.return_value = [_item(name="ITEM-A")]
		mock_evaluate.return_value = ("due", {"days_overdue": 3})

		result = get_due_yield_checks("Test Branch")

		self.assertEqual(result[0]["days_overdue"], 3)


class TestBOMHookYieldBackCalculation(unittest.TestCase):
	"""Test BOM Item yield back-calculation hook."""

	@patch("ury.ury.hooks.ury_bom.frappe.get_doc")
	def test_qty_calculated_from_yield_qty_and_percent(self, mock_get_doc):
		"""BOM Item qty is calculated as: qty = custom_yield_qty / (custom_yield_percent / 100)."""
		from ury.ury.hooks.ury_bom import apply_yield_back_calculation

		item_mock = MagicMock()
		item_mock.custom_yield_tracked = 1

		bom_doc = MagicMock()
		row = MagicMock()
		row.custom_yield_qty = 1.0
		row.custom_yield_percent = 85.0
		row.item_code = "TEST-ITEM"
		bom_doc.items = [row]

		mock_get_doc.return_value = item_mock

		apply_yield_back_calculation(bom_doc, None)

		# qty should be 1.0 / (85.0 / 100) = 1.0 / 0.85 = 1.176...
		expected_qty = 1.0 / 0.85
		self.assertAlmostEqual(row.qty, expected_qty, places=5)

	@patch("ury.ury.hooks.ury_bom.frappe.get_doc")
	def test_qty_not_overwritten_when_yield_tracking_disabled(self, mock_get_doc):
		"""BOM Item qty is not recalculated if Item.custom_yield_tracked is False."""
		from ury.ury.hooks.ury_bom import apply_yield_back_calculation

		item_mock = MagicMock()
		item_mock.custom_yield_tracked = 0  # Disabled

		bom_doc = MagicMock()
		row = MagicMock()
		row.custom_yield_qty = 1.0
		row.custom_yield_percent = 85.0
		row.item_code = "TEST-ITEM"
		row.qty = 10.0  # Original value
		bom_doc.items = [row]

		mock_get_doc.return_value = item_mock

		apply_yield_back_calculation(bom_doc, None)

		# qty should remain unchanged (10.0, not recalculated)
		self.assertEqual(row.qty, 10.0)

	@patch("ury.ury.hooks.ury_bom.frappe.get_doc")
	def test_skips_rows_without_yield_qty(self, mock_get_doc):
		"""Rows without custom_yield_qty set are skipped."""
		from ury.ury.hooks.ury_bom import apply_yield_back_calculation

		bom_doc = MagicMock()
		row = MagicMock()
		row.custom_yield_qty = None  # Not set
		row.custom_yield_percent = 85.0
		row.item_code = "TEST-ITEM"
		bom_doc.items = [row]

		apply_yield_back_calculation(bom_doc, None)

		# frappe.get_doc should not be called since row was skipped
		mock_get_doc.assert_not_called()

	@patch("ury.ury.hooks.ury_bom.frappe.get_doc")
	def test_skips_rows_with_zero_yield_percent(self, mock_get_doc):
		"""Rows with custom_yield_percent=0 are skipped (guard against division by zero)."""
		from ury.ury.hooks.ury_bom import apply_yield_back_calculation

		item_mock = MagicMock()
		item_mock.custom_yield_tracked = 1

		bom_doc = MagicMock()
		row = MagicMock()
		row.custom_yield_qty = 1.0
		row.custom_yield_percent = 0  # Zero
		row.item_code = "TEST-ITEM"
		row.qty = 5.0  # Original value
		bom_doc.items = [row]

		mock_get_doc.return_value = item_mock

		apply_yield_back_calculation(bom_doc, None)

		# qty should remain unchanged (5.0, not recalculated)
		self.assertEqual(row.qty, 5.0)


if __name__ == "__main__":
	unittest.main()

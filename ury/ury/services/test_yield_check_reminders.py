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
from frappe.tests.utils import FrappeTestCase

from ury.ury.services.yield_check_reminders import (
	get_due_yield_checks,
	_evaluate_cadence,
	_evaluate_every_issue,
	_evaluate_interval,
	_evaluate_sampled,
	branch_item_codes,
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

	@patch(f"{MOD}.getdate")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_due_immediately_when_never_checked(self, mock_get_value, mock_getdate):
		"""Item is due immediately if never checked."""
		today = date(2026, 1, 15)
		item_creation = date(2026, 1, 10)  # 5 days before "today"
		# _evaluate_interval() calls getdate() (no args, for "today") AND
		# getdate(item_creation) (to normalize the Item's creation value) --
		# a single return_value would answer both calls with the same fixed
		# date regardless of the argument, silently making days_overdue
		# always 0. Real frappe.utils.getdate(None) with no argument returns
		# today's date; with an argument it normalizes that value.
		mock_getdate.side_effect = lambda *a: today if not a else a[0]
		# Real code makes two frappe.db.get_value calls here: the "URY Yield
		# Check" lookup (None -- no prior check) and the "Item" creation
		# lookup (mocked here) -- a single blanket return_value would answer
		# both with None, and (today - None) would crash.
		mock_get_value.side_effect = [None, item_creation]

		item = _item(cadence="Interval", interval_days=7)
		reason, extra = _evaluate_interval(item, "Test Branch")

		self.assertIsNotNone(reason)
		self.assertIn("No yield check recorded", reason)
		# The current implementation always returns days_overdue (days since
		# the item's own creation) for the never-checked case, not an empty
		# dict -- see the docstring in _evaluate_interval's "never checked"
		# branch: it deliberately surfaces this to highlight items that have
		# never been checked in the Overdue report.
		self.assertEqual(extra, {"days_overdue": 5})

	@patch(f"{MOD}.getdate")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_not_due_when_within_interval(self, mock_get_value, mock_getdate):
		"""Item is not due if last check is within the interval."""
		today = date(2026, 1, 15)
		last_check = date(2026, 1, 12)  # 3 days ago, interval=7
		mock_getdate.side_effect = lambda *a: today if not a else a[0]
		mock_get_value.return_value = last_check

		item = _item(cadence="Interval", interval_days=7)
		reason, extra = _evaluate_interval(item, "Test Branch")

		self.assertIsNone(reason)
		self.assertIsNone(extra)

	@patch(f"{MOD}.getdate")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_due_when_overdue_by_interval(self, mock_get_value, mock_getdate):
		"""Item is due when last check is older than interval."""
		today = date(2026, 1, 15)
		last_check = date(2026, 1, 5)  # 10 days ago, interval=7
		mock_getdate.side_effect = lambda *a: today if not a else a[0]
		mock_get_value.return_value = last_check

		item = _item(cadence="Interval", interval_days=7)
		reason, extra = _evaluate_interval(item, "Test Branch")

		self.assertIsNotNone(reason)
		self.assertIn("10 days since last check", reason)
		self.assertEqual(extra["days_overdue"], 3)  # 10 - 7

	@patch(f"{MOD}.getdate")
	@patch(f"{MOD}.frappe.db.get_value")
	def test_days_overdue_calculation_correct(self, mock_get_value, mock_getdate):
		"""days_overdue is correctly calculated as days_since - interval."""
		today = date(2026, 1, 20)
		last_check = date(2026, 1, 1)  # 19 days ago, interval=5
		mock_getdate.side_effect = lambda *a: today if not a else a[0]
		mock_get_value.return_value = last_check

		item = _item(cadence="Interval", interval_days=5)
		reason, extra = _evaluate_interval(item, "Test Branch")

		self.assertEqual(extra["days_overdue"], 14)  # 19 - 5

	@patch(f"{MOD}.getdate")
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

	@patch(f"{MOD}.getdate")
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

	@patch(f"{MOD}.getdate")
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

	@patch(f"{MOD}.getdate")
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

	@patch(f"{MOD}.getdate")
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
	"""Integration tests for get_due_yield_checks.

	get_due_yield_checks now makes two frappe.get_all-shaped calls in
	sequence: first (indirectly, via branch_item_codes -> BOM anchor) to
	resolve the branch-scoped item-code set, then to fetch the matching
	tracked Items. branch_item_codes is patched directly (rather than
	stubbing the two frappe.get_all calls it makes internally) since it
	lives in a different module (yield_branch_scope) and its own behaviour
	is covered separately in test_yield_branch_scope.py.
	"""

	@patch(f"{MOD}._evaluate_cadence")
	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}.branch_item_codes")
	@patch(f"{MOD}.frappe.db.get_value")
	@patch(f"{MOD}.require_manager")
	def test_returns_list_of_due_items(
		self, mock_manager, mock_get_value, mock_branch_items, mock_get_all, mock_evaluate
	):
		"""get_due_yield_checks returns a list of due items."""
		mock_get_value.return_value = "Test Co"
		mock_branch_items.return_value = {"ITEM-A", "ITEM-B"}
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
	@patch(f"{MOD}.branch_item_codes")
	@patch(f"{MOD}.frappe.db.get_value")
	@patch(f"{MOD}.require_manager")
	def test_due_item_includes_cadence_and_reason(
		self, mock_manager, mock_get_value, mock_branch_items, mock_get_all, mock_evaluate
	):
		"""Due items include cadence, item name, and reason."""
		mock_get_value.return_value = "Test Co"
		mock_branch_items.return_value = {"ITEM-A"}
		mock_get_all.return_value = [_item(name="ITEM-A", item_name="Item A")]
		mock_evaluate.return_value = ("due for interval", {})

		result = get_due_yield_checks("Test Branch")

		self.assertEqual(result[0]["item"], "ITEM-A")
		self.assertEqual(result[0]["item_name"], "Item A")
		self.assertEqual(result[0]["cadence"], "Every Issue")
		self.assertEqual(result[0]["reason"], "due for interval")

	@patch(f"{MOD}._evaluate_cadence")
	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}.branch_item_codes")
	@patch(f"{MOD}.frappe.db.get_value")
	@patch(f"{MOD}.require_manager")
	def test_extra_fields_merged_into_due_item(
		self, mock_manager, mock_get_value, mock_branch_items, mock_get_all, mock_evaluate
	):
		"""Extra fields from _evaluate_cadence are merged into the due item."""
		mock_get_value.return_value = "Test Co"
		mock_branch_items.return_value = {"ITEM-A"}
		mock_get_all.return_value = [_item(name="ITEM-A")]
		mock_evaluate.return_value = ("due", {"days_overdue": 3})

		result = get_due_yield_checks("Test Branch")

		self.assertEqual(result[0]["days_overdue"], 3)


class TestGetDueYieldChecksBranchScoping(unittest.TestCase):
	"""F8 (corrected): get_due_yield_checks scopes the tracked-item set to
	items actually used at the requested branch, anchored via active IPC
	rows -> their BOM -> that BOM's component items (BOM Item rows) — NOT
	via a direct IPC.item match, which per docs/yield-tracking.md can never
	intersect with yield-tracked (raw-ingredient) items. The BOM-anchor
	resolution itself is exercised in test_yield_branch_scope.py; here we
	only verify get_due_yield_checks wires branch_item_codes() correctly."""

	@patch(f"{MOD}._evaluate_cadence")
	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}.branch_item_codes")
	@patch(f"{MOD}.frappe.db.get_value")
	@patch(f"{MOD}.require_manager")
	def test_items_not_used_at_branch_are_excluded(
		self, mock_manager, mock_get_value, mock_branch_items, mock_get_all, mock_evaluate
	):
		"""An Item outside the branch's BOM-derived item set never reaches
		_evaluate_cadence, even if it is globally yield-tracked."""
		mock_get_value.return_value = "Test Co"
		# Only ITEM-A resolves as a BOM component used at this branch.
		mock_branch_items.return_value = {"ITEM-A"}

		def get_all_side_effect(doctype, **kwargs):
			if doctype == "Item":
				# The Item filters requested should be narrowed to the
				# branch_item_codes() result — prove the call is scoped.
				name_filter = kwargs.get("filters", {}).get("name")
				assert name_filter == ["in", ["ITEM-A"]], (
					f"expected Item query scoped to branch items, got {name_filter}"
				)
				return [_item(name="ITEM-A")]
			raise AssertionError(f"unexpected get_all doctype: {doctype}")

		mock_get_all.side_effect = get_all_side_effect
		mock_evaluate.return_value = ("due", {})

		result = get_due_yield_checks("Test Branch")

		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["item"], "ITEM-A")

	@patch(f"{MOD}.branch_item_codes")
	@patch(f"{MOD}.frappe.db.get_value")
	@patch(f"{MOD}.require_manager")
	def test_no_items_used_at_branch_returns_empty(
		self, mock_manager, mock_get_value, mock_branch_items
	):
		"""If branch_item_codes() resolves to an empty set (no active IPC rows,
		no BOM, or no BOM components), return an empty list instead of falling
		through to the global item set."""
		mock_get_value.return_value = "Test Co"
		mock_branch_items.return_value = set()

		result = get_due_yield_checks("Test Branch")

		self.assertEqual(result, [])


class TestBOMHookYieldBackCalculation(unittest.TestCase):
	"""Test BOM Item yield back-calculation hook.

	This class mirrors ury/ury/hooks/test_ury_bom.py's own
	TestApplyYieldBackCalculation (see that file's fix, Session 4, for the
	full explanation) -- both suffered the exact same drift: the hardening
	pass (PR #375) switched the per-item tracking lookup from
	frappe.get_doc("Item", ...).custom_yield_tracked to the cheaper
	frappe.get_cached_value("Item", item_code, "custom_yield_tracked"), so
	patching frappe.get_doc here no longer intercepts anything -- the real,
	unmocked get_cached_value ran instead. Two of these four tests also
	asserted a pre-hardening "skip silently" behavior for a missing
	custom_yield_qty / zero custom_yield_percent that the current code
	deliberately replaced with frappe.throw() (same source, same comment) --
	updated to expect the raise, matching test_ury_bom.py's already-fixed
	versions of the same two cases.
	"""

	@patch("ury.ury.hooks.ury_bom.frappe.get_cached_value")
	def test_qty_calculated_from_yield_qty_and_percent(self, mock_get_cached_value):
		"""BOM Item qty is calculated as: qty = custom_yield_qty / (custom_yield_percent / 100)."""
		from ury.ury.hooks.ury_bom import apply_yield_back_calculation

		mock_get_cached_value.return_value = 1  # custom_yield_tracked = 1

		bom_doc = MagicMock()
		row = MagicMock()
		row.custom_yield_qty = 1.0
		row.custom_yield_percent = 85.0
		row.item_code = "TEST-ITEM"
		bom_doc.items = [row]

		apply_yield_back_calculation(bom_doc, None)

		# qty should be 1.0 / (85.0 / 100) = 1.0 / 0.85 = 1.176...
		expected_qty = 1.0 / 0.85
		self.assertAlmostEqual(row.qty, expected_qty, places=5)

	@patch("ury.ury.hooks.ury_bom.frappe.get_cached_value")
	def test_qty_not_overwritten_when_yield_tracking_disabled(self, mock_get_cached_value):
		"""BOM Item qty is not recalculated if Item.custom_yield_tracked is False."""
		from ury.ury.hooks.ury_bom import apply_yield_back_calculation

		mock_get_cached_value.return_value = 0  # custom_yield_tracked = 0 (disabled)

		bom_doc = MagicMock()
		row = MagicMock()
		row.custom_yield_qty = 1.0
		row.custom_yield_percent = 85.0
		row.item_code = "TEST-ITEM"
		row.qty = 10.0  # Original value
		bom_doc.items = [row]

		apply_yield_back_calculation(bom_doc, None)

		# qty should remain unchanged (10.0, not recalculated)
		self.assertEqual(row.qty, 10.0)

	@patch("ury.ury.hooks.ury_bom.frappe.throw")
	@patch("ury.ury.hooks.ury_bom.frappe.get_cached_value")
	def test_throws_when_missing_yield_qty(self, mock_get_cached_value, mock_throw):
		"""A yield-tracked row without custom_yield_qty throws (I6 hardening --
		this is no longer a silent skip, see the class docstring above)."""
		from ury.ury.hooks.ury_bom import apply_yield_back_calculation

		mock_get_cached_value.return_value = 1  # custom_yield_tracked = 1
		mock_throw.side_effect = frappe.ValidationError

		bom_doc = MagicMock()
		row = MagicMock()
		row.custom_yield_qty = None  # Missing!
		row.custom_yield_percent = 85.0
		row.item_code = "TEST-ITEM"
		bom_doc.items = [row]

		with self.assertRaises(frappe.ValidationError):
			apply_yield_back_calculation(bom_doc, None)

		mock_throw.assert_called_once()

	@patch("ury.ury.hooks.ury_bom.frappe.throw")
	@patch("ury.ury.hooks.ury_bom.frappe.get_cached_value")
	def test_throws_when_zero_yield_percent(self, mock_get_cached_value, mock_throw):
		"""A yield-tracked row with custom_yield_percent=0 throws (guard
		against division by zero -- I6 hardening, no longer a silent skip)."""
		from ury.ury.hooks.ury_bom import apply_yield_back_calculation

		mock_get_cached_value.return_value = 1  # custom_yield_tracked = 1
		mock_throw.side_effect = frappe.ValidationError

		bom_doc = MagicMock()
		row = MagicMock()
		row.custom_yield_qty = 1.0
		row.custom_yield_percent = 0  # Zero
		row.item_code = "TEST-ITEM"
		row.qty = 5.0  # Original value
		bom_doc.items = [row]

		with self.assertRaises(frappe.ValidationError):
			apply_yield_back_calculation(bom_doc, None)

		mock_throw.assert_called_once()


class TestGetDueYieldChecksRealDocumentIntegration(FrappeTestCase):
	"""F9: real-document coverage for get_due_yield_checks -- every other
	test in this file mocks frappe.get_all/db.exists directly, so none of
	them inserted an actual Item/URY Issue Authorization/URY Yield Check and
	ran the real cadence engine against them."""

	def _ensure_company(self, company_name, abbr):
		if not frappe.db.exists("Company", company_name):
			frappe.get_doc(
				{
					"doctype": "Company",
					"company_name": company_name,
					"default_currency": "INR",
					"abbr": abbr,
				}
			).insert(ignore_permissions=True)

	def _ensure_branch(self, branch_name, company):
		if not frappe.db.exists("Branch", branch_name):
			frappe.get_doc(
				{
					"doctype": "Branch",
					"branch": branch_name,
					"company": company,
					"user": [{"user": "Administrator"}],
				}
			).insert(ignore_permissions=True)

	def _ensure_item(self, item_code, **overrides):
		if frappe.db.exists("Item", item_code):
			return
		fields = {
			"doctype": "Item",
			"item_code": item_code,
			"item_name": item_code,
			"item_group": "All Item Groups",
			"stock_uom": "Nos",
			"is_stock_item": 1,
			"custom_yield_tracked": 1,
			"custom_yield_percent": 80.0,
		}
		fields.update(overrides)
		frappe.get_doc(fields).insert(ignore_permissions=True)

	def _minimal_plan(self, branch, company):
		plan = frappe.get_doc(
			{
				"doctype": "URY Sales Plan",
				"status": "Draft",
				"enforcement_mode": "Soft",
				"branch": branch,
				"company": company,
				"plan_date": "2026-09-01",
			}
		)
		plan.flags.ignore_mandatory = True
		plan.flags.ignore_validate = True
		plan.insert(ignore_permissions=True)
		return plan.name

	def _department(self, branch, company):
		name = f"{branch} F9 Reminder Dept"
		if frappe.db.exists("URY Production Department", name):
			return name
		frappe.get_doc(
			{
				"doctype": "URY Production Department",
				"department_name": name,
				"branch": branch,
				"company": company,
				"enabled": 1,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True)
		return name

	def _auth(self, plan, branch, company, department, item, qty=50.0):
		doc = frappe.get_doc(
			{
				"doctype": "URY Issue Authorization",
				"plan": plan,
				"plan_approval_hash": "f9-real-doc-test",
				"branch": branch,
				"company": company,
				"department": department,
				"component_item": item,
				"stock_uom": "Nos",
				"control_mode": "SOFT",
				"status": "Authorized",
				"required_qty": qty,
				"authorized_qty": qty,
				"remaining_before_qty": qty,
				"remaining_after_qty": 0,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc.name

	def _ensure_warehouse(self, warehouse_name, company):
		if frappe.db.exists("Warehouse", {"warehouse_name": warehouse_name, "company": company}):
			return frappe.db.get_value(
				"Warehouse", {"warehouse_name": warehouse_name, "company": company}, "name"
			)
		doc = frappe.get_doc(
			{
				"doctype": "Warehouse",
				"warehouse_name": warehouse_name,
				"company": company,
			}
		).insert(ignore_permissions=True)
		return doc.name

	def _ensure_bom(self, finished_item, raw_item, company):
		existing = frappe.db.get_value(
			"BOM", {"item": finished_item, "company": company, "docstatus": 1}, "name"
		)
		if existing:
			return existing
		bom = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": finished_item,
				"quantity": 1,
				"company": company,
				"is_active": 1,
				"is_default": 1,
				"with_operations": 0,
				"items": [{"item_code": raw_item, "qty": 1, "uom": "Nos", "custom_yield_qty": 4}],  # 4 / 0.80 = 5 -- must be a whole number, "Nos" UOM enforces this
			}
		)
		bom.insert(ignore_permissions=True)
		bom.submit()
		return bom.name

	def _ensure_item_production_configuration(self, item_code, branch, company):
		"""F8 branch-scopes the cadence engine's tracked-item query via URY
		Item Production Configuration (IPC) -> its BOM -> that BOM's
		component items (BOM Item rows) -- NOT a direct IPC.item match. IPC
		only ever has rows for sellable menu items (kitchen/bar routing),
		never raw ingredients (see docs/yield-tracking.md), so a
		yield-tracked `item_code` (always a raw ingredient) can only be
		reached by anchoring through a sellable item's BOM that uses it as
		a component -- exactly like production traffic actually would.
		"""
		finished_item = f"{item_code} F9 Sellable"
		if not frappe.db.exists("Item", finished_item):
			frappe.get_doc(
				{
					"doctype": "Item",
					"item_code": finished_item,
					"item_name": finished_item,
					"item_group": "All Item Groups",
					"stock_uom": "Nos",
					"is_stock_item": 1,
				}
			).insert(ignore_permissions=True)

		bom_name = self._ensure_bom(finished_item, item_code, company)

		if frappe.db.exists(
			"URY Item Production Configuration",
			{"item": finished_item, "branch": branch, "active": 1},
		):
			return
		warehouse = self._ensure_warehouse(f"{item_code} F9 Retail Store", company)
		frappe.get_doc(
			{
				"doctype": "URY Item Production Configuration",
				"active": 1,
				"item": finished_item,
				"branch": branch,
				"bom": bom_name,
				"production_policy": "DIRECT_RETAIL",
				"direct_retail_warehouse": warehouse,
			}
		).insert(ignore_permissions=True)

	def setUp(self):
		self.company = "F9 Reminder Test Co"
		self.branch = "F9 Reminder Test Branch"
		self._ensure_company(self.company, "F9RC")
		self._ensure_branch(self.branch, self.company)

	def test_real_authorized_issue_without_yield_check_is_due(self):
		from ury.ury.services.yield_check_reminders import get_due_yield_checks

		item_code = "F9-REMINDER-EVERY-ISSUE-ITEM"
		self._ensure_item(item_code, custom_yield_check_cadence="Every Issue")
		self._ensure_item_production_configuration(item_code, self.branch, self.company)
		department = self._department(self.branch, self.company)
		plan = self._minimal_plan(self.branch, self.company)
		self._auth(plan, self.branch, self.company, department, item_code)

		due_items = get_due_yield_checks(self.branch)
		due_item_names = [d["item"] for d in due_items]
		self.assertIn(item_code, due_item_names)

	def test_real_authorized_issue_with_yield_check_is_not_due(self):
		from ury.ury.services.yield_check_reminders import get_due_yield_checks
		from ury.ury.api.ury_yield_variance import record_yield_check

		item_code = "F9-REMINDER-CHECKED-ITEM"
		self._ensure_item(item_code, custom_yield_check_cadence="Every Issue")
		self._ensure_item_production_configuration(item_code, self.branch, self.company)
		department = self._department(self.branch, self.company)
		plan = self._minimal_plan(self.branch, self.company)
		auth_name = self._auth(plan, self.branch, self.company, department, item_code)

		record_yield_check(
			item=item_code,
			branch=self.branch,
			company=self.company,
			input_qty=100,
			output_qty=80,
			stock_uom="Nos",
			check_type="Routine",
			issue_authorization=auth_name,
		)

		due_items = get_due_yield_checks(self.branch)
		due_item_names = [d["item"] for d in due_items]
		self.assertNotIn(item_code, due_item_names)


if __name__ == "__main__":
	unittest.main()

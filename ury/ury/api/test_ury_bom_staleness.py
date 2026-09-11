# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching the test_ury_yield_variance.py
# convention) rather than a live bench -- no bench/Docker is available in this task's
# worktree. These were reviewed by hand (traced call-by-call against ury_bom_staleness.py)
# rather than executed against a real site; see the task report for that walkthrough.
# Static validation performed: python3 -m py_compile and git diff --check.

import unittest
from unittest.mock import patch, MagicMock

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_bom_staleness import get_stale_draft_boms


MOD = "ury.ury.api.ury_bom_staleness"


class TestGetStaleDraftBoms(FrappeTestCase):
	"""Test C1 part 1: get_stale_draft_boms detects draft BOMs with stale yield%."""

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_returns_empty_list_when_no_draft_boms(self, mock_get_all, mock_require_manager):
		"""Returns empty list when no draft BOMs exist."""
		mock_get_all.side_effect = [
			[],  # No draft BOMs
		]

		result = get_stale_draft_boms("Test Co")

		self.assertEqual(result, [])

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_calls_require_manager(self, mock_get_all, mock_require_manager):
		"""Calls require_manager() to gate access."""
		mock_get_all.side_effect = [[], [], []]

		get_stale_draft_boms("Test Co")

		mock_require_manager.assert_called_once()

	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_calls_require_scope(self, mock_get_all, mock_require_manager, mock_require_scope):
		"""Calls _require_scope(company) to validate company parameter."""
		mock_get_all.side_effect = [[], [], []]

		get_stale_draft_boms("Test Co")

		mock_require_scope.assert_called_once_with("Test Co")

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_filters_draft_boms_by_docstatus_0(self, mock_get_all, mock_require_manager):
		"""Query filters for docstatus=0 (draft) only."""
		mock_get_all.side_effect = [[], [], []]

		get_stale_draft_boms("Test Co")

		# First call: fetch draft BOMs
		call_kwargs = mock_get_all.call_args_list[0][1]
		self.assertEqual(call_kwargs["filters"]["docstatus"], 0)

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_filters_draft_boms_by_company(self, mock_get_all, mock_require_manager):
		"""Query filters for specific company."""
		mock_get_all.side_effect = [[], [], []]

		get_stale_draft_boms("Test Co")

		call_kwargs = mock_get_all.call_args_list[0][1]
		self.assertEqual(call_kwargs["filters"]["company"], "Test Co")

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_detects_stale_component_with_different_yield_percent(self, mock_get_all, mock_require_manager):
		"""Component row stale when stored yield% differs from Item's current value."""
		draft_bom = frappe._dict({
			"name": "BOM-001",
			"bom_item": "BURGER",
			"company": "Test Co",
		})
		bom_row = frappe._dict({
			"parent": "BOM-001",
			"idx": 1,
			"item_code": "BUN",
			"custom_yield_percent": 80.0,  # Stored value
		})
		item = frappe._dict({
			"name": "BUN",
			"custom_yield_tracked": 1,
			"custom_yield_percent": 85.0,  # Current value (different!)
		})

		mock_get_all.side_effect = [
			[draft_bom],  # Draft BOMs
			[bom_row],    # BOM rows
			[item],       # Items
		]

		result = get_stale_draft_boms("Test Co")

		# Should report this as stale
		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["bom"], "BOM-001")
		self.assertEqual(result[0]["component_item"], "BUN")
		self.assertEqual(result[0]["stored_yield_percent"], 80.0)
		self.assertEqual(result[0]["current_yield_percent"], 85.0)
		self.assertEqual(result[0]["diff"], 5.0)

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_does_not_report_matching_yield_percent(self, mock_get_all, mock_require_manager):
		"""Component NOT stale when stored yield% matches Item's current value."""
		draft_bom = frappe._dict({
			"name": "BOM-001",
			"bom_item": "BURGER",
			"company": "Test Co",
		})
		bom_row = frappe._dict({
			"parent": "BOM-001",
			"idx": 1,
			"item_code": "BUN",
			"custom_yield_percent": 85.0,  # Stored value
		})
		item = frappe._dict({
			"name": "BUN",
			"custom_yield_tracked": 1,
			"custom_yield_percent": 85.0,  # Current value (same!)
		})

		mock_get_all.side_effect = [
			[draft_bom],
			[bom_row],
			[item],
		]

		result = get_stale_draft_boms("Test Co")

		# Should not report as stale
		self.assertEqual(result, [])

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_ignores_non_tracked_items(self, mock_get_all, mock_require_manager):
		"""Non-yield-tracked components never reported as stale."""
		draft_bom = frappe._dict({
			"name": "BOM-001",
			"bom_item": "BURGER",
			"company": "Test Co",
		})
		bom_row = frappe._dict({
			"parent": "BOM-001",
			"idx": 1,
			"item_code": "NON-TRACKED",
			"custom_yield_percent": 80.0,
		})
		item = frappe._dict({
			"name": "NON-TRACKED",
			"custom_yield_tracked": 0,  # Not tracked!
			"custom_yield_percent": 95.0,  # Different, but ignored
		})

		mock_get_all.side_effect = [
			[draft_bom],
			[bom_row],
			[item],
		]

		result = get_stale_draft_boms("Test Co")

		# Should not report non-tracked items
		self.assertEqual(result, [])

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_ignores_submitted_boms(self, mock_get_all, mock_require_manager):
		"""Submitted (docstatus=1) BOMs excluded from check."""
		# Get stale draft boms only fetches docstatus=0, so submitted are naturally excluded
		draft_bom = frappe._dict({
			"name": "BOM-001",
			"bom_item": "BURGER",
			"company": "Test Co",
		})

		mock_get_all.side_effect = [
			[draft_bom],  # Only draft returned
			[],           # No rows
			[],           # No items
		]

		result = get_stale_draft_boms("Test Co")

		# Verify docstatus=0 filter was applied
		call_kwargs = mock_get_all.call_args_list[0][1]
		self.assertEqual(call_kwargs["filters"]["docstatus"], 0)

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_float_tolerance_skips_small_differences(self, mock_get_all, mock_require_manager):
		"""Differences <= FLOAT_TOLERANCE (0.001) are not reported as stale."""
		draft_bom = frappe._dict({
			"name": "BOM-001",
			"bom_item": "BURGER",
			"company": "Test Co",
		})
		bom_row = frappe._dict({
			"parent": "BOM-001",
			"idx": 1,
			"item_code": "BUN",
			"custom_yield_percent": 85.0,
		})
		item = frappe._dict({
			"name": "BUN",
			"custom_yield_tracked": 1,
			"custom_yield_percent": 85.0005,  # Difference of 0.0005 (within tolerance)
		})

		mock_get_all.side_effect = [
			[draft_bom],
			[bom_row],
			[item],
		]

		result = get_stale_draft_boms("Test Co")

		# Should not report (difference within tolerance)
		self.assertEqual(result, [])

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_reports_stale_when_difference_exceeds_tolerance(self, mock_get_all, mock_require_manager):
		"""Differences > FLOAT_TOLERANCE (0.001) are reported."""
		draft_bom = frappe._dict({
			"name": "BOM-001",
			"bom_item": "BURGER",
			"company": "Test Co",
		})
		bom_row = frappe._dict({
			"parent": "BOM-001",
			"idx": 1,
			"item_code": "BUN",
			"custom_yield_percent": 85.0,
		})
		item = frappe._dict({
			"name": "BUN",
			"custom_yield_tracked": 1,
			"custom_yield_percent": 85.002,  # Difference of 0.002 (exceeds tolerance)
		})

		mock_get_all.side_effect = [
			[draft_bom],
			[bom_row],
			[item],
		]

		result = get_stale_draft_boms("Test Co")

		# Should report as stale
		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["bom"], "BOM-001")

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_handles_missing_item_yield_percent(self, mock_get_all, mock_require_manager):
		"""Item with missing custom_yield_percent treated as 0.0."""
		draft_bom = frappe._dict({
			"name": "BOM-001",
			"bom_item": "BURGER",
			"company": "Test Co",
		})
		bom_row = frappe._dict({
			"parent": "BOM-001",
			"idx": 1,
			"item_code": "BUN",
			"custom_yield_percent": 85.0,
		})
		item = frappe._dict({
			"name": "BUN",
			"custom_yield_tracked": 1,
			"custom_yield_percent": None,  # Missing
		})

		mock_get_all.side_effect = [
			[draft_bom],
			[bom_row],
			[item],
		]

		result = get_stale_draft_boms("Test Co")

		# Should report as stale (85.0 vs 0.0)
		self.assertEqual(len(result), 1)
		self.assertEqual(result[0]["current_yield_percent"], 0.0)

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_one_stale_row_per_result_entry(self, mock_get_all, mock_require_manager):
		"""BOM with multiple stale rows appears multiple times (one per row)."""
		draft_bom = frappe._dict({
			"name": "BOM-001",
			"bom_item": "BURGER",
			"company": "Test Co",
		})
		bom_row1 = frappe._dict({
			"parent": "BOM-001",
			"idx": 1,
			"item_code": "BUN",
			"custom_yield_percent": 80.0,
		})
		bom_row2 = frappe._dict({
			"parent": "BOM-001",
			"idx": 2,
			"item_code": "PATTY",
			"custom_yield_percent": 75.0,
		})
		item1 = frappe._dict({
			"name": "BUN",
			"custom_yield_tracked": 1,
			"custom_yield_percent": 90.0,  # Stale
		})
		item2 = frappe._dict({
			"name": "PATTY",
			"custom_yield_tracked": 1,
			"custom_yield_percent": 85.0,  # Stale
		})

		mock_get_all.side_effect = [
			[draft_bom],
			[bom_row1, bom_row2],
			[item1, item2],
		]

		result = get_stale_draft_boms("Test Co")

		# Should report both rows
		self.assertEqual(len(result), 2)
		self.assertEqual(result[0]["component_item"], "BUN")
		self.assertEqual(result[1]["component_item"], "PATTY")

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}.frappe.get_all")
	def test_result_includes_all_required_fields(self, mock_get_all, mock_require_manager):
		"""Result dict includes all required fields."""
		draft_bom = frappe._dict({
			"name": "BOM-001",
			"bom_item": "BURGER",
			"company": "Test Co",
		})
		bom_row = frappe._dict({
			"parent": "BOM-001",
			"idx": 1,
			"item_code": "BUN",
			"custom_yield_percent": 80.0,
		})
		item = frappe._dict({
			"name": "BUN",
			"custom_yield_tracked": 1,
			"custom_yield_percent": 85.0,
		})

		mock_get_all.side_effect = [
			[draft_bom],
			[bom_row],
			[item],
		]

		result = get_stale_draft_boms("Test Co")

		self.assertEqual(len(result), 1)
		entry = result[0]
		self.assertIn("bom", entry)
		self.assertIn("bom_item", entry)
		self.assertIn("company", entry)
		self.assertIn("component_item", entry)
		self.assertIn("row_idx", entry)
		self.assertIn("stored_yield_percent", entry)
		self.assertIn("current_yield_percent", entry)
		self.assertIn("diff", entry)


if __name__ == "__main__":
	unittest.main()

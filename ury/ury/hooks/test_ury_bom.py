# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching the test_ury_yield_variance.py
# convention) rather than a live bench -- no bench/Docker is available in this task's
# worktree. These were reviewed by hand (traced call-by-call against ury_bom.py)
# rather than executed against a real site; see the task report for that walkthrough.
# Static validation performed: python3 -m py_compile and git diff --check.

import unittest
from unittest.mock import patch, MagicMock
import hashlib

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.hooks.ury_bom import apply_yield_back_calculation, set_bom_revision


MODULE = "ury.ury.hooks.ury_bom"


class TestApplyYieldBackCalculation(FrappeTestCase):
	"""Test A2: apply_yield_back_calculation distinguishes tracked from non-tracked items.

	The hardening pass (Track-Item C1, PR #375) switched the item-tracking lookup
	from frappe.get_doc("Item", ...).custom_yield_tracked to the cheaper
	frappe.get_cached_value("Item", item_code, "custom_yield_tracked") -- a single
	scalar, not a doc. These tests originally patched frappe.get_doc (the pre-refactor
	call), so the real frappe.get_cached_value ran unmocked against whatever the site
	actually had for these made-up item codes -- patched to the correct target below.
	frappe.throw is also now given a real side_effect that raises, matching production
	behavior (an unconfigured Mock for frappe.throw doesn't stop execution, so the two
	"throws" tests previously fell through into the division below and failed with
	ZeroDivisionError/TypeError instead of ever reaching their own assertions).
	"""

	@patch(f"{MODULE}.frappe.get_cached_value")
	@patch(f"{MODULE}.set_bom_revision")
	def test_skips_non_tracked_items(self, mock_set_revision, mock_get_cached_value):
		"""Non-tracked items skip yield validation (no custom_yield_qty required)."""
		# Create BOM row
		row = MagicMock()
		row.item_code = "NON-TRACKED-ITEM"
		row.custom_yield_qty = None  # Not set, but should not throw
		row.custom_yield_percent = 0
		row.idx = 1
		row.qty = 10  # Manually set, unchanged

		mock_get_cached_value.return_value = 0  # custom_yield_tracked = 0

		# Create BOM doc
		doc = MagicMock()
		doc.items = [row]
		doc.get.return_value = doc.items

		apply_yield_back_calculation(doc, "before_validate")

		# Item should still have its original qty (no back-calculation)
		self.assertEqual(row.qty, 10)
		mock_set_revision.assert_called_once_with(doc)

	@patch(f"{MODULE}.frappe.get_cached_value")
	@patch(f"{MODULE}.frappe.throw")
	@patch(f"{MODULE}.set_bom_revision")
	def test_throws_when_tracked_item_missing_both_qty_and_yield_qty(self, mock_set_revision, mock_throw, mock_get_cached_value):
		"""Tracked item with BOTH custom_yield_qty and qty missing still throws.

		ury-erp/ury#464 (commit bdc5d9625e) added a fallback: when
		custom_yield_qty is missing but qty IS set, custom_yield_qty is now
		derived as qty * percent/100 instead of throwing (see
		test_derives_custom_yield_qty_from_qty_when_missing below). This test
		covers the remaining case the fallback does not reach -- qty is also
		missing, so there is nothing to derive from -- which still throws.
		Behavior change pending owner confirmation.
		"""
		# Create BOM row
		row = MagicMock()
		row.item_code = "TRACKED-ITEM"
		row.custom_yield_qty = None  # Missing!
		row.custom_yield_percent = 85
		row.idx = 1
		row.qty = None  # Also missing -- nothing to derive custom_yield_qty from

		mock_get_cached_value.return_value = 1  # custom_yield_tracked = 1
		mock_throw.side_effect = frappe.ValidationError

		# Create BOM doc
		doc = MagicMock()
		doc.items = [row]
		doc.get.return_value = doc.items

		with self.assertRaises(frappe.ValidationError):
			apply_yield_back_calculation(doc, "before_validate")

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("custom_yield_qty", str(call_args[0]))

	@patch(f"{MODULE}.frappe.get_cached_value")
	@patch(f"{MODULE}.set_bom_revision")
	def test_derives_custom_yield_qty_from_qty_when_missing(self, mock_set_revision, mock_get_cached_value):
		"""ury-erp/ury#464 (commit bdc5d9625e): when custom_yield_qty is
		missing but qty is set, custom_yield_qty is now derived as
		qty * (percent / 100) instead of throwing. Behavior change pending
		owner confirmation.
		"""
		row = MagicMock()
		row.item_code = "TRACKED-ITEM"
		row.custom_yield_qty = None  # Missing, but qty is set below
		row.custom_yield_percent = 85
		row.idx = 1
		row.qty = 100  # Present -- used to derive custom_yield_qty

		mock_get_cached_value.return_value = 1  # custom_yield_tracked = 1

		doc = MagicMock()
		doc.items = [row]
		doc.get.return_value = doc.items

		apply_yield_back_calculation(doc, "before_validate")

		# Derived: custom_yield_qty = qty * (percent / 100) = 100 * 0.85 = 85
		self.assertAlmostEqual(row.custom_yield_qty, 85.0, places=5)
		# Then qty is back-calculated from the derived custom_yield_qty:
		# qty = custom_yield_qty / (percent / 100) = 85 / 0.85 = 100 (round-trips)
		self.assertAlmostEqual(row.qty, 100.0, places=5)
		mock_set_revision.assert_called_once_with(doc)

	@patch(f"{MODULE}.frappe.get_cached_value")
	@patch(f"{MODULE}.frappe.throw")
	@patch(f"{MODULE}.set_bom_revision")
	def test_throws_when_tracked_item_has_zero_yield_percent(self, mock_set_revision, mock_throw, mock_get_cached_value):
		"""Tracked item with custom_yield_percent=0 throws ValidationError."""
		# Create BOM row
		row = MagicMock()
		row.item_code = "TRACKED-ITEM"
		row.custom_yield_qty = 100
		row.custom_yield_percent = 0  # Invalid!
		row.idx = 1

		mock_get_cached_value.return_value = 1  # custom_yield_tracked = 1
		mock_throw.side_effect = frappe.ValidationError

		# Create BOM doc
		doc = MagicMock()
		doc.items = [row]
		doc.get.return_value = doc.items

		with self.assertRaises(frappe.ValidationError):
			apply_yield_back_calculation(doc, "before_validate")

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("Yield percent", str(call_args[0]))

	@patch(f"{MODULE}.frappe.get_cached_value")
	@patch(f"{MODULE}.set_bom_revision")
	def test_back_calculates_qty_correctly(self, mock_set_revision, mock_get_cached_value):
		"""Tracked item: qty = custom_yield_qty / (custom_yield_percent / 100)."""
		# Create BOM row
		row = MagicMock()
		row.item_code = "TRACKED-ITEM"
		row.custom_yield_qty = 85  # Want 85 units output
		row.custom_yield_percent = 85  # 85% yield
		row.idx = 1
		row.qty = None  # To be calculated

		mock_get_cached_value.return_value = 1  # custom_yield_tracked = 1

		# Create BOM doc
		doc = MagicMock()
		doc.items = [row]
		doc.get.return_value = doc.items

		apply_yield_back_calculation(doc, "before_validate")

		# Expected: 85 / (85/100) = 85 / 0.85 = 100
		self.assertAlmostEqual(row.qty, 100.0, places=5)
		mock_set_revision.assert_called_once_with(doc)

	@patch(f"{MODULE}.frappe.get_cached_value")
	@patch(f"{MODULE}.set_bom_revision")
	def test_back_calculates_with_different_yield_percentages(self, mock_set_revision, mock_get_cached_value):
		"""Qty calculation works correctly with various yield percentages."""
		# Create BOM row
		row = MagicMock()
		row.item_code = "TRACKED-ITEM"
		row.custom_yield_qty = 50  # Want 50 units
		row.custom_yield_percent = 50  # 50% yield
		row.idx = 1
		row.qty = None

		mock_get_cached_value.return_value = 1  # custom_yield_tracked = 1

		# Create BOM doc
		doc = MagicMock()
		doc.items = [row]
		doc.get.return_value = doc.items

		apply_yield_back_calculation(doc, "before_validate")

		# Expected: 50 / (50/100) = 50 / 0.5 = 100
		self.assertAlmostEqual(row.qty, 100.0, places=5)

	@patch(f"{MODULE}.frappe.get_cached_value")
	@patch(f"{MODULE}.set_bom_revision")
	def test_handles_multiple_rows_mixed_tracked_and_non_tracked(self, mock_set_revision, mock_get_cached_value):
		"""Multiple rows: tracked items validated and calculated, non-tracked skipped."""
		# Create multiple rows
		row1 = MagicMock()
		row1.item_code = "TRACKED-1"
		row1.custom_yield_qty = 100
		row1.custom_yield_percent = 80
		row1.idx = 1
		row1.qty = None

		row2 = MagicMock()
		row2.item_code = "NON-TRACKED"
		row2.custom_yield_qty = None  # Not set, should not throw
		row2.custom_yield_percent = 0
		row2.idx = 2
		row2.qty = 50  # Manually set

		# Row order matches doc.items order: row1 (tracked), row2 (not tracked).
		mock_get_cached_value.side_effect = [1, 0]

		# Create BOM doc
		doc = MagicMock()
		doc.items = [row1, row2]
		doc.get.return_value = doc.items

		apply_yield_back_calculation(doc, "before_validate")

		# First row should be back-calculated: 100 / (80/100) = 125
		self.assertAlmostEqual(row1.qty, 125.0, places=5)
		# Second row should remain unchanged
		self.assertEqual(row2.qty, 50)
		mock_set_revision.assert_called_once_with(doc)


class TestSetBomRevision(FrappeTestCase):
	"""Test C1 part 1: set_bom_revision computes stable hash of BOM components.

	The hardening pass (Track-Item C1, PR #375) added `uom` to the hashed vector
	(item_code, qty, uom) to also catch UOM-only changes. Every row below now sets
	`.uom` explicitly to a fixed value -- a MagicMock row left without one exposes
	an auto-generated child Mock whose repr() embeds its own object id, which is
	different per instance and therefore non-deterministic across separate mock rows
	(this broke both "manually compute expected hash" tests below, and
	test_revision_same_when_order_changes, which compares hashes computed from two
	independently-created sets of row mocks).
	"""

	def test_computes_hash_from_item_qty_vector(self):
		"""BOM revision is a hash of sorted (item_code, qty, uom) tuples."""
		# Create BOM rows
		row1 = MagicMock()
		row1.item_code = "ITEM-A"
		row1.qty = 10.0
		row1.uom = "Kg"

		row2 = MagicMock()
		row2.item_code = "ITEM-B"
		row2.qty = 20.0
		row2.uom = "Kg"

		# Create BOM doc
		doc = MagicMock()
		doc.items = [row1, row2]
		doc.get.return_value = doc.items

		set_bom_revision(doc)

		# Manually compute expected hash
		vector = sorted([("ITEM-A", 10.0, "Kg"), ("ITEM-B", 20.0, "Kg")])
		payload = repr(vector).encode("utf-8")
		expected = hashlib.md5(payload).hexdigest()[:16]

		self.assertEqual(doc.custom_bom_revision, expected)

	def test_revision_differs_when_qty_changes(self):
		"""Revision changes when a component's qty changes."""
		# Create first set of rows
		row1a = MagicMock()
		row1a.item_code = "ITEM-A"
		row1a.qty = 10.0
		row1a.uom = "Kg"

		doc_a = MagicMock()
		doc_a.items = [row1a]
		doc_a.get.return_value = doc_a.items

		set_bom_revision(doc_a)
		rev_a = doc_a.custom_bom_revision

		# Create second set with different qty
		row1b = MagicMock()
		row1b.item_code = "ITEM-A"
		row1b.qty = 20.0  # Changed!
		row1b.uom = "Kg"

		doc_b = MagicMock()
		doc_b.items = [row1b]
		doc_b.get.return_value = doc_b.items

		set_bom_revision(doc_b)
		rev_b = doc_b.custom_bom_revision

		self.assertNotEqual(rev_a, rev_b)

	def test_revision_same_when_order_changes(self):
		"""Revision is stable regardless of row order (sorted internally)."""
		# First order: A, B
		row1a = MagicMock()
		row1a.item_code = "ITEM-A"
		row1a.qty = 10.0
		row1a.uom = "Kg"

		row2a = MagicMock()
		row2a.item_code = "ITEM-B"
		row2a.qty = 20.0
		row2a.uom = "Kg"

		doc_a = MagicMock()
		doc_a.items = [row1a, row2a]
		doc_a.get.return_value = doc_a.items

		set_bom_revision(doc_a)
		rev_a = doc_a.custom_bom_revision

		# Second order: B, A (reversed)
		row1b = MagicMock()
		row1b.item_code = "ITEM-B"
		row1b.qty = 20.0
		row1b.uom = "Kg"

		row2b = MagicMock()
		row2b.item_code = "ITEM-A"
		row2b.qty = 10.0
		row2b.uom = "Kg"

		doc_b = MagicMock()
		doc_b.items = [row1b, row2b]
		doc_b.get.return_value = doc_b.items

		set_bom_revision(doc_b)
		rev_b = doc_b.custom_bom_revision

		# Revisions should match (order-independent)
		self.assertEqual(rev_a, rev_b)

	def test_revision_length_is_16_chars(self):
		"""Revision is always 16 hex characters (MD5 first 16 chars)."""
		row = MagicMock()
		row.item_code = "ITEM-A"
		row.qty = 10.0
		row.uom = "Kg"

		doc = MagicMock()
		doc.items = [row]
		doc.get.return_value = doc.items

		set_bom_revision(doc)

		self.assertEqual(len(doc.custom_bom_revision), 16)
		# Verify it's hex
		int(doc.custom_bom_revision, 16)  # Should not raise

	def test_handles_empty_bom(self):
		"""Empty BOM produces a valid (but predictable) revision."""
		doc = MagicMock()
		doc.items = []
		doc.get.return_value = doc.items

		set_bom_revision(doc)

		# Should not crash, should set a revision
		self.assertIsNotNone(doc.custom_bom_revision)
		self.assertEqual(len(doc.custom_bom_revision), 16)

	def test_handles_items_with_none_qty(self):
		"""Items with qty=None are treated as 0."""
		row1 = MagicMock()
		row1.item_code = "ITEM-A"
		row1.qty = None
		row1.uom = "Kg"

		row2 = MagicMock()
		row2.item_code = "ITEM-B"
		row2.qty = 10.0
		row2.uom = "Kg"

		doc = MagicMock()
		doc.items = [row1, row2]
		doc.get.return_value = doc.items

		set_bom_revision(doc)

		# Manually compute expected hash
		vector = sorted([("ITEM-A", 0, "Kg"), ("ITEM-B", 10.0, "Kg")])
		payload = repr(vector).encode("utf-8")
		expected = hashlib.md5(payload).hexdigest()[:16]

		self.assertEqual(doc.custom_bom_revision, expected)

	def test_qty_rounded_to_6_decimals(self):
		"""Quantities are rounded to 6 decimal places for hash consistency."""
		row1 = MagicMock()
		row1.item_code = "ITEM-A"
		row1.qty = 10.0000001  # Should round to 10.0
		row1.uom = "Kg"

		row2_exact = MagicMock()
		row2_exact.item_code = "ITEM-A"
		row2_exact.qty = 10.0
		row2_exact.uom = "Kg"

		doc1 = MagicMock()
		doc1.items = [row1]
		doc1.get.return_value = doc1.items

		doc2 = MagicMock()
		doc2.items = [row2_exact]
		doc2.get.return_value = doc2.items

		set_bom_revision(doc1)
		set_bom_revision(doc2)

		# Both should have same revision due to rounding
		self.assertEqual(doc1.custom_bom_revision, doc2.custom_bom_revision)


class TestApplyYieldBackCalculationRealDocumentIntegration(FrappeTestCase):
	"""F9: real-document coverage for apply_yield_back_calculation /
	set_bom_revision -- every other test in this file drives the hook
	function directly against a MagicMock "doc", so none of them ever
	inserted a real BOM and let frappe's own `before_validate` hook wiring
	(ury/hooks.py: {"BOM": {"before_validate": ...}}) invoke it end to end.
	"""

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
		}
		fields.update(overrides)
		frappe.get_doc(fields).insert(ignore_permissions=True)

	def setUp(self):
		self.company = "F9 BOM Test Co"
		self._ensure_company(self.company, "F9BC")
		self.finished_item = "F9-BOM-FINISHED-ITEM"
		self.raw_item = "F9-BOM-RAW-YIELD-ITEM"
		self._ensure_item(self.finished_item)
		self._ensure_item(self.raw_item, custom_yield_tracked=1, custom_yield_percent=50.0)

	def test_real_bom_insert_back_calculates_qty_and_sets_revision(self):
		"""A real BOM insert against a yield-tracked component runs the real
		before_validate hook: qty is back-calculated from
		custom_yield_qty / (custom_yield_percent / 100), and
		custom_bom_revision is populated (not left blank)."""
		bom = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": self.finished_item,
				"quantity": 1,
				"company": self.company,
				"is_active": 1,
				"is_default": 1,
				"with_operations": 0,
				"items": [
					{
						"item_code": self.raw_item,
						"uom": "Nos",
						"custom_yield_qty": 5,
						"custom_yield_percent": 50,
					}
				],
			}
		)
		bom.insert(ignore_permissions=True)

		self.assertAlmostEqual(bom.items[0].qty, 10.0)
		self.assertTrue(bom.custom_bom_revision)
		self.assertEqual(len(bom.custom_bom_revision), 16)

	def test_real_bom_insert_derives_yield_qty_when_missing_but_qty_set(self):
		"""ury-erp/ury#464 (commit bdc5d9625e): a real BOM insert for a
		yield-tracked component with custom_yield_qty missing but qty set
		no longer fails closed -- custom_yield_qty is derived as
		qty * (percent / 100), and qty is then back-calculated from that
		derived value (round-tripping to the original qty here since the
		derivation and back-calculation are inverses). Behavior change
		pending owner confirmation."""
		bom = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": self.finished_item,
				"quantity": 1,
				"company": self.company,
				"is_active": 1,
				"is_default": 1,
				"with_operations": 0,
				"items": [
					{
						"item_code": self.raw_item,
						"uom": "Nos",
						"qty": 1,
						"custom_yield_qty": None,
						"custom_yield_percent": 50,
					}
				],
			}
		)
		bom.insert(ignore_permissions=True)

		# Derived custom_yield_qty = qty * (percent / 100) = 1 * 0.5 = 0.5
		self.assertAlmostEqual(bom.items[0].custom_yield_qty, 0.5)
		# Back-calculated qty = custom_yield_qty / (percent / 100) = 0.5 / 0.5 = 1.0
		self.assertAlmostEqual(bom.items[0].qty, 1.0)

	def test_real_bom_insert_rejects_yield_tracked_row_missing_both_qty_and_yield_qty(self):
		"""A real BOM insert for a yield-tracked component with BOTH qty
		and custom_yield_qty missing still fails closed (real
		ValidationError) -- there is nothing for the ury-erp/ury#464
		fallback to derive custom_yield_qty from."""
		bom = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": self.finished_item,
				"quantity": 1,
				"company": self.company,
				"is_active": 1,
				"is_default": 1,
				"with_operations": 0,
				"items": [
					{
						"item_code": self.raw_item,
						"uom": "Nos",
						"qty": None,
						"custom_yield_qty": None,
						"custom_yield_percent": 50,
					}
				],
			}
		)
		with self.assertRaisesRegex(frappe.ValidationError, "custom_yield_qty"):
			bom.insert(ignore_permissions=True)


if __name__ == "__main__":
	unittest.main()

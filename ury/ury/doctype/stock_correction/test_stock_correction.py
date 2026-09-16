# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# See license.txt
"""Tests for stock_correction.py.

Priority-3 audit (sa-comprehensive-test-strategy Phase 2, round 3):
`stock_correction` had ZERO test files despite having validate/on_submit/
on_cancel hooks that directly adjust inventory quantities (Table 2 &
Table 4 of COVERAGE_GAP_ANALYSIS.md, item #5 of the Top 15).

Scope, per this track's mock-vs-IntegrationTestCase split: `validate()`'s
five sub-checks are pure read+branch logic over already-loaded child rows
and a couple of `frappe.db.get_value` lookups -- covered here with mocks,
matching the pattern in `test_bulk_production.py`. The real write path
(`create_and_submit_stock_entry()` / `_make_stock_entry()`, which builds
and submits a real ERPNext Stock Entry) needs Warehouse/Company/Item
fixtures and a real DB round trip; it is deferred to a follow-up
IntegrationTestCase session (see this session's EXECUTION_LOG.md entry)
rather than mocked, since mocking `frappe.get_doc({...}).insert()` here
would not catch a real Stock Entry validation failure.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.stock_correction.stock_correction import StockCorrection

MODULE = "ury.ury.doctype.stock_correction.stock_correction"


def _row(item_code="ITEM-001", qty=1, uom="Nos", warehouse=None):
	return frappe._dict(
		{"item_code": item_code, "qty": qty, "uom": uom, "warehouse": warehouse}
	)


def _new_doc(items=None, **overrides):
	doc = StockCorrection(
		{
			"doctype": "Stock Correction",
			"reference_stock_reconciliation": None,
			"branch": None,
			"warehouse": None,
			**overrides,
		}
	)
	doc.items = items if items is not None else []
	return doc


class TestValidateReferenceStockReconciliation(FrappeTestCase):
	def test_no_reference_is_a_noop(self):
		doc = _new_doc(reference_stock_reconciliation=None)
		with patch(f"{MODULE}.frappe.db.get_value") as mock_get_value:
			doc.validate_reference_stock_reconciliation()
		mock_get_value.assert_not_called()

	def test_nonexistent_reference_raises(self):
		doc = _new_doc(reference_stock_reconciliation="SR-MISSING")
		with patch(f"{MODULE}.frappe.db.get_value", return_value=None):
			with self.assertRaises(frappe.ValidationError):
				doc.validate_reference_stock_reconciliation()

	def test_unsubmitted_reference_raises(self):
		doc = _new_doc(reference_stock_reconciliation="SR-0001")
		with patch(f"{MODULE}.frappe.db.get_value", return_value=0):
			with self.assertRaises(frappe.ValidationError):
				doc.validate_reference_stock_reconciliation()

	def test_submitted_reference_passes(self):
		doc = _new_doc(reference_stock_reconciliation="SR-0001")
		with patch(f"{MODULE}.frappe.db.get_value", return_value=1):
			doc.validate_reference_stock_reconciliation()  # should not raise


class TestValidateWarehouseBelongsToBranch(FrappeTestCase):
	def test_missing_branch_or_warehouse_is_a_noop(self):
		doc = _new_doc(branch=None, warehouse="WH-1")
		with patch(f"{MODULE}.frappe.db.get_value") as mock_get_value:
			doc.validate_warehouse_belongs_to_branch()
		mock_get_value.assert_not_called()

	def test_mismatched_warehouse_raises(self):
		doc = _new_doc(branch="Branch A", warehouse="WH-Wrong")
		with patch(f"{MODULE}.frappe.db.get_value", return_value="WH-Correct"):
			with self.assertRaises(frappe.ValidationError):
				doc.validate_warehouse_belongs_to_branch()

	def test_matching_warehouse_passes(self):
		doc = _new_doc(branch="Branch A", warehouse="WH-Correct")
		with patch(f"{MODULE}.frappe.db.get_value", return_value="WH-Correct"):
			doc.validate_warehouse_belongs_to_branch()  # should not raise

	def test_no_branch_warehouse_mapping_found_passes(self):
		# branch_warehouse falsy (e.g. POS Profile has no warehouse set) ->
		# the guard is skipped entirely, not enforced against None.
		doc = _new_doc(branch="Branch A", warehouse="WH-Any")
		with patch(f"{MODULE}.frappe.db.get_value", return_value=None):
			doc.validate_warehouse_belongs_to_branch()  # should not raise


class TestValidateItems(FrappeTestCase):
	def test_no_items_raises(self):
		doc = _new_doc(items=[])
		with self.assertRaises(frappe.ValidationError):
			doc.validate_items()

	def test_zero_qty_row_raises(self):
		doc = _new_doc(items=[_row(qty=0)])
		with self.assertRaises(frappe.ValidationError):
			doc.validate_items()

	def test_nonzero_qty_rows_pass(self):
		doc = _new_doc(items=[_row(qty=5), _row(qty=-3)])
		doc.validate_items()  # should not raise


class TestValidateSingleDirection(FrappeTestCase):
	def test_all_positive_passes(self):
		doc = _new_doc(items=[_row(qty=5), _row(qty=3)])
		doc.validate_single_direction()  # should not raise

	def test_all_negative_passes(self):
		doc = _new_doc(items=[_row(qty=-5), _row(qty=-3)])
		doc.validate_single_direction()  # should not raise

	def test_mixed_signs_raises(self):
		doc = _new_doc(items=[_row(qty=5), _row(qty=-3)])
		with self.assertRaises(frappe.ValidationError):
			doc.validate_single_direction()


class TestValidateFullFlow(FrappeTestCase):
	"""validate() calls all four sub-checks in sequence."""

	def test_validate_calls_all_subchecks(self):
		doc = _new_doc(items=[_row(qty=5)])
		with patch.object(doc, "validate_reference_stock_reconciliation") as m1, \
			patch.object(doc, "validate_warehouse_belongs_to_branch") as m2, \
			patch.object(doc, "validate_items") as m3, \
			patch.object(doc, "validate_single_direction") as m4:
			doc.validate()
		m1.assert_called_once()
		m2.assert_called_once()
		m3.assert_called_once()
		m4.assert_called_once()


class TestOnSubmitOnCancel(FrappeTestCase):
	def test_on_submit_delegates_to_create_and_submit_stock_entry(self):
		doc = _new_doc(items=[_row(qty=5)])
		with patch.object(doc, "create_and_submit_stock_entry") as mock_create:
			doc.on_submit()
		mock_create.assert_called_once()

	def test_on_cancel_delegates_to_cancel_stock_entry(self):
		doc = _new_doc(items=[_row(qty=5)])
		with patch.object(doc, "cancel_stock_entry") as mock_cancel:
			doc.on_cancel()
		mock_cancel.assert_called_once()

	def test_cancel_stock_entry_noop_without_linked_entry(self):
		doc = _new_doc(items=[])
		doc.stock_entry = None
		with patch(f"{MODULE}.frappe.db.get_value") as mock_get_value:
			doc.cancel_stock_entry()
		mock_get_value.assert_not_called()

	def test_cancel_stock_entry_cancels_submitted_linked_entry(self):
		doc = _new_doc(items=[])
		doc.stock_entry = "STE-0001"
		mock_se_doc = MagicMock()
		with patch(f"{MODULE}.frappe.db.get_value", return_value=1) as mock_get_value, \
			patch(f"{MODULE}.frappe.get_doc", return_value=mock_se_doc) as mock_get_doc:
			doc.cancel_stock_entry()
		mock_get_value.assert_called_once_with("Stock Entry", "STE-0001", "docstatus")
		mock_get_doc.assert_called_once_with("Stock Entry", "STE-0001")
		mock_se_doc.cancel.assert_called_once()

	def test_cancel_stock_entry_skips_already_cancelled_entry(self):
		doc = _new_doc(items=[])
		doc.stock_entry = "STE-0001"
		with patch(f"{MODULE}.frappe.db.get_value", return_value=2), \
			patch(f"{MODULE}.frappe.get_doc") as mock_get_doc:
			doc.cancel_stock_entry()
		mock_get_doc.assert_not_called()


class TestCreateAndSubmitStockEntry(FrappeTestCase):
	"""Split-by-direction dispatch logic -- the actual `_make_stock_entry`
	call is mocked out since it performs a real ERPNext Stock Entry
	insert+submit (deferred to the IntegrationTestCase follow-up)."""

	def test_only_receipt_items_makes_single_material_receipt_entry(self):
		doc = _new_doc(items=[_row(qty=5), _row(qty=3)])
		doc.name = "SC-0001"
		with patch.object(doc, "_make_stock_entry", return_value="STE-0001") as mock_make, \
			patch.object(doc, "db_set") as mock_db_set:
			doc.create_and_submit_stock_entry()
		mock_make.assert_called_once_with("Material Receipt", doc.items)
		mock_db_set.assert_called_once_with("stock_entry", "STE-0001", update_modified=False)

	def test_only_issue_items_makes_single_material_issue_entry(self):
		doc = _new_doc(items=[_row(qty=-5), _row(qty=-3)])
		doc.name = "SC-0002"
		with patch.object(doc, "_make_stock_entry", return_value="STE-0002") as mock_make, \
			patch.object(doc, "db_set") as mock_db_set:
			doc.create_and_submit_stock_entry()
		mock_make.assert_called_once_with("Material Issue", doc.items)
		mock_db_set.assert_called_once_with("stock_entry", "STE-0002", update_modified=False)

	def test_no_items_creates_no_stock_entries(self):
		doc = _new_doc(items=[])
		with patch.object(doc, "_make_stock_entry") as mock_make, \
			patch.object(doc, "db_set") as mock_db_set:
			doc.create_and_submit_stock_entry()
		mock_make.assert_not_called()
		mock_db_set.assert_not_called()

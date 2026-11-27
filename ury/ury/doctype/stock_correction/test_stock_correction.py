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

import json
import os
import unittest
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase
from pypika import Table

from ury.ury.doctype.stock_correction.correction_type import get_item_codes_for_type
from ury.ury.doctype.stock_correction.stock_correction import StockCorrection, get_items

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


CORRECTION_TYPE_MODULE = "ury.ury.doctype.stock_correction.correction_type"


class TestCorrectionType(unittest.TestCase):
	def _mock_qb(self, *query_results):
		"""Return a mocked frappe.qb whose chained from_().select().where().run() yields *query_results*."""
		mock_qb = MagicMock()
		mock_qb.DocType = Table

		builders = []
		for rows in query_results:
			builder = MagicMock()
			builder.select.return_value = builder
			builder.where.return_value = builder
			builder.run.return_value = [frappe._dict(r) for r in rows]
			builders.append(builder)

		mock_qb.from_.side_effect = builders
		return mock_qb

	def test_processed_classification(self):
		mock_qb = self._mock_qb([{"item": "BURGER-PAT"}, {"item": "SAUCE-BASE"}])
		with patch(f"{CORRECTION_TYPE_MODULE}.frappe.qb", mock_qb):
			result = get_item_codes_for_type("Processed", "Branch-A")

		self.assertEqual(result, {"BURGER-PAT", "SAUCE-BASE"})
		mock_qb.from_.assert_called_once()

		with self.subTest("empty UIPC for processed returns empty set"):
			empty_qb = self._mock_qb([])
			with patch(f"{CORRECTION_TYPE_MODULE}.frappe.qb", empty_qb):
				self.assertEqual(get_item_codes_for_type("Processed", "Branch-A"), set())

		with self.subTest("blank or invalid type returns None without querying"):
			for invalid_type in ("", None, "Invalid"):
				no_qb = self._mock_qb()
				with patch(f"{CORRECTION_TYPE_MODULE}.frappe.qb", no_qb):
					self.assertIsNone(get_item_codes_for_type(invalid_type, "Branch-A"))
				no_qb.from_.assert_not_called()

	def test_raw_classification(self):
		mock_qb = self._mock_qb(
			[{"item": "BURGER-PAT"}],
			[{"name": "FLOUR-01"}, {"name": "TOMATO-01"}],
		)
		with patch(f"{CORRECTION_TYPE_MODULE}.frappe.qb", mock_qb):
			result = get_item_codes_for_type("Raw", "Branch-A")

		self.assertEqual(result, {"FLOUR-01", "TOMATO-01"})
		self.assertEqual(mock_qb.from_.call_count, 2)

		with self.subTest("no UIPC for branch treats all items as raw (returns None)"):
			no_uipc_qb = self._mock_qb([])
			with patch(f"{CORRECTION_TYPE_MODULE}.frappe.qb", no_uipc_qb):
				self.assertIsNone(get_item_codes_for_type("Raw", "Branch-A"))
			no_uipc_qb.from_.assert_called_once()

	def test_get_items_no_type_unaffected(self):
		reco_items = [
			frappe._dict({"item_code": "RAW-1", "item_name": "Raw 1", "warehouse": "WH-1", "has_serial_no": 0}),
			frappe._dict({"item_code": "PROC-1", "item_name": "Proc 1", "warehouse": "WH-1", "has_serial_no": 0}),
		]
		with patch(f"{MODULE}.get_items_for_stock_reco", return_value=reco_items), \
			patch(f"{MODULE}.get_stock_balance", return_value=(5.0, 10.0, "")), \
			patch(f"{MODULE}.get_item_data", side_effect=lambda d, q, r, s="": {"item_code": d.item_code, "qty": q, "valuation_rate": r}), \
			patch(f"{MODULE}.get_item_codes_for_type") as mock_get_codes:
			result = get_items("WH-1", "2026-01-01", "12:00:00", "Test Co")

		mock_get_codes.assert_not_called()
		self.assertEqual([r["item_code"] for r in result], ["RAW-1", "PROC-1"])

	def test_get_items_filtered_with_type(self):
		reco_items = [
			frappe._dict({"item_code": "RAW-1", "item_name": "Raw 1", "warehouse": "WH-1", "has_serial_no": 0}),
			frappe._dict({"item_code": "PROC-1", "item_name": "Proc 1", "warehouse": "WH-1", "has_serial_no": 0}),
		]
		with patch(f"{MODULE}.get_items_for_stock_reco", return_value=reco_items), \
			patch(f"{MODULE}.get_stock_balance", return_value=(5.0, 10.0, "")), \
			patch(f"{MODULE}.get_item_data", side_effect=lambda d, q, r, s="": {"item_code": d.item_code, "qty": q, "valuation_rate": r}), \
			patch(f"{MODULE}.get_item_codes_for_type", return_value={"PROC-1"}) as mock_get_codes:
			result = get_items(
				"WH-1", "2026-01-01", "12:00:00", "Test Co",
				correction_type="Processed", branch="Branch-A",
			)

		mock_get_codes.assert_called_once_with("Processed", "Branch-A")
		self.assertEqual([r["item_code"] for r in result], ["PROC-1"])

	def _doc(self, correction_type="", branch="Branch-A", items=None):
		doc = StockCorrection.__new__(StockCorrection)
		doc.correction_type = correction_type
		doc.branch = branch
		doc.items = items or []
		return doc

	def test_validate_rejects_mismatched_row(self):
		doc = self._doc(
			correction_type="Processed",
			branch="Branch-A",
			items=[frappe._dict({"item_code": "RAW-1", "idx": 1})],
		)
		with patch(f"{MODULE}.get_item_codes_for_type", return_value={"PROC-1"}):
			with self.assertRaises(frappe.ValidationError):
				doc._validate_correction_type_rows()

		with self.subTest("matching row passes"):
			doc.items = [frappe._dict({"item_code": "PROC-1", "idx": 1})]
			with patch(f"{MODULE}.get_item_codes_for_type", return_value={"PROC-1"}):
				doc._validate_correction_type_rows()

	def test_blank_type_always_valid(self):
		doc = self._doc(
			correction_type="",
			branch="Branch-A",
			items=[frappe._dict({"item_code": "ANY-ITEM", "idx": 1})],
		)
		with patch(f"{MODULE}.get_item_codes_for_type") as mock_get_codes:
			doc._validate_correction_type_rows()
		mock_get_codes.assert_not_called()

		with self.subTest("Raw with no UIPC records passes"):
			doc.correction_type = "Raw"
			with patch(f"{MODULE}.get_item_codes_for_type", return_value=None):
				doc._validate_correction_type_rows()

	def test_amend_preserves_type_no_copy_not_set(self):
		"""correction_type must NOT have no_copy in the DocType JSON."""
		json_path = os.path.join(os.path.dirname(__file__), "stock_correction.json")
		with open(json_path) as f:
			meta = json.load(f)
		field = next((fd for fd in meta["fields"] if fd["fieldname"] == "correction_type"), None)
		self.assertIsNotNone(field, "correction_type field not found in JSON")
		self.assertFalse(
			field.get("no_copy"),
			"correction_type must not have no_copy set (amend must copy the type)",
		)


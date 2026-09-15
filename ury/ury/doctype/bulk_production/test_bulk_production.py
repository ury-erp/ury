"""Tests for bulk_production.py's validation and cost-calculation logic.

Static-review note: written and hand-traced against the mocking pattern used
by `ury/ury/api/test_ury_daily_p_and_l.py` and `ury/ury/hooks/test_ury_bom.py`
(patching `frappe.get_value`/`frappe.db.get_value`/`frappe.throw` directly,
never touching a real database).

Scope decision, per this track's stated mock-vs-IntegrationTestCase split:
`BulkProduction.validate_item()` and `get_total_cost()`/`get_bom_cost()` are
pure validation/arithmetic over already-loaded child rows and BOM lookups --
read-heavy, no writes -- so they're covered here with mocks. The real
write-path methods (`save_stockentry()`/`create_stock_entry()`, which build
and submit a real ERPNext Stock Entry against Warehouse/Company/BOM Item
fixtures) are the financial write-path this doctype owns, and per TRACK.md
Phase 2's explicit split belong under `frappe.tests.IntegrationTestCase`
with real fixtures and a real DB round trip -- NOT attempted in this pass
(see this session's EXECUTION_LOG.md entry: deferred for a follow-up
session with bench time budgeted for real BOM/Warehouse/Stock Entry fixture
setup, not silently skipped).
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.bulk_production.bulk_production import (
	BulkProduction,
	fetch_last_purchase_rate,
	get_bom_cost,
)

MODULE = "ury.ury.doctype.bulk_production.bulk_production"


def _item(item_name="Chicken Base", bom="BOM-001", qty=10, cost=0, tt_cost=0):
	row = frappe._dict(
		{
			"idx": 1,
			"item_name": item_name,
			"bom": bom,
			"qty": qty,
			"cost": cost,
			"tt_cost": tt_cost,
		}
	)
	return row


def _new_doc(items):
	doc = BulkProduction({"doctype": "Bulk Production"})
	doc.bulk_production_items = items
	# BulkProduction.get(...) is BaseDocument.get -- reading a plain
	# attribute set above works fine without a DB round trip.
	return doc


class TestValidateItem(FrappeTestCase):
	def test_negative_qty_raises(self):
		doc = _new_doc([_item(qty=-5)])
		with patch(f"{MODULE}.frappe.get_value", return_value=1):
			with patch(f"{MODULE}.frappe.throw", side_effect=frappe.ValidationError) as mock_throw:
				with self.assertRaises(frappe.ValidationError):
					doc.validate_item()
		self.assertTrue(mock_throw.called)

	def test_zero_qty_is_treated_as_missing_and_raises(self):
		doc = _new_doc([_item(qty=0)])
		with patch(f"{MODULE}.frappe.get_value", return_value=1):
			with patch(f"{MODULE}.frappe.throw", side_effect=frappe.ValidationError):
				with self.assertRaises(frappe.ValidationError):
					doc.validate_item()

	def test_inactive_bom_raises(self):
		doc = _new_doc([_item(qty=5)])
		with patch(f"{MODULE}.frappe.get_value", return_value=0):
			with patch(f"{MODULE}.frappe.throw", side_effect=frappe.ValidationError) as mock_throw:
				with self.assertRaises(frappe.ValidationError):
					doc.validate_item()
		self.assertTrue(mock_throw.called)

	def test_duplicate_item_name_raises(self):
		doc = _new_doc([_item(item_name="Chicken Base", qty=5), _item(item_name="Chicken Base", qty=5)])
		with patch(f"{MODULE}.frappe.get_value", return_value=1):
			with patch(f"{MODULE}.frappe.throw", side_effect=frappe.ValidationError) as mock_throw:
				with self.assertRaises(frappe.ValidationError):
					doc.validate_item()
		self.assertTrue(mock_throw.called)

	def test_valid_unique_items_do_not_raise(self):
		doc = _new_doc(
			[
				_item(item_name="Chicken Base", qty=5),
				_item(item_name="Veg Stock", qty=8),
			]
		)
		with patch(f"{MODULE}.frappe.get_value", return_value=1):
			with patch(f"{MODULE}.frappe.throw") as mock_throw:
				doc.validate_item()
		mock_throw.assert_not_called()

	def test_multiple_issues_on_same_row_are_all_reported(self):
		# qty=-5 on a row whose BOM is also inactive -> both a "must be
		# positive" and a "BOM not active" message for the same idx.
		doc = _new_doc([_item(qty=-5)])
		with patch(f"{MODULE}.frappe.get_value", return_value=0):
			with patch(f"{MODULE}.frappe.throw", side_effect=frappe.ValidationError) as mock_throw:
				with self.assertRaises(frappe.ValidationError):
					doc.validate_item()
		args, kwargs = mock_throw.call_args
		error_list = args[0]
		self.assertEqual(len(error_list), 2)
		self.assertTrue(kwargs.get("as_list"))


class TestGetTotalCost(FrappeTestCase):
	def test_precomputed_cost_is_summed_without_bom_lookup(self):
		doc = _new_doc([_item(cost=5, tt_cost=50), _item(cost=3, tt_cost=30)])
		with patch(f"{MODULE}.frappe.db.get_value") as mock_get_value:
			total = doc.get_total_cost()
		mock_get_value.assert_not_called()
		self.assertEqual(total, 80)

	def test_missing_cost_is_derived_from_bom_total_cost_and_quantity(self):
		item = _item(cost=0, qty=10)

		def _get_value(doctype, name, fieldname):
			return {"total_cost": 100, "quantity": 5}[fieldname]

		doc = _new_doc([item])
		with patch(f"{MODULE}.frappe.db.get_value", side_effect=_get_value):
			total = doc.get_total_cost()
		# bom_cost = 100 / 5 = 20; tt_cost = qty(10) * cost(20) = 200
		self.assertEqual(item.cost, 20)
		self.assertEqual(item.tt_cost, 200)
		self.assertEqual(total, 200)


class TestGetBomCost(FrappeTestCase):
	def test_returns_total_cost_divided_by_quantity(self):
		def _get_value(doctype, name, fieldname):
			return {"total_cost": 60, "quantity": 3}[fieldname]

		with patch(f"{MODULE}.frappe.db.get_value", side_effect=_get_value):
			self.assertEqual(get_bom_cost("BOM-001"), 20)


class TestFetchLastPurchaseRate(FrappeTestCase):
	def test_delegates_to_frappe_db_get_value(self):
		with patch(f"{MODULE}.frappe.db.get_value", return_value=12.5) as mock_get_value:
			result = fetch_last_purchase_rate("ITEM-001")
		mock_get_value.assert_called_once_with("Item", "ITEM-001", "last_purchase_rate")
		self.assertEqual(result, 12.5)


class TestEnqueueSaveStockentry(FrappeTestCase):
	"""Queue-vs-inline dispatch logic in enqueue_save_stockentry()/
	cancel_stock_entry_queue() -- pure branching on row count, no real Stock
	Entry writes here (those are covered by save_stockentry/create_stock_entry
	directly, deferred to the IntegrationTestCase follow-up noted above).
	"""

	def test_ten_or_more_items_are_queued_not_run_inline(self):
		items = [_item(item_name=f"Item {i}") for i in range(10)]
		doc = _new_doc(items)
		doc.name = "BP-0001"
		with patch(f"{MODULE}.frappe.db.set_value") as mock_set_value:
			with patch(f"{MODULE}.frappe.enqueue") as mock_enqueue:
				with patch.object(doc, "save_stockentry") as mock_inline:
					doc.enqueue_save_stockentry()
		mock_enqueue.assert_called_once()
		mock_inline.assert_not_called()
		self.assertEqual(doc.status, "Queued")
		mock_set_value.assert_called_once_with(
			"Bulk Production", "BP-0001", "status", "Queued", update_modified=False
		)

	def test_fewer_than_ten_items_run_inline(self):
		items = [_item(item_name=f"Item {i}") for i in range(3)]
		doc = _new_doc(items)
		doc.name = "BP-0002"
		with patch(f"{MODULE}.frappe.enqueue") as mock_enqueue:
			with patch.object(doc, "save_stockentry") as mock_inline:
				doc.enqueue_save_stockentry()
		mock_enqueue.assert_not_called()
		mock_inline.assert_called_once()

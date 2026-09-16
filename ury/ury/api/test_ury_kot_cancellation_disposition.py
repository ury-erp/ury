"""Tests for resolve_cancellation_disposition in ury_kot_cancellation_service.

Covers item-level disposition resolution for cancelled KOT items:
  1. Return-to-stock disposition sets URY KOT Items.disposition without creating
     wastage.
  2. Waste disposition creates exactly one URY Issue Wastage record with correct
     qty, item, and actor.
  3. Resolving an already-resolved row raises ALREADY_RESOLVED.
  4. Invalid disposition value raises INVALID_DISPOSITION.
  5. Nonexistent KOT item row raises KOT_ITEM_NOT_FOUND.
  6. Invalid qty (zero, negative, exceeding available) raises INVALID_QTY.

Note: as with test_ury_kot_cancellation_service.py, these tests use mocking
(frappe.db, frappe.get_doc, frappe.session) and are NOT executed against a live
bench/site. They are written and hand-traced to the same mocking pattern.
"""

from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_cancellation_service import (
	ALREADY_RESOLVED,
	DISPOSITION_PENDING,
	DISPOSITION_RETURNED_TO_STOCK,
	DISPOSITION_WASTED,
	INVALID_DISPOSITION,
	INVALID_QTY,
	KOT_ITEM_NOT_FOUND,
	CancellationError,
	resolve_cancellation_disposition,
)


MODULE = "ury.ury.api.ury_kot_cancellation_service"


def _existence_side_effect(kot_exists=True):
	def _exists(doctype, name=None):
		if doctype == "DocType":
			return True
		if doctype == "URY KOT":
			return kot_exists
		return False

	return _exists


def _kot_scope_patches(branch="Branch A", company="Company A", production_unit="UNIT-1"):
	def _get_value(doctype, *args, **kwargs):
		if doctype == "URY KOT":
			import frappe

			return frappe._dict({"branch": branch, "production_unit": production_unit})
		if doctype == "Branch":
			return company
		if doctype == "URY Production Unit":
			return "Dept-1"
		return None

	return _get_value


def _mock_kot_item_row(name="ROW-1", item="Item-A", quantity=10, cancelled_qty=None, disposition=None):
	"""Create a mock KOT item row."""
	import frappe

	row = frappe._dict({
		"name": name,
		"item": item,
		"quantity": quantity,
		"cancelled_qty": cancelled_qty,
	})
	if disposition is not None:
		row.disposition = disposition
	return row


def _mock_kot_doc(name="KOT-1", branch="Branch A", production_unit="UNIT-1", items=None):
	"""Create a mock KOT doc with items."""
	import frappe

	if items is None:
		items = [_mock_kot_item_row()]

	doc = frappe._dict({
		"name": name,
		"doctype": "URY KOT",
		"branch": branch,
		"production_unit": production_unit,
		"kot_items": items,
	})
	doc.get = lambda field: doc.get(field) if field in doc else (doc.get("kot_items") if field == "kot_items" else None)
	doc.save = MagicMock()
	return doc


def _new_wastage_doc_recorder():
	"""Return a frappe.get_doc side_effect that records URY Issue Wastage creation."""
	created_wastage = []

	def _get_doc(*args, **kwargs):
		arg = args[0] if args else kwargs.get("arg1")
		if isinstance(arg, dict):
			import frappe

			doc = frappe._dict(dict(arg))
			doc.insert = MagicMock()
			doc.save = MagicMock()
			if doc.get("doctype") == "URY Issue Wastage":
				created_wastage.append(doc)
			return doc
		raise AssertionError("doc lookups should be by dict in these tests")

	return _get_doc, created_wastage


class TestReturnToStockDisposition(FrappeTestCase):
	def setUp(self):
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_return_to_stock_sets_disposition_no_wastage(self):
		"""Return-to-stock disposition sets the disposition field and creates no
		wastage record.
		"""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A", quantity=10)
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"

			result = resolve_cancellation_disposition(
				"KOT-1", "ROW-1", "return_to_stock", qty=5, actor="chef1@example.com"
			)

		self.assertEqual(result["disposition"], DISPOSITION_RETURNED_TO_STOCK)
		self.assertIsNone(result["wastage_record"])
		self.assertEqual(kot_item_row.disposition, DISPOSITION_RETURNED_TO_STOCK)
		kot_doc.save.assert_called_once_with(ignore_permissions=False)

	def test_return_to_stock_accepts_valid_qty_less_than_available(self):
		"""Qty validation passes when qty is less than available."""
		kot_item_row = _mock_kot_item_row(name="ROW-1", quantity=10)
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"

			result = resolve_cancellation_disposition(
				"KOT-1", "ROW-1", "return_to_stock", qty=5
			)

		self.assertEqual(result["qty"], 5)


class TestWasteDisposition(FrappeTestCase):
	def setUp(self):
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_waste_creates_issue_wastage_record(self):
		"""Waste disposition creates exactly one URY Issue Wastage record with
		correct fields.
		"""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A", quantity=10)
		kot_doc = _mock_kot_doc(items=[kot_item_row])
		get_doc_side_effect, created_wastage = _new_wastage_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", side_effect=[
				# First call: get the KOT doc
				kot_doc,
				# Second call: get_doc for wastage creation
				get_doc_side_effect({
					"doctype": "URY Issue Wastage",
					"branch": "Branch A",
					"company": "Company A",
					"department": "Dept-1",
					"production_unit": "UNIT-1",
					"component_item": "Item-A",
					"status": "Draft",
					"wasted_qty": 5,
					"reason_category": "Spoilage",
					"reason_notes": "Spoilage",
					"captured_by": "chef1@example.com",
					"captured_on": "2024-01-01 00:00:00",
					"name": "WASTAGE-1",
				}),
			]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"

			result = resolve_cancellation_disposition(
				"KOT-1", "ROW-1", "waste", qty=5, actor="chef1@example.com", reason="Spoilage"
			)

		self.assertEqual(result["disposition"], DISPOSITION_WASTED)
		self.assertEqual(result["wastage_record"], "WASTAGE-1")
		self.assertEqual(kot_item_row.disposition, DISPOSITION_WASTED)
		self.assertEqual(len(created_wastage), 1)
		wastage = created_wastage[0]
		self.assertEqual(wastage["wasted_qty"], 5)
		self.assertEqual(wastage["component_item"], "Item-A")
		self.assertEqual(wastage["captured_by"], "chef1@example.com")
		wastage["insert"].assert_called_once()
		kot_doc.save.assert_called_once_with(ignore_permissions=False)

	def test_waste_uses_reason_category_when_valid(self):
		"""Reason category is used when it matches a valid Select option."""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A")
		kot_doc = _mock_kot_doc(items=[kot_item_row])
		get_doc_side_effect, created_wastage = _new_wastage_doc_recorder()

		# Try each valid reason category
		for reason in ["Spoilage", "Preparation Error", "Dropped/Damaged", "Expired"]:
			created_wastage.clear()

			with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
				f"{MODULE}.frappe.get_doc", side_effect=[
					kot_doc,
					get_doc_side_effect({"doctype": "URY Issue Wastage", "name": "W-1"}),
				]
			), patch(
				f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
			), patch(
				f"{MODULE}.frappe.session"
			) as mock_session:
				mock_session.user = "chef1@example.com"

				result = resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "waste", qty=3, reason=reason
				)

			self.assertEqual(created_wastage[0]["reason_category"], reason)

	def test_waste_defaults_to_other_for_invalid_reason_category(self):
		"""Unknown reason falls back to 'Other'."""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A")
		kot_doc = _mock_kot_doc(items=[kot_item_row])
		get_doc_side_effect, created_wastage = _new_wastage_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", side_effect=[
				kot_doc,
				get_doc_side_effect({"doctype": "URY Issue Wastage", "name": "W-1"}),
			]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"

			result = resolve_cancellation_disposition(
				"KOT-1", "ROW-1", "waste", qty=3, reason="Unknown Reason"
			)

		self.assertEqual(created_wastage[0]["reason_category"], "Other")

	def test_waste_uses_cancelled_qty_when_available(self):
		"""When cancelled_qty is set, it's used for validation instead of quantity."""
		kot_item_row = _mock_kot_item_row(
			name="ROW-1", item="Item-A", quantity=100, cancelled_qty=5
		)
		kot_doc = _mock_kot_doc(items=[kot_item_row])
		get_doc_side_effect, created_wastage = _new_wastage_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", side_effect=[
				kot_doc,
				get_doc_side_effect({"doctype": "URY Issue Wastage", "name": "W-1"}),
			]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"

			# qty=5 is ok because cancelled_qty=5, even though quantity=100
			result = resolve_cancellation_disposition(
				"KOT-1", "ROW-1", "waste", qty=5
			)

		self.assertEqual(created_wastage[0]["wasted_qty"], 5)


class TestAlreadyResolvedError(FrappeTestCase):
	def setUp(self):
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_already_returned_to_stock_raises_already_resolved(self):
		"""Resolving a row that is already Returned to Stock raises
		ALREADY_RESOLVED.
		"""
		kot_item_row = _mock_kot_item_row(
			name="ROW-1", item="Item-A", disposition=DISPOSITION_RETURNED_TO_STOCK
		)
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "waste", qty=3
				)

		self.assertEqual(ctx.exception.reason_code, ALREADY_RESOLVED)

	def test_already_wasted_raises_already_resolved(self):
		"""Resolving a row that is already Wasted raises ALREADY_RESOLVED."""
		kot_item_row = _mock_kot_item_row(
			name="ROW-1", item="Item-A", disposition=DISPOSITION_WASTED
		)
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "return_to_stock", qty=3
				)

		self.assertEqual(ctx.exception.reason_code, ALREADY_RESOLVED)


class TestInvalidDispositionError(FrappeTestCase):
	def setUp(self):
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_invalid_disposition_value_raises_error(self):
		"""Disposition value that is not 'return_to_stock' or 'waste' raises
		INVALID_DISPOSITION.
		"""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A")
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "invalid_disposition", qty=3
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_DISPOSITION)

	def test_empty_disposition_raises_error(self):
		"""Empty disposition string raises INVALID_DISPOSITION."""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A")
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "", qty=3
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_DISPOSITION)


class TestKotItemNotFoundError(FrappeTestCase):
	def setUp(self):
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_nonexistent_item_row_name_raises_error(self):
		"""KOT item row with specified name not found raises KOT_ITEM_NOT_FOUND."""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A")
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-NONEXISTENT", "waste", qty=3
				)

		self.assertEqual(ctx.exception.reason_code, KOT_ITEM_NOT_FOUND)

	def test_empty_kot_items_raises_error(self):
		"""KOT with no items raises KOT_ITEM_NOT_FOUND for any row name."""
		kot_doc = _mock_kot_doc(items=[])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "waste", qty=3
				)

		self.assertEqual(ctx.exception.reason_code, KOT_ITEM_NOT_FOUND)


class TestInvalidQtyError(FrappeTestCase):
	def setUp(self):
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_zero_qty_raises_invalid_qty(self):
		"""qty=0 raises INVALID_QTY."""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A")
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "waste", qty=0
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_QTY)

	def test_negative_qty_raises_invalid_qty(self):
		"""qty < 0 raises INVALID_QTY."""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A")
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "waste", qty=-5
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_QTY)

	def test_non_numeric_qty_raises_invalid_qty(self):
		"""Non-numeric qty raises INVALID_QTY."""
		kot_item_row = _mock_kot_item_row(name="ROW-1", item="Item-A")
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "waste", qty="not_a_number"
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_QTY)

	def test_qty_exceeding_available_raises_invalid_qty(self):
		"""qty > resolvable_qty raises INVALID_QTY."""
		kot_item_row = _mock_kot_item_row(
			name="ROW-1", item="Item-A", quantity=5, cancelled_qty=None
		)
		kot_doc = _mock_kot_doc(items=[kot_item_row])

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", return_value=kot_doc
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				resolve_cancellation_disposition(
					"KOT-1", "ROW-1", "waste", qty=10
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_QTY)

	def test_qty_equal_to_available_succeeds(self):
		"""qty == resolvable_qty succeeds."""
		kot_item_row = _mock_kot_item_row(
			name="ROW-1", item="Item-A", quantity=5, cancelled_qty=None
		)
		kot_doc = _mock_kot_doc(items=[kot_item_row])
		get_doc_side_effect, created_wastage = _new_wastage_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_doc", side_effect=[
				kot_doc,
				get_doc_side_effect({"doctype": "URY Issue Wastage", "name": "W-1"}),
			]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"

			result = resolve_cancellation_disposition(
				"KOT-1", "ROW-1", "waste", qty=5
			)

		self.assertEqual(result["qty"], 5)

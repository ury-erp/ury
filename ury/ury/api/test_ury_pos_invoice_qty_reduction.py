"""Tests for ury_pos_invoice_qty_reduction.

Tests the qty-reduction API used by both cashier (Register) and captain (order UI)
frontends to reduce item quantities on a printed POS Invoice when the order type is
configured as allowed in the POS Profile.

Static-review note: these tests are hand-traced against the module logic and the
sibling ury_kot_generate.py / ury_pos_invoice.py patterns. None have been executed
in a live bench/site environment (no database available in this checkout).
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_pos_invoice_qty_reduction import (
	QtyReductionError,
	reduce_order_item_qty,
	INVOICE_NOT_FOUND,
	ITEM_NOT_FOUND,
	INVALID_QTY,
	ORDER_TYPE_NOT_ALLOWED,
	KOT_NAMING_SERIES_MISSING,
	NOT_PERMITTED,
	LAST_ITEM_CANNOT_BE_REMOVED,
)


MODULE = "ury.ury.api.ury_pos_invoice_qty_reduction"
#: process_items_for_cancel_kot (in ury_kot_generate.py) calls this real
#: collaborator to route items to a production unit, which needs real
#: Item/Branch/Item-Group routing data these fixtures do not provide.
#: Patched to a single fixed production unit everywhere
#: below -- it is not the code under test in this file.
KOT_GEN_MODULE = "ury.ury.api.ury_kot_generate"


def _pos_invoice_doc(
	name="INV-001",
	order_type="Dine In",
	invoice_printed=1,
	pos_profile="POS-1",
	customer="CUST-001",
	restaurant_table=None,
	items=None,
	company="Test Company",
):
	"""Build a mock POS Invoice doc."""
	if items is None:
		items = [
			{
				"name": "ROW-001",
				"item_code": "ITEM-001",
				"qty": 2,
				"item_name": "Biryani",
			}
		]
	# A plain object, NOT a dict subclass: on frappe._dict, `.items` is the
	# read-only dict.items() method and cannot hold the child table the API
	# iterates (`for row in pos_invoice.items`).
	doc = _FakeDoc(
		name=name,
		order_type=order_type,
		invoice_printed=invoice_printed,
		pos_profile=pos_profile,
		customer=customer,
		restaurant_table=restaurant_table,
		items=[frappe._dict(item) for item in items],
		custom_ury_order_number="ORD-123",
		company=company,
	)
	doc.save = MagicMock()
	return doc


class _FakeDoc:
	"""Attribute bag with a Document-like `.get()`; `.items` is a plain attribute."""

	def __init__(self, **fields):
		self.__dict__.update(fields)

	def __getattr__(self, key):
		# Only reached for unset fields: mirror frappe._dict/Document (None).
		if key.startswith("__"):
			raise AttributeError(key)
		return None

	def get(self, key, default=None):
		return self.__dict__.get(key, default)


def _pos_profile_doc(
	name="POS-1",
	branch="Branch A",
	allowed_order_types="Dine In,Take Away",
	kot_naming_series="KOT",
):
	"""Build a mock POS Profile doc."""
	doc = frappe._dict({
		"name": name,
		"branch": branch,
		"custom_qty_reduction_allowed_order_types": allowed_order_types,
		"custom_kot_naming_series": kot_naming_series,
	})
	doc.get = lambda key, default=None: getattr(doc, key, default)
	return doc


def _kot_doc_recorder():
	"""Return a frappe.get_doc side_effect recorder for URY KOT creation."""
	created = []

	def _wrap(seed):
		doc = frappe._dict(dict(seed))
		doc.insert = MagicMock()
		doc.submit = MagicMock()
		doc.kot_items = []
		doc.append = lambda field, row, _doc=doc: _doc[field].append(row) if field == "kot_items" else None
		doc.as_dict = lambda _doc=doc: dict(_doc)
		created.append(doc)
		return doc

	def _get_doc(*args, **kwargs):
		arg = args[0] if args else kwargs.get("arg1")
		if isinstance(arg, dict):
			return _wrap(arg)
		raise AssertionError("URY KOT lookups by name should not happen in qty-reduction flow")

	return _get_doc, created


class TestQtyReductionOnAllowedOrderType(FrappeTestCase):
	"""Test successful qty reduction on an order type explicitly allowed by POS Profile."""

	def test_reduce_qty_creates_partial_cancel_kot_with_correct_delta(self):
		"""Reducing item qty from 2 to 1 should:
		1. Update invoice item qty to 1
		2. Create a cancel-KOT with cancelled_qty = 1 (the delta)
		3. Return invoice state including delta=-1 and cancel_kot_names
		"""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In,Take Away")
		get_kot_side_effect, created_kots = _kot_doc_recorder()

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			# URY KOT creation for cancel-KOT
			return get_kot_side_effect(*args, **kwargs)

		with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True), \
		     patch(f"{MODULE}.frappe.db.get_all") as mock_get_all, \
		     patch(f"{MODULE}.frappe.db.get_value") as mock_get_value, \
		     patch(f"{MODULE}.frappe.get_roles", return_value=["URY Cashier"]), \
		     patch(f"{MODULE}.frappe.session") as mock_session:

			mock_session.user = "cashier@example.com"

			# Mock existence checks
			mock_exists.side_effect = lambda doctype, name=None: True if doctype == "POS Invoice" else False
			# Mock production units and item groups
			mock_get_all.return_value = [frappe._dict({"name": "PROD-1"})]

			def get_value_side_effect(*args, **kwargs):
				if args[0] == "URY Production Unit" and "production" in str(kwargs):
					return "PROD-1"
				return None
			mock_get_value.side_effect = get_value_side_effect

			result = reduce_order_item_qty(
				invoice_id="INV-001",
				item_row_name="ROW-001",
				new_qty=1,
				reason="Guest requested reduction",
			)

		# Verify invoice was saved with updated qty
		invoice.save.assert_called_once()
		self.assertEqual(invoice.items[0].qty, 1)

		# Verify cancel-KOT was created with cancelled_qty = delta (original 2 - new 1 = 1)
		self.assertEqual(len(created_kots), 1)
		cancel_kot = created_kots[0]
		self.assertEqual(cancel_kot["type"], "Partially cancelled")
		self.assertEqual(cancel_kot["invoice"], "INV-001")

		# Verify the cancel-KOT's kot_items row records the correct cancelled_qty
		# (the delta, not the full original qty) -- this is the exact assertion
		# whose absence let the fractional-qty `abs(int(...))` truncation bug in
		# ury_kot_generate.create_cancel_kot_doc go undetected.
		self.assertEqual(len(cancel_kot["kot_items"]), 1)
		self.assertEqual(cancel_kot["kot_items"][0]["cancelled_qty"], 1)
		self.assertEqual(cancel_kot["kot_items"][0]["item"], "ITEM-001")

		# Verify return shape
		self.assertEqual(result["invoice"], "INV-001")
		self.assertEqual(result["item_row_name"], "ROW-001")
		self.assertEqual(result["item_code"], "ITEM-001")
		self.assertEqual(result["previous_qty"], 2)
		self.assertEqual(result["new_qty"], 1)
		self.assertEqual(result["delta"], -1)
		self.assertEqual(result["order_type"], "Dine In")
		self.assertEqual(result["actor"], "cashier@example.com")
		self.assertIsInstance(result["cancel_kot_names"], list)

	def test_reduce_qty_to_zero_full_removal(self):
		"""Reducing qty to 0 should fully remove the item and create cancel-KOT for entire qty."""
		invoice = _pos_invoice_doc(
			order_type="Take Away",
			items=[
				{"name": "ROW-001", "item_code": "ITEM-001", "qty": 3, "item_name": "Biryani"},
				{"name": "ROW-002", "item_code": "ITEM-002", "qty": 1, "item_name": "Naan"},
			],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In,Take Away")
		get_kot_side_effect, created_kots = _kot_doc_recorder()

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			return get_kot_side_effect(*args, **kwargs)

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True), \
		     patch(f"{MODULE}.frappe.db.get_all", return_value=[frappe._dict({"name": "PROD-1"})]), \
		     patch(f"{MODULE}.frappe.db.get_value", return_value=None):

			result = reduce_order_item_qty(
				invoice_id="INV-001",
				item_row_name="ROW-001",
				new_qty=0,
			)

		# Verify only the targeted row was removed from invoice items -- the OTHER
		# row (ROW-002) must survive even though, before the item_row_name fix,
		# matching by item_code alone would have removed every row sharing that
		# item_code.
		self.assertEqual(len(invoice.items), 1)
		self.assertEqual(invoice.items[0].item_code, "ITEM-002")

		# Verify cancel-KOT delta is the full original qty (3 - 0 = 3)
		self.assertEqual(result["previous_qty"], 3)
		self.assertEqual(result["new_qty"], 0)
		self.assertEqual(result["delta"], -3)

		self.assertEqual(len(created_kots), 1)
		self.assertEqual(created_kots[0]["kot_items"][0]["cancelled_qty"], 3)

	def test_reduce_qty_by_row_name_does_not_remove_other_row_with_same_item_code(self):
		"""Two rows share the same item_code; reducing one by its row name must
		leave the other row (and its qty) completely untouched.
		"""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[
				{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
				{"name": "ROW-002", "item_code": "ITEM-001", "qty": 5, "item_name": "Biryani"},
			],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")
		get_kot_side_effect, created_kots = _kot_doc_recorder()

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			return get_kot_side_effect(*args, **kwargs)

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True), \
		     patch(f"{MODULE}.frappe.db.get_all", return_value=[frappe._dict({"name": "PROD-1"})]), \
		     patch(f"{MODULE}.frappe.db.get_value", return_value=None):

			result = reduce_order_item_qty(
				invoice_id="INV-001",
				item_row_name="ROW-001",
				new_qty=0,
			)

		remaining_names = [row.name for row in invoice.items]
		self.assertEqual(remaining_names, ["ROW-002"])
		self.assertEqual(invoice.items[0].qty, 5)
		self.assertEqual(result["delta"], -2)

	def test_reduce_qty_bypass_bypasses_validate_invoice_guard(self):
		"""Qty reduction with frappe.flags.ury_qty_reduction set should bypass
		validate_invoice's post-print guard (no throw).
		"""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			invoice_printed=1,
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")
		get_kot_side_effect, _ = _kot_doc_recorder()

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			return get_kot_side_effect(*args, **kwargs)

		flags_before = {}
		def save_check(*args, **kwargs):
			# Capture flag state during save call
			flags_before["ury_qty_reduction"] = getattr(frappe.flags, "ury_qty_reduction", False)

		invoice.save.side_effect = save_check

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True), \
		     patch(f"{MODULE}.frappe.db.get_all", return_value=[frappe._dict({"name": "PROD-1"})]), \
		     patch(f"{MODULE}.frappe.db.get_value", return_value=None):

			reduce_order_item_qty(
				invoice_id="INV-001",
				item_row_name="ROW-001",
				new_qty=1,
			)

		# Verify that save was called (prove the flag bypass worked)
		invoice.save.assert_called_once()
		# Verify flag was True during save (as per the save_check side_effect)
		self.assertTrue(flags_before.get("ury_qty_reduction"))


class TestQtyReductionOnDisallowedOrderType(FrappeTestCase):
	"""Test qty reduction rejection on order types NOT in the allow-list."""

	def test_disallowed_order_type_raises_order_type_not_allowed_error(self):
		"""Order type "Phone In" not in allow-list should raise ORDER_TYPE_NOT_ALLOWED."""
		invoice = _pos_invoice_doc(
			order_type="Phone In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In,Take Away")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=1,
				)

		self.assertEqual(ctx.exception.reason_code, ORDER_TYPE_NOT_ALLOWED)
		# Verify invoice was NOT modified
		self.assertEqual(invoice.items[0].qty, 2)

	def test_empty_allowed_order_types_fails_closed(self):
		"""Empty custom_qty_reduction_allowed_order_types should reject ANY order type."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="")  # Empty = no order types allowed

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=1,
				)

		self.assertEqual(ctx.exception.reason_code, ORDER_TYPE_NOT_ALLOWED)

	def test_unset_order_type_treated_as_not_allowed(self):
		"""Invoice with order_type=None should fail when list is non-empty."""
		invoice = _pos_invoice_doc(
			order_type=None,  # Not set
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In,Take Away")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=1,
				)

		self.assertEqual(ctx.exception.reason_code, ORDER_TYPE_NOT_ALLOWED)


class TestInvalidQtyValidation(FrappeTestCase):
	"""Test qty validation: must satisfy 0 <= new_qty < current_qty, and integral."""

	def test_negative_qty_raises_invalid_qty(self):
		"""new_qty < 0 should raise INVALID_QTY."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=-1,
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_QTY)

	def test_qty_equal_to_current_qty_raises_invalid_qty(self):
		"""new_qty == current_qty is not a reduction (must be < current_qty)."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=2,
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_QTY)

	def test_qty_greater_than_current_qty_raises_invalid_qty(self):
		"""new_qty > current_qty is an increase, not a reduction."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=5,
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_QTY)

	def test_non_numeric_qty_raises_invalid_qty(self):
		"""Non-numeric new_qty (e.g. 'two') should raise INVALID_QTY."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty="two",
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_QTY)

	def test_fractional_qty_raises_invalid_qty(self):
		"""A fractional new_qty (e.g. 1.5) must be rejected: reduce_order_item_qty
		only supports whole-number reductions, matching the cancel-KOT row's
		integer `cancelled_qty` (ury_kot_generate.create_cancel_kot_doc uses
		`abs(int(...))`, which silently truncates a fractional delta instead of
		rejecting it -- this validation must happen before that point).
		"""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 3, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=1.5,
				)

		self.assertEqual(ctx.exception.reason_code, INVALID_QTY)
		# Verify invoice was NOT modified
		self.assertEqual(invoice.items[0].qty, 3)


class TestInvoiceAndItemNotFoundErrors(FrappeTestCase):
	"""Test error handling for missing invoices and items."""

	def test_invoice_not_found_raises_invoice_not_found_error(self):
		"""Non-existent invoice should raise INVOICE_NOT_FOUND."""
		with patch(f"{MODULE}.frappe.db.exists", return_value=False):
			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-NONEXISTENT",
					item_row_name="ROW-001",
					new_qty=1,
				)

		self.assertEqual(ctx.exception.reason_code, INVOICE_NOT_FOUND)

	def test_item_not_found_raises_item_not_found_error(self):
		"""Invoice without the requested item row should raise ITEM_NOT_FOUND."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-NONEXISTENT",
					new_qty=1,
				)

		self.assertEqual(ctx.exception.reason_code, ITEM_NOT_FOUND)

	def test_item_code_mismatch_raises_item_not_found_error(self):
		"""An `item_code` that doesn't match the resolved row's item_code should
		raise ITEM_NOT_FOUND (the row is the authority; item_code is only a
		secondary sanity check).
		"""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					item_code="ITEM-999",
					new_qty=1,
				)

		self.assertEqual(ctx.exception.reason_code, ITEM_NOT_FOUND)


class TestPermissionChecks(FrappeTestCase):
	"""Test permission validation."""

	def test_no_write_permission_raises_not_permitted_error(self):
		"""Caller without write permission should raise NOT_PERMITTED."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=False):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=1,
				)

		self.assertEqual(ctx.exception.reason_code, NOT_PERMITTED)

	def test_has_permission_is_checked_against_session_user_not_client_supplied_value(self):
		"""`frappe.has_permission` must be called with `frappe.session.user` --
		never a value the client could supply -- since a caller-supplied
		"actor" would otherwise let anyone forge write access to invoices they
		don't actually have permission on.
		"""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=False) as mock_has_permission, \
		     patch(f"{MODULE}.frappe.session") as mock_session:

			mock_session.user = "real-session-user@example.com"

			with self.assertRaises(QtyReductionError):
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=1,
				)

		_, call_kwargs = mock_has_permission.call_args
		self.assertEqual(call_kwargs.get("user"), "real-session-user@example.com")


class TestKOTNamingSeriesValidation(FrappeTestCase):
	"""Test KOT naming series configuration validation."""

	def test_missing_kot_naming_series_raises_error(self):
		"""POS Profile without custom_kot_naming_series should raise KOT_NAMING_SERIES_MISSING."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(kot_naming_series="")  # Empty = not configured

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=1,
				)

		self.assertEqual(ctx.exception.reason_code, KOT_NAMING_SERIES_MISSING)


class TestLastItemCannotBeRemoved(FrappeTestCase):
	"""Test that removing the sole remaining item on an invoice is rejected."""

	def test_removing_only_item_raises_last_item_cannot_be_removed(self):
		"""new_qty=0 on an invoice with exactly one item row should raise
		LAST_ITEM_CANNOT_BE_REMOVED instead of leaving a zero-item invoice.
		"""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			raise AssertionError(f"Unexpected get_doc call for {args}")

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True):

			with self.assertRaises(QtyReductionError) as ctx:
				reduce_order_item_qty(
					invoice_id="INV-001",
					item_row_name="ROW-001",
					new_qty=0,
				)

		self.assertEqual(ctx.exception.reason_code, LAST_ITEM_CANNOT_BE_REMOVED)
		# Verify invoice was NOT modified/saved
		self.assertEqual(len(invoice.items), 1)
		invoice.save.assert_not_called()

	def test_removing_one_of_several_items_is_allowed(self):
		"""new_qty=0 is still allowed when other item rows remain on the invoice."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[
				{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
				{"name": "ROW-002", "item_code": "ITEM-002", "qty": 1, "item_name": "Naan"},
			],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")
		get_kot_side_effect, created_kots = _kot_doc_recorder()

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			return get_kot_side_effect(*args, **kwargs)

		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True), \
		     patch(f"{MODULE}.frappe.db.get_all", return_value=[frappe._dict({"name": "PROD-1"})]), \
		     patch(f"{MODULE}.frappe.db.get_value", return_value=None):

			result = reduce_order_item_qty(
				invoice_id="INV-001",
				item_row_name="ROW-001",
				new_qty=0,
			)

		self.assertEqual(result["new_qty"], 0)
		self.assertEqual(len(invoice.items), 1)
		self.assertEqual(invoice.items[0].item_code, "ITEM-002")


class TestValidateInvoiceGuardRegression(FrappeTestCase):
	"""Regression test: verify that the validate_invoice guard still blocks
	direct qty modifications that DON'T go through reduce_order_item_qty.
	"""

	def test_direct_qty_modification_on_printed_invoice_without_flag_should_fail(self):
		"""Simulating a direct qty modification (not via reduce_order_item_qty)
		on a printed invoice should fail in validate_invoice because the
		ury_qty_reduction flag is NOT set.

		This is a regression test to ensure the qty-reduction API doesn't
		weaken the original post-print guard for other callers.
		"""
		from ury.ury.hooks.ury_pos_invoice import validate_invoice

		def build_invoice(qty):
			# Real (unsaved) POS Invoice documents: `items` is a genuine child
			# table, unlike frappe._dict where dict.items() shadows the field.
			doc = frappe.new_doc("POS Invoice")
			doc.name = "INV-001"
			doc.invoice_printed = 1
			doc.pos_profile = "POS-1"
			doc.waiter = "waiter1@example.com"
			doc.modified_by = "waiter1@example.com"
			doc.append("items", {"item_code": "ITEM-001", "qty": qty, "item_name": "Biryani"})
			return doc

		# Original doc as stored before the modification
		original_invoice = build_invoice(2)
		# Simulate direct qty reduction (not via the API)
		pos_invoice = build_invoice(1)

		saved_flags = {
			key: frappe.flags.get(key) for key in ("ury_qty_reduction", "ury_bill_split")
		}
		frappe.flags.ury_qty_reduction = False
		frappe.flags.ury_bill_split = False
		try:
			# remove_items == 0 on the POS Profile; original doc served from "DB"
			with patch("ury.ury.hooks.ury_pos_invoice.frappe.db.get_value", return_value=0), \
			     patch("ury.ury.hooks.ury_pos_invoice.frappe.get_doc", return_value=original_invoice):
				# The guard is still in place and the flag is not set -> must throw
				with self.assertRaises(frappe.ValidationError) as ctx:
					validate_invoice(pos_invoice, None)
			self.assertIn("qty reduced from 2", str(ctx.exception))
		finally:
			for key, value in saved_flags.items():
				frappe.flags[key] = value


class TestActorAuthority(FrappeTestCase):
	"""Test that the actor recorded/authorized is always frappe.session.user,
	never a client-supplied value -- the actor-as-authority permission bug.
	"""

	def test_actor_is_always_session_user(self):
		"""The returned `actor` must be frappe.session.user."""
		invoice = _pos_invoice_doc(
			order_type="Dine In",
			items=[{"name": "ROW-001", "item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"}],
		)
		pos_profile = _pos_profile_doc(allowed_order_types="Dine In")
		get_kot_side_effect, _ = _kot_doc_recorder()

		def get_doc_dispatch(*args, **kwargs):
			if args and args[0] == "POS Invoice":
				return invoice
			if args and args[0] == "POS Profile":
				return pos_profile
			return get_kot_side_effect(*args, **kwargs)

		# Note: frappe.db.get_all/get_value are NOT patched here even though
		# an earlier version of this test did -- ury_pos_invoice_qty_reduction.py
		# never calls them, and patching `{MODULE}.frappe.db.*` monkey-patches
		# the shared `frappe.db` singleton for the whole process (not just
		# this module), which broke unrelated Document/meta loading deeper in
		# the call stack (process_items_for_cancel_kot -> resolve_production_context
		# -> frappe.get_all -> frappe.get_meta, which itself calls
		# frappe.db.get_value internally and got the stubbed None back,
		# surfacing as a spurious "DocType ... not found").
		with patch(f"{MODULE}.frappe.db.exists", return_value=True), \
		     patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), \
		     patch(f"{KOT_GEN_MODULE}.resolve_production_units", return_value=["Kitchen"]), \
		     patch(f"{MODULE}.frappe.has_permission", return_value=True), \
		     patch(f"{MODULE}.frappe.session") as mock_session:

			mock_session.user = "default_user@example.com"

			result = reduce_order_item_qty(
				invoice_id="INV-001",
				item_row_name="ROW-001",
				new_qty=1,
			)

		self.assertEqual(result["actor"], "default_user@example.com")

	def test_reduce_order_item_qty_has_no_client_supplied_actor_parameter(self):
		"""There must be no `actor` parameter a caller could use to forge
		permission/authority -- it should not appear in the function signature
		at all.
		"""
		import inspect

		params = inspect.signature(reduce_order_item_qty).parameters
		self.assertNotIn("actor", params)

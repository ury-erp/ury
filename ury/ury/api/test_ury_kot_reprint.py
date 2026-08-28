"""
Unit tests for ``ury.ury.api.ury_kot_reprint``.

These tests use ``unittest.mock`` to stub out all Frappe DB / ORM calls so
they can be run without a live MariaDB / Redis instance (``python -m unittest``).
They cover the routing matrix described in the PR dossier:

    1. KOT reprint disabled → raises ValidationError.
    2. Items split across two production units → each unit's printer receives
       only its item subset.
    3. ``custom_block_takeaway_kot`` row skipped when invoice has no table;
       honoured (not skipped) for dine-in.
    4. Room-level printers used when ``restaurant_table`` is set.
    5. POS Profile fallback when invoice has no ``restaurant_table``.
    6. No matching production unit / no configured rows → "Failure" return +
       log_error, no exception raised.
    7. ``print_by_server(doc=…)`` is called with the correct filtered clone.

Run with::

    python -m unittest ury.ury.api.test_ury_kot_reprint -v

or from the bench root::

    python -m unittest discover -s apps/ury/ury/ury/api -p "test_ury_kot_reprint.py" -v
"""

import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

# ---------------------------------------------------------------------------
# Minimal frappe stub so the module can be imported without a bench context
# ---------------------------------------------------------------------------

def _build_frappe_stub():
	"""Build a minimal frappe module stub."""

	class _ValidationError(Exception):
		pass

	frappe_mod = types.ModuleType("frappe")
	frappe_mod.ValidationError = _ValidationError
	frappe_mod.exceptions = types.SimpleNamespace(ValidationError=_ValidationError)

	def _whitelist(fn=None, **kwargs):
		"""Support @frappe.whitelist() and @frappe.whitelist(allow_guest=True)."""
		if fn is not None:
			return fn
		return lambda f: f

	frappe_mod.whitelist = _whitelist

	# Stub methods; tests will override via patch() or direct assignment
	frappe_mod.get_doc = MagicMock()
	frappe_mod.db = MagicMock()
	frappe_mod.get_all = MagicMock()
	frappe_mod.log_error = MagicMock()

	def _throw(msg, *args, **kwargs):
		raise _ValidationError(msg)

	frappe_mod.throw = _throw
	frappe_mod._ = lambda s: s

	return frappe_mod


# Install the stub before importing the module under test
_frappe_stub = _build_frappe_stub()
sys.modules.setdefault("frappe", _frappe_stub)
sys.modules.setdefault("frappe.utils", types.ModuleType("frappe.utils"))
sys.modules["frappe.utils"].cint = int
_print_format_mod = types.ModuleType("frappe.utils.print_format")
_mock_print_by_server = MagicMock()
_print_format_mod.print_by_server = _mock_print_by_server
sys.modules.setdefault("frappe.utils.print_format", _print_format_mod)

import frappe  # noqa: E402  (imported after stub installed)

from ury.ury.api.ury_kot_reprint import print_kot, reprint_kot  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ns(**kwargs):
	"""Return a SimpleNamespace — avoids MagicMock's special 'name' attribute."""
	return SimpleNamespace(**kwargs)


def _make_item(item_code, qty=1):
	return _ns(item_code=item_code, qty=qty)


def _make_printer_row(printer, kot_reprint=1, reprint_format="KOT Format", block_takeaway=0):
	return _ns(
		printer=printer,
		custom_kot_reprint=kot_reprint,
		custom_kot_reprint_format=reprint_format,
		custom_block_takeaway_kot=block_takeaway,
	)


def _make_invoice(
	name="INV-001",
	pos_profile="POS-001",
	branch="BRANCH-001",
	restaurant_table=None,
	items=None,
	order_number="ORD-1",
):
	invoice = MagicMock()
	invoice.name = name
	invoice.pos_profile = pos_profile
	invoice.branch = branch
	invoice.restaurant_table = restaurant_table
	invoice.items = items or []
	invoice.get = MagicMock(return_value=order_number)
	return invoice


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

class TestReprintKotDisabled(unittest.TestCase):
	"""reprint_kot raises when KOT reprint is disabled on the POS Profile."""

	def test_disabled_raises_validation_error(self):
		invoice = _make_invoice()
		frappe.get_doc = MagicMock(return_value=invoice)
		frappe.db.get_value = MagicMock(return_value=0)  # disabled

		with self.assertRaises(frappe.ValidationError) as ctx:
			reprint_kot("INV-001")

		self.assertIn("disabled", str(ctx.exception).lower())

	def test_missing_pos_profile_raises(self):
		invoice = _make_invoice(pos_profile=None)
		frappe.get_doc = MagicMock(return_value=invoice)

		with self.assertRaises(frappe.ValidationError) as ctx:
			reprint_kot("INV-001")

		self.assertIn("POS Profile not found", str(ctx.exception))


class TestProductionUnitRouting(unittest.TestCase):
	"""Items are split correctly by production unit; each unit printer gets its subset."""

	def setUp(self):
		# Two items in different item groups
		self.item_hot = _make_item("PIZZA", qty=1)
		self.item_cold = _make_item("JUICE", qty=1)

		self.invoice = _make_invoice(
			items=[self.item_hot, self.item_cold],
			restaurant_table=None,  # takeaway → room branch is skipped
		)
		frappe.get_doc = MagicMock(return_value=self.invoice)
		frappe.log_error = MagicMock()

		# POS Profile reprint enabled; everything else None
		frappe.db.get_value = MagicMock(return_value=1)

		# Production units returned by frappe.db.get_all
		frappe.db.get_all = MagicMock(return_value=[
			_ns(name="HOT_KITCHEN"),
			_ns(name="COLD_BAR"),
		])

		frappe.get_all = MagicMock(side_effect=self._frappe_get_all)

	def _frappe_get_all(self, doctype, **kwargs):
		filters = kwargs.get("filters", {})
		parent = filters.get("parent") if isinstance(filters, dict) else None
		parenttype = filters.get("parenttype") if isinstance(filters, dict) else None

		if doctype == "Item":
			# Batch item_group lookup
			return [
				_ns(name="PIZZA", item_group="Hot Food"),
				_ns(name="JUICE", item_group="Beverages"),
			]

		if doctype == "URY Production Item Groups":
			if parent == "HOT_KITCHEN":
				return [_ns(item_group="Hot Food")]
			if parent == "COLD_BAR":
				return [_ns(item_group="Beverages")]
			return []

		if doctype == "URY Printer Settings":
			if parenttype == "URY Production Unit":
				if parent == "HOT_KITCHEN":
					return [_make_printer_row("HOT_PRINTER", block_takeaway=0)]
				if parent == "COLD_BAR":
					return [_make_printer_row("COLD_PRINTER", block_takeaway=0)]
			# No POS Profile fallback rows — this test focuses on production unit routing
		return []

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_each_production_unit_gets_its_items(self, mock_print_kot):
		result = reprint_kot("INV-001")

		self.assertEqual(result, "Success")

		# Exactly 2 calls: one per production unit
		self.assertEqual(mock_print_kot.call_count, 2)
		calls = mock_print_kot.call_args_list

		printers_called = {c.args[0] for c in calls}
		self.assertIn("HOT_PRINTER", printers_called)
		self.assertIn("COLD_PRINTER", printers_called)

		# Verify item filtering: HOT_KITCHEN doc should only contain PIZZA
		for c in calls:
			doc = c.args[3]
			if c.args[0] == "HOT_PRINTER":
				self.assertEqual(len(doc.items), 1)
				self.assertEqual(doc.items[0].item_code, "PIZZA")
			elif c.args[0] == "COLD_PRINTER":
				self.assertEqual(len(doc.items), 1)
				self.assertEqual(doc.items[0].item_code, "JUICE")

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_zero_qty_items_are_excluded(self, mock_print_kot):
		"""Items with qty <= 0 must never appear in the production unit's temp_doc."""
		cancelled_item = _make_item("PIZZA", qty=0)
		self.invoice.items = [cancelled_item, self.item_cold]

		result = reprint_kot("INV-001")

		# Only COLD_BAR has an item; HOT_KITCHEN should not print
		for c in mock_print_kot.call_args_list:
			self.assertNotEqual(c.args[0], "HOT_PRINTER")


class TestBlockTakeawayKot(unittest.TestCase):
	"""custom_block_takeaway_kot rows are skipped for takeaway; used for dine-in."""

	def _base_db_get_value(self, doctype, name, field, *args, **kwargs):
		if doctype == "POS Profile" and field == "custom_enable_kot_reprint":
			return 1
		if doctype == "URY Table" and field == "restaurant_room":
			return "ROOM-1"
		return None

	def _make_blocked_get_all(self, restaurant_table):
		"""Return a side_effect function for frappe.get_all for the blocked-printer scenario."""
		def _get_all(doctype, **kwargs):
			filters = kwargs.get("filters", {})
			parent = filters.get("parent") if isinstance(filters, dict) else None
			parenttype = filters.get("parenttype") if isinstance(filters, dict) else None

			if doctype == "Item":
				return [_ns(name="BURGER", item_group="Food")]
			if doctype == "URY Production Item Groups":
				return [_ns(item_group="Food")]
			if doctype == "URY Printer Settings":
				if parenttype == "URY Production Unit":
					# This printer row has block_takeaway=1
					return [_make_printer_row("BLOCKED_PRINTER", block_takeaway=1)]
				# No room or profile printers
				return []
			return []
		return _get_all

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_blocked_printer_skipped_for_takeaway(self, mock_print_kot):
		"""A printer with block_takeaway=1 must NOT print for an invoice without a table."""
		item = _make_item("BURGER")
		invoice = _make_invoice(items=[item], restaurant_table=None)
		frappe.get_doc = MagicMock(return_value=invoice)
		frappe.log_error = MagicMock()
		frappe.db.get_value = MagicMock(side_effect=self._base_db_get_value)
		frappe.db.get_all = MagicMock(return_value=[_ns(name="KITCHEN")])
		frappe.get_all = MagicMock(side_effect=self._make_blocked_get_all(restaurant_table=None))

		result = reprint_kot("INV-001")

		self.assertEqual(result, "Failure: No valid printers found")
		mock_print_kot.assert_not_called()
		frappe.log_error.assert_called_once()

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_blocked_printer_used_for_dine_in(self, mock_print_kot):
		"""A printer with block_takeaway=1 MUST print when the invoice has a restaurant_table."""
		item = _make_item("BURGER")
		invoice = _make_invoice(items=[item], restaurant_table="TABLE-1")
		frappe.get_doc = MagicMock(return_value=invoice)
		frappe.log_error = MagicMock()
		frappe.db.get_value = MagicMock(side_effect=self._base_db_get_value)
		frappe.db.get_all = MagicMock(return_value=[_ns(name="KITCHEN")])

		def _get_all(doctype, **kwargs):
			filters = kwargs.get("filters", {})
			parent = filters.get("parent") if isinstance(filters, dict) else None
			parenttype = filters.get("parenttype") if isinstance(filters, dict) else None

			if doctype == "Item":
				return [_ns(name="BURGER", item_group="Food")]
			if doctype == "URY Production Item Groups":
				return [_ns(item_group="Food")]
			if doctype == "URY Printer Settings":
				if parenttype == "URY Production Unit":
					return [_make_printer_row("BLOCKED_PRINTER", block_takeaway=1)]
				if parenttype == "URY Room":
					return []
			return []

		frappe.get_all = MagicMock(side_effect=_get_all)

		result = reprint_kot("INV-001")

		self.assertEqual(result, "Success")
		mock_print_kot.assert_called_once()
		self.assertEqual(mock_print_kot.call_args.args[0], "BLOCKED_PRINTER")


class TestRoomLevelPrinting(unittest.TestCase):
	"""Room-level printers are used when the invoice has a restaurant_table."""

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_room_printer_called_for_dine_in(self, mock_print_kot):
		item = _make_item("STEAK")
		invoice = _make_invoice(items=[item], restaurant_table="TABLE-1")
		frappe.get_doc = MagicMock(return_value=invoice)
		frappe.log_error = MagicMock()

		frappe.db.get_value = MagicMock(side_effect=lambda dt, name, fld, *a, **kw: (
			1 if dt == "POS Profile" and fld == "custom_enable_kot_reprint" else
			"ROOM-1" if dt == "URY Table" and fld == "restaurant_room" else None
		))
		# No production units
		frappe.db.get_all = MagicMock(return_value=[])

		def _get_all(doctype, **kwargs):
			filters = kwargs.get("filters", {})
			parenttype = filters.get("parenttype") if isinstance(filters, dict) else None

			if doctype == "Item":
				return [_ns(name="STEAK", item_group="Grill")]
			if doctype == "URY Printer Settings" and parenttype == "URY Room":
				return [_make_printer_row("ROOM_PRINTER")]
			return []

		frappe.get_all = MagicMock(side_effect=_get_all)

		result = reprint_kot("INV-001")

		self.assertEqual(result, "Success")
		mock_print_kot.assert_called_once_with(
			"ROOM_PRINTER", "INV-001", "KOT Format", unittest.mock.ANY
		)

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_room_printer_full_item_list(self, mock_print_kot):
		"""Room-level prints should include ALL items (not filtered by item group)."""
		items = [_make_item("STEAK"), _make_item("SALAD")]
		invoice = _make_invoice(items=items, restaurant_table="TABLE-1")
		frappe.get_doc = MagicMock(return_value=invoice)
		frappe.log_error = MagicMock()
		frappe.db.get_value = MagicMock(side_effect=lambda dt, name, fld, *a, **kw: (
			1 if dt == "POS Profile" and fld == "custom_enable_kot_reprint" else
			"ROOM-1" if dt == "URY Table" and fld == "restaurant_room" else None
		))
		frappe.db.get_all = MagicMock(return_value=[])

		def _get_all(doctype, **kwargs):
			filters = kwargs.get("filters", {})
			parenttype = filters.get("parenttype") if isinstance(filters, dict) else None
			if doctype == "Item":
				return [
					_ns(name="STEAK", item_group="Grill"),
					_ns(name="SALAD", item_group="Salads"),
				]
			if doctype == "URY Printer Settings" and parenttype == "URY Room":
				return [_make_printer_row("ROOM_PRINTER")]
			return []

		frappe.get_all = MagicMock(side_effect=_get_all)

		reprint_kot("INV-001")

		doc = mock_print_kot.call_args.args[3]
		self.assertEqual(len(doc.items), 2)


class TestPosProfileFallback(unittest.TestCase):
	"""POS Profile-level printers are used for takeaway / no-table invoices."""

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_pos_profile_fallback_for_takeaway(self, mock_print_kot):
		item = _make_item("SANDWICH")
		invoice = _make_invoice(items=[item], restaurant_table=None)
		frappe.get_doc = MagicMock(return_value=invoice)
		frappe.log_error = MagicMock()
		frappe.db.get_value = MagicMock(return_value=1)
		frappe.db.get_all = MagicMock(return_value=[])

		def _get_all(doctype, **kwargs):
			filters = kwargs.get("filters", {})
			parenttype = filters.get("parenttype") if isinstance(filters, dict) else None
			if doctype == "Item":
				return [_ns(name="SANDWICH", item_group="Snacks")]
			if doctype == "URY Printer Settings" and parenttype == "POS Profile":
				return [_make_printer_row("PROFILE_PRINTER")]
			return []

		frappe.get_all = MagicMock(side_effect=_get_all)

		result = reprint_kot("INV-001")

		self.assertEqual(result, "Success")
		mock_print_kot.assert_called_once()
		self.assertEqual(mock_print_kot.call_args.args[0], "PROFILE_PRINTER")


class TestNoValidPrinters(unittest.TestCase):
	"""When no printer is found, return Failure without throwing and log an error."""

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_no_printers_returns_failure(self, mock_print_kot):
		item = _make_item("ITEM-A")
		invoice = _make_invoice(items=[item], restaurant_table=None)
		frappe.get_doc = MagicMock(return_value=invoice)
		frappe.log_error = MagicMock()
		frappe.db.get_value = MagicMock(return_value=1)
		frappe.db.get_all = MagicMock(return_value=[])

		def _get_all(doctype, **kwargs):
			if doctype == "Item":
				return [_ns(name="ITEM-A", item_group="Food")]
			return []

		frappe.get_all = MagicMock(side_effect=_get_all)

		result = reprint_kot("INV-001")

		self.assertEqual(result, "Failure: No valid printers found")
		mock_print_kot.assert_not_called()
		frappe.log_error.assert_called_once()

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_no_printers_does_not_throw(self, mock_print_kot):
		"""Failure path must never raise an exception."""
		item = _make_item("ITEM-B")
		invoice = _make_invoice(items=[item], restaurant_table=None)
		frappe.get_doc = MagicMock(return_value=invoice)
		frappe.log_error = MagicMock()
		frappe.db.get_value = MagicMock(return_value=1)
		frappe.db.get_all = MagicMock(return_value=[])
		frappe.get_all = MagicMock(return_value=[])

		try:
			result = reprint_kot("INV-001")
		except Exception as exc:
			self.fail(f"reprint_kot raised unexpectedly: {exc}")

		self.assertTrue(result.startswith("Failure"))

	@patch("ury.ury.api.ury_kot_reprint.print_kot")
	def test_printer_row_without_format_not_printed(self, mock_print_kot):
		"""A row with custom_kot_reprint=1 but no format must be skipped."""
		item = _make_item("ITEM-C")
		invoice = _make_invoice(items=[item], restaurant_table=None)
		frappe.get_doc = MagicMock(return_value=invoice)
		frappe.log_error = MagicMock()
		frappe.db.get_value = MagicMock(return_value=1)
		frappe.db.get_all = MagicMock(return_value=[])

		def _get_all(doctype, **kwargs):
			filters = kwargs.get("filters", {})
			parenttype = filters.get("parenttype") if isinstance(filters, dict) else None
			if doctype == "Item":
				return [_ns(name="ITEM-C", item_group="Food")]
			if doctype == "URY Printer Settings" and parenttype == "POS Profile":
				# Row has reprint=1 but no format
				return [_make_printer_row("PRINTER", kot_reprint=1, reprint_format=None)]
			return []

		frappe.get_all = MagicMock(side_effect=_get_all)

		result = reprint_kot("INV-001")

		self.assertEqual(result, "Failure: No valid printers found")
		mock_print_kot.assert_not_called()


class TestPrintKot(unittest.TestCase):
	"""print_kot dispatches to print_by_server with the doc kwarg."""

	def setUp(self):
		# Reset the mock before each test
		sys.modules["frappe.utils.print_format"].print_by_server = MagicMock()
		frappe.log_error = MagicMock()

	def test_calls_print_by_server_with_doc(self):
		fake_doc = MagicMock()
		mock_pbs = sys.modules["frappe.utils.print_format"].print_by_server

		print_kot("PRINTER-1", "INV-001", "KOT-FORMAT", fake_doc)

		mock_pbs.assert_called_once_with(
			"POS Invoice", "INV-001", "PRINTER-1", "KOT-FORMAT", doc=fake_doc
		)

	def test_calls_print_by_server_without_doc(self):
		mock_pbs = sys.modules["frappe.utils.print_format"].print_by_server

		print_kot("PRINTER-1", "INV-001", "KOT-FORMAT")

		mock_pbs.assert_called_once_with(
			"POS Invoice", "INV-001", "PRINTER-1", "KOT-FORMAT", doc=None
		)

	def test_logs_error_on_exception(self):
		sys.modules["frappe.utils.print_format"].print_by_server = MagicMock(
			side_effect=RuntimeError("cups not available")
		)

		# Should NOT raise; errors are logged
		try:
			print_kot("PRINTER-X", "INV-001", "FMT")
		except Exception as exc:
			self.fail(f"print_kot raised unexpectedly: {exc}")

		frappe.log_error.assert_called_once()


if __name__ == "__main__":
	unittest.main()

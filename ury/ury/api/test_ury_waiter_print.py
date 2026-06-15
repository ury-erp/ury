from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_waiter_print import (
	WAITER_PRINT_FORMAT,
	print_waiter_order_slip,
)


class TestURYWaiterPrint(FrappeTestCase):
	def setUp(self):
		frappe.cache().delete_value("ury_waiter_print_INV-001")

	def _make_kot_doc(self, **kwargs):
		defaults = {
			"doctype": "URY KOT",
			"invoice": "INV-001",
			"restaurant_table": "T-01",
			"table_takeaway": 0,
		}
		defaults.update(kwargs)
		return frappe._dict(defaults)

	def _waiter_printer(self, **kwargs):
		defaults = {
			"printer": "Waiter Printer",
			"custom_waiter_print_format": WAITER_PRINT_FORMAT,
		}
		defaults.update(kwargs)
		return frappe._dict(defaults)

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.exists")
	def test_prints_waiter_slip_for_dine_in(
		self, mock_exists, mock_get_all, mock_get_value, mock_print_by_server
	):
		mock_exists.return_value = True
		mock_get_value.side_effect = lambda doctype, name, field=None: {
			("POS Invoice", "INV-001", "modified"): "2026-06-12 10:00:00",
			("URY Table", "T-01", "restaurant_room"): "Room-1",
		}.get((doctype, name, field))
		mock_get_all.return_value = [self._waiter_printer()]

		print_waiter_order_slip(self._make_kot_doc())

		mock_print_by_server.assert_called_once_with(
			"POS Invoice",
			"INV-001",
			"Waiter Printer",
			WAITER_PRINT_FORMAT,
			no_letterhead=1,
		)
		cached = frappe.cache().get_value("ury_waiter_print_INV-001")
		self.assertEqual(cached, "2026-06-12 10:00:00")

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.exists")
	def test_dedupes_same_invoice_revision(
		self, mock_exists, mock_get_all, mock_get_value, mock_print_by_server
	):
		mock_exists.return_value = True
		mock_get_value.side_effect = lambda doctype, name, field=None: {
			("POS Invoice", "INV-001", "modified"): "2026-06-12 10:00:00",
			("URY Table", "T-01", "restaurant_room"): "Room-1",
		}.get((doctype, name, field))
		mock_get_all.return_value = [self._waiter_printer()]

		kot_doc = self._make_kot_doc()
		print_waiter_order_slip(kot_doc)
		print_waiter_order_slip(kot_doc)

		mock_print_by_server.assert_called_once()

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.exists")
	def test_reprints_on_invoice_modification(
		self, mock_exists, mock_get_all, mock_get_value, mock_print_by_server
	):
		mock_exists.return_value = True
		modified_values = ["2026-06-12 10:00:00", "2026-06-12 11:00:00"]

		def get_value_side_effect(doctype, name, field=None):
			if doctype == "POS Invoice" and field == "modified":
				return modified_values.pop(0)
			if doctype == "URY Table" and field == "restaurant_room":
				return "Room-1"
			return None

		mock_get_value.side_effect = get_value_side_effect
		mock_get_all.return_value = [self._waiter_printer()]

		kot_doc = self._make_kot_doc()
		print_waiter_order_slip(kot_doc)
		print_waiter_order_slip(kot_doc)

		self.assertEqual(mock_print_by_server.call_count, 2)

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	def test_skips_takeaway_orders(self, mock_print_by_server):
		print_waiter_order_slip(self._make_kot_doc(table_takeaway=1))
		mock_print_by_server.assert_not_called()

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	def test_skips_without_restaurant_table(self, mock_print_by_server):
		print_waiter_order_slip(self._make_kot_doc(restaurant_table=None))
		mock_print_by_server.assert_not_called()

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.exists")
	def test_skips_when_no_waiter_printers(
		self, mock_exists, mock_get_all, mock_get_value, mock_print_by_server
	):
		mock_exists.return_value = True
		mock_get_value.side_effect = lambda doctype, name, field=None: {
			("POS Invoice", "INV-001", "modified"): "2026-06-12 10:00:00",
			("URY Table", "T-01", "restaurant_room"): "Room-1",
		}.get((doctype, name, field))
		mock_get_all.return_value = []

		print_waiter_order_slip(self._make_kot_doc())
		mock_print_by_server.assert_not_called()

	@patch("ury.ury.api.ury_waiter_print.frappe.log_error")
	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	def test_skips_when_printer_format_not_set(
		self, mock_get_all, mock_get_value, mock_print_by_server, mock_log_error
	):
		mock_get_value.side_effect = lambda doctype, name, field=None: {
			("POS Invoice", "INV-001", "modified"): "2026-06-12 10:00:00",
			("URY Table", "T-01", "restaurant_room"): "Room-1",
		}.get((doctype, name, field))
		mock_get_all.return_value = [self._waiter_printer(custom_waiter_print_format=None)]

		print_waiter_order_slip(self._make_kot_doc())
		mock_print_by_server.assert_not_called()
		mock_log_error.assert_called_once()

	@patch("ury.ury.api.ury_waiter_print.frappe.log_error")
	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.exists")
	def test_skips_when_format_missing(
		self, mock_exists, mock_get_all, mock_get_value, mock_print_by_server, mock_log_error
	):
		mock_exists.return_value = False
		mock_get_value.side_effect = lambda doctype, name, field=None: {
			("POS Invoice", "INV-001", "modified"): "2026-06-12 10:00:00",
			("URY Table", "T-01", "restaurant_room"): "Room-1",
		}.get((doctype, name, field))
		mock_get_all.return_value = [self._waiter_printer()]

		print_waiter_order_slip(self._make_kot_doc())
		mock_print_by_server.assert_not_called()
		mock_log_error.assert_called_once()

	def test_waiter_format_excludes_pricing_sections(self):
		if not frappe.db.exists("Print Format", WAITER_PRINT_FORMAT):
			self.skipTest(f"Print Format '{WAITER_PRINT_FORMAT}' not found on site")

		html = frappe.get_doc("Print Format", WAITER_PRINT_FORMAT).html.lower()
		for keyword in ("rate", "amount", "tax", "total", "payment", "grand"):
			self.assertNotIn(keyword, html)

	@patch("ury.ury.api.ury_kot_reprint.print_by_server")
	def test_kot_reprint_does_not_call_waiter_print(self, mock_print_by_server):
		from ury.ury.api.ury_kot_reprint import print_kot

		print_kot("Reprint Printer", "INV-001", "Reprint Format")
		mock_print_by_server.assert_called_once_with(
			"POS Invoice",
			"INV-001",
			"Reprint Printer",
			"Reprint Format",
		)

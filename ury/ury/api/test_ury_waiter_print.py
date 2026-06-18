from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_waiter_print import (
	WAITER_PRINT_FORMAT,
	build_combined_kot_doc,
	print_combined_waiter_order_slip,
)


class TestURYWaiterPrint(FrappeTestCase):
	def _make_kot_doc(self, name, kot_type, items):
		kot_doc = frappe._dict(
			{
				"doctype": "URY KOT",
				"name": name,
				"type": kot_type,
				"invoice": "INV-001",
				"restaurant_table": "T-01",
				"customer_name": "Customer",
				"order_no": "101",
				"kot_items": [],
			}
		)
		for item in items:
			kot_doc.kot_items.append(frappe._dict(item))
		return kot_doc

	def _waiter_printer(self, **kwargs):
		defaults = {
			"printer": "Waiter Printer",
			"custom_waiter_print_format": WAITER_PRINT_FORMAT,
		}
		defaults.update(kwargs)
		return frappe._dict(defaults)

	@patch("ury.ury.api.ury_waiter_print.frappe.copy_doc")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_doc")
	def test_build_combined_kot_doc_merges_multiple_kots(self, mock_get_doc, mock_copy_doc):
		mock_get_doc.side_effect = [
			self._make_kot_doc(
				"KOT-1",
				"New Order",
				[{"item": "Pizza", "item_name": "Pizza", "quantity": "1", "comments": ""}],
			),
			self._make_kot_doc(
				"KOT-2",
				"Order Modified",
				[{"item": "Pasta", "item_name": "Pasta", "quantity": "2", "comments": ""}],
			),
		]
		combined = frappe._dict({"kot_items": []})
		combined.append = lambda field, item: combined.kot_items.append(frappe._dict(item))
		mock_copy_doc.return_value = combined

		combined_doc = build_combined_kot_doc(["KOT-1", "KOT-2"])

		self.assertEqual(len(combined_doc.kot_items), 2)
		self.assertEqual(combined_doc.kot_items[0].item, "Pizza")
		self.assertEqual(combined_doc.kot_items[1].quantity, "2")

	@patch("ury.ury.api.ury_waiter_print.frappe.copy_doc")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_doc")
	def test_build_combined_kot_doc_aggregates_same_item(self, mock_get_doc, mock_copy_doc):
		mock_get_doc.side_effect = [
			self._make_kot_doc(
				"KOT-1",
				"New Order",
				[{"item": "Pizza", "item_name": "Pizza", "quantity": "1", "comments": ""}],
			),
			self._make_kot_doc(
				"KOT-2",
				"Order Modified",
				[{"item": "Pizza", "item_name": "Pizza", "quantity": "2", "comments": ""}],
			),
		]
		combined = frappe._dict({"kot_items": []})
		combined.append = lambda field, item: combined.kot_items.append(frappe._dict(item))
		mock_copy_doc.return_value = combined

		combined_doc = build_combined_kot_doc(["KOT-1", "KOT-2"])

		self.assertEqual(len(combined_doc.kot_items), 1)
		self.assertEqual(combined_doc.kot_items[0].quantity, "3")

	@patch("ury.ury.api.ury_waiter_print.frappe.copy_doc")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_doc")
	def test_build_combined_kot_doc_includes_cancel_lines(self, mock_get_doc, mock_copy_doc):
		mock_get_doc.side_effect = [
			self._make_kot_doc(
				"KOT-1",
				"New Order",
				[{"item": "Pizza", "item_name": "Pizza", "quantity": "1", "comments": ""}],
			),
			self._make_kot_doc(
				"KOT-2",
				"Partially cancelled",
				[
					{
						"item": "Soup",
						"item_name": "Soup",
						"quantity": "2",
						"cancelled_qty": 1,
						"comments": "",
					}
				],
			),
		]
		combined = frappe._dict({"kot_items": []})
		combined.append = lambda field, item: combined.kot_items.append(frappe._dict(item))
		mock_copy_doc.return_value = combined

		combined_doc = build_combined_kot_doc(["KOT-1", "KOT-2"])

		self.assertEqual(len(combined_doc.kot_items), 2)
		self.assertEqual(combined_doc.kot_items[1].cancelled_qty, 1)

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.build_combined_kot_doc")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.exists")
	def test_prints_combined_kot_for_dine_in(
		self,
		mock_exists,
		mock_get_all,
		mock_get_value,
		mock_build_combined,
		mock_print_by_server,
	):
		mock_exists.return_value = True
		mock_get_value.side_effect = lambda doctype, name, fieldname=None, **kwargs: {
			("URY Table", "T-01", "restaurant_room"): "Room-1",
			("URY Table", "T-01", "is_take_away"): 0,
			("Print Format", WAITER_PRINT_FORMAT, "doc_type"): "URY KOT",
		}.get((doctype, name, fieldname))
		mock_get_all.return_value = [self._waiter_printer()]

		combined_doc = MagicMock()
		combined_doc.kot_items = [frappe._dict({"item": "Pizza", "quantity": "1"})]
		mock_build_combined.return_value = combined_doc

		print_combined_waiter_order_slip("INV-001", ["KOT-1"], "T-01")

		mock_print_by_server.assert_called_once_with(
			"URY KOT",
			"KOT-1",
			"Waiter Printer",
			WAITER_PRINT_FORMAT,
			doc=combined_doc,
			no_letterhead=1,
		)

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.build_combined_kot_doc")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	def test_skips_when_combined_items_empty(
		self, mock_get_all, mock_get_value, mock_build_combined, mock_print_by_server
	):
		mock_get_value.side_effect = lambda doctype, name, fieldname=None, **kwargs: {
			("URY Table", "T-01", "restaurant_room"): "Room-1",
			("URY Table", "T-01", "is_take_away"): 0,
		}.get((doctype, name, fieldname))
		mock_get_all.return_value = [self._waiter_printer()]
		combined_doc = MagicMock()
		combined_doc.kot_items = []
		mock_build_combined.return_value = combined_doc

		print_combined_waiter_order_slip("INV-001", ["KOT-1"], "T-01")
		mock_print_by_server.assert_not_called()

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	def test_skips_takeaway_tables(self, mock_print_by_server):
		with patch(
			"ury.ury.api.ury_waiter_print._is_takeaway_table",
			return_value=True,
		):
			print_combined_waiter_order_slip("INV-001", ["KOT-1"], "T-01")
		mock_print_by_server.assert_not_called()

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	def test_skips_without_restaurant_table(self, mock_print_by_server):
		print_combined_waiter_order_slip("INV-001", ["KOT-1"], None)
		mock_print_by_server.assert_not_called()

	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.build_combined_kot_doc")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	def test_skips_when_no_waiter_printers(
		self, mock_get_all, mock_get_value, mock_build_combined, mock_print_by_server
	):
		mock_get_value.side_effect = lambda doctype, name, fieldname=None, **kwargs: {
			("URY Table", "T-01", "restaurant_room"): "Room-1",
			("URY Table", "T-01", "is_take_away"): 0,
		}.get((doctype, name, fieldname))
		mock_get_all.return_value = []
		mock_build_combined.return_value = MagicMock(kot_items=[1])

		print_combined_waiter_order_slip("INV-001", ["KOT-1"], "T-01")
		mock_print_by_server.assert_not_called()

	@patch("ury.ury.api.ury_waiter_print.frappe.log_error")
	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.build_combined_kot_doc")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	def test_skips_when_printer_format_not_set(
		self, mock_get_all, mock_get_value, mock_build_combined, mock_print_by_server, mock_log_error
	):
		mock_get_value.side_effect = lambda doctype, name, fieldname=None, **kwargs: {
			("URY Table", "T-01", "restaurant_room"): "Room-1",
			("URY Table", "T-01", "is_take_away"): 0,
		}.get((doctype, name, fieldname))
		mock_get_all.return_value = [self._waiter_printer(custom_waiter_print_format=None)]
		mock_build_combined.return_value = MagicMock(kot_items=[1])

		print_combined_waiter_order_slip("INV-001", ["KOT-1"], "T-01")
		mock_print_by_server.assert_not_called()
		mock_log_error.assert_called_once()

	@patch("ury.ury.api.ury_waiter_print.frappe.log_error")
	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.build_combined_kot_doc")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.exists")
	def test_skips_when_format_missing(
		self,
		mock_exists,
		mock_get_all,
		mock_get_value,
		mock_build_combined,
		mock_print_by_server,
		mock_log_error,
	):
		mock_exists.return_value = False
		mock_get_value.side_effect = lambda doctype, name, fieldname=None, **kwargs: {
			("URY Table", "T-01", "restaurant_room"): "Room-1",
			("URY Table", "T-01", "is_take_away"): 0,
		}.get((doctype, name, fieldname))
		mock_get_all.return_value = [self._waiter_printer()]
		mock_build_combined.return_value = MagicMock(kot_items=[1])

		print_combined_waiter_order_slip("INV-001", ["KOT-1"], "T-01")
		mock_print_by_server.assert_not_called()
		mock_log_error.assert_called_once()

	@patch("ury.ury.api.ury_waiter_print.frappe.log_error")
	@patch("ury.ury.api.ury_waiter_print.print_by_server")
	@patch("ury.ury.api.ury_waiter_print.build_combined_kot_doc")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_waiter_print.frappe.get_all")
	@patch("ury.ury.api.ury_waiter_print.frappe.db.exists")
	def test_skips_when_format_wrong_doctype(
		self,
		mock_exists,
		mock_get_all,
		mock_get_value,
		mock_build_combined,
		mock_print_by_server,
		mock_log_error,
	):
		mock_exists.return_value = True
		mock_get_value.side_effect = lambda doctype, name, fieldname=None, **kwargs: {
			("URY Table", "T-01", "restaurant_room"): "Room-1",
			("URY Table", "T-01", "is_take_away"): 0,
			("Print Format", WAITER_PRINT_FORMAT, "doc_type"): "POS Invoice",
		}.get((doctype, name, fieldname))
		mock_get_all.return_value = [self._waiter_printer()]
		mock_build_combined.return_value = MagicMock(kot_items=[1])

		print_combined_waiter_order_slip("INV-001", ["KOT-1"], "T-01")
		mock_print_by_server.assert_not_called()
		mock_log_error.assert_called_once()

	@patch("ury.ury.api.ury_waiter_print.print_combined_waiter_order_slip")
	@patch("ury.ury.api.ury_kot_generate.process_items_for_cancel_kot")
	@patch("ury.ury.api.ury_kot_generate.process_items_for_kot")
	@patch("ury.ury.api.ury_kot_generate.frappe.get_doc")
	def test_kot_execute_prints_once_with_all_created_kots(
		self,
		mock_get_doc,
		mock_process_kot,
		mock_process_cancel,
		mock_print_combined,
	):
		from ury.ury.api.ury_kot_generate import kot_execute

		pos_profile = MagicMock()
		pos_profile.custom_kot_naming_series = "KOT-"
		pos_profile.name = "POS-1"

		pos_invoice = MagicMock()
		pos_invoice.pos_profile = "POS-1"

		mock_get_doc.side_effect = [pos_invoice, pos_profile]
		mock_process_kot.return_value = ["KOT-1", "KOT-2"]
		mock_process_cancel.return_value = ["CNCL-1"]

		kot_execute(
			"INV-001",
			"Customer",
			"T-01",
			current_items=[
				{"item": "Pizza", "qty": 2, "item_name": "Pizza"},
				{"item": "Soup", "qty": 0, "item_name": "Soup"},
			],
			previous_items=[
				{"item": "Pizza", "qty": 1, "item_name": "Pizza"},
				{"item": "Soup", "qty": 1, "item_name": "Soup"},
			],
		)

		mock_print_combined.assert_called_once_with(
			"INV-001",
			["KOT-1", "KOT-2", "CNCL-1"],
			"T-01",
		)

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

	def test_waiter_format_excludes_pricing_sections(self):
		if not frappe.db.exists("Print Format", WAITER_PRINT_FORMAT):
			self.skipTest(f"Print Format '{WAITER_PRINT_FORMAT}' not found on site")

		print_format = frappe.get_doc("Print Format", WAITER_PRINT_FORMAT)
		if print_format.doc_type != "URY KOT":
			self.skipTest(
				f"Print Format '{WAITER_PRINT_FORMAT}' is not configured for URY KOT on site"
			)

		html = print_format.html.lower()
		for keyword in ("rate", "amount", "tax", "total", "payment", "grand"):
			self.assertNotIn(keyword, html)

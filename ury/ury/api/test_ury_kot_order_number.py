"""Tests for ury_kot_order_number.

Tests for the KOT order numbering module that assigns sequential order numbers
to POS Invoices based on the POS Opening Entry last invoice tracking.

Covers:
1. Order number calculation when last invoice exists (difference or fallback)
2. Order number initialization when no last invoice exists
3. Aggregators order type handling (with "AGR - " prefix)
4. Regular order type handling
5. Numbering rollover cases
6. POS Opening Entry initialization with last invoice references
"""

import unittest
from unittest.mock import MagicMock, patch

from ury.ury.api.ury_kot_order_number import (
	set_last_invoice_in_pos_open,
	set_order_number,
)


MODULE = "ury.ury.api.ury_kot_order_number"


class TestSetOrderNumber(unittest.TestCase):
	"""Test set_order_number function for POS Invoice order numbering."""

	def test_calculates_order_number_from_last_invoice_difference(self):
		"""When last_invoice exists in POS Opening Entry, order number is
		calculated as the difference between current and last invoice numbers.
		"""
		doc = MagicMock()
		doc.name = "POS-INV-00105"
		doc.pos_profile = "Main POS"
		doc.order_type = "Dine In"

		with patch(f"{MODULE}.frappe.get_value") as mock_get_value:
			mock_get_value.return_value = "POS-INV-00100"
			
			import frappe
			original_db = frappe.db
			try:
				mock_db = MagicMock()
				frappe.db = mock_db
				set_order_number(doc, "before_submit")
				calls = mock_db.set_value.call_args_list
				last_call = calls[-1]
				self.assertEqual(last_call[0][3], 5)
			finally:
				frappe.db = original_db

	def test_handles_order_number_rollover(self):
		"""When current invoice number is less than last invoice number,
		use current invoice number as the order number instead.
		"""
		doc = MagicMock()
		doc.name = "POS-INV-00003"
		doc.pos_profile = "Main POS"
		doc.order_type = "Dine In"

		with patch(f"{MODULE}.frappe.get_value") as mock_get_value:
			mock_get_value.return_value = "POS-INV-00100"
			
			import frappe
			original_db = frappe.db
			try:
				mock_db = MagicMock()
				frappe.db = mock_db
				set_order_number(doc, "before_submit")
				calls = mock_db.set_value.call_args_list
				last_call = calls[-1]
				self.assertEqual(last_call[0][3], 3)
			finally:
				frappe.db = original_db

	def test_aggregators_order_type_with_last_invoice(self):
		"""Aggregators orders get "AGR - " prefix when last invoice exists."""
		doc = MagicMock()
		doc.name = "POS-INV-00110"
		doc.pos_profile = "Main POS"
		doc.order_type = "Aggregators"

		with patch(f"{MODULE}.frappe.get_value") as mock_get_value:
			mock_get_value.return_value = "POS-INV-00105"
			
			import frappe
			original_db = frappe.db
			try:
				mock_db = MagicMock()
				frappe.db = mock_db
				set_order_number(doc, "before_submit")
				calls = mock_db.set_value.call_args_list
				last_call = calls[-1]
				self.assertEqual(last_call[0][3], "AGR - 5")
			finally:
				frappe.db = original_db

	def test_initializes_last_invoice_when_none_exists(self):
		"""When no last_invoice in POS Opening Entry, initialize it from
		the last doc in the system and set order number to default.
		"""
		doc = MagicMock()
		doc.name = "POS-INV-00050"
		doc.pos_profile = "Main POS"
		doc.order_type = "Dine In"

		with patch(f"{MODULE}.frappe.get_value") as mock_get_value, \
			 patch(f"{MODULE}.frappe.get_last_doc") as mock_get_last_doc:
			
			mock_get_value.side_effect = [None, "POS-OPEN-001"]
			
			last_doc = MagicMock()
			last_doc.name = "POS-INV-00049"
			mock_get_last_doc.return_value = last_doc
			
			import frappe
			original_db = frappe.db
			try:
				mock_db = MagicMock()
				frappe.db = mock_db
				set_order_number(doc, "before_submit")
				set_value_calls = mock_db.set_value.call_args_list
				self.assertEqual(set_value_calls[0][0][3], 48)
				self.assertEqual(set_value_calls[1][0][3], "1")
			finally:
				frappe.db = original_db

	def test_initializes_aggregators_with_default_agr_1(self):
		"""When initializing Aggregators order with no last invoice,
		set default to "AGR - 1".
		"""
		doc = MagicMock()
		doc.name = "POS-INV-00050"
		doc.pos_profile = "Main POS"
		doc.order_type = "Aggregators"

		with patch(f"{MODULE}.frappe.get_value") as mock_get_value, \
			 patch(f"{MODULE}.frappe.get_last_doc") as mock_get_last_doc:
			
			mock_get_value.side_effect = [None, "POS-OPEN-001"]
			last_doc = MagicMock()
			last_doc.name = "POS-INV-00049"
			mock_get_last_doc.return_value = last_doc
			
			import frappe
			original_db = frappe.db
			try:
				mock_db = MagicMock()
				frappe.db = mock_db
				set_order_number(doc, "before_submit")
				set_value_calls = mock_db.set_value.call_args_list
				self.assertEqual(set_value_calls[-1][0][3], "AGR - 1")
			finally:
				frappe.db = original_db

	def test_pos_profile_determines_sequence(self):
		"""Order numbers are per POS profile - profiles have independent sequences."""
		doc = MagicMock()
		doc.name = "POS-INV-00050"
		doc.pos_profile = "Secondary POS"
		doc.order_type = "Dine In"

		with patch(f"{MODULE}.frappe.get_value") as mock_get_value:
			mock_get_value.return_value = "POS-INV-00045"
			
			import frappe
			original_db = frappe.db
			try:
				mock_db = MagicMock()
				frappe.db = mock_db
				set_order_number(doc, "before_submit")
				self.assertTrue(mock_get_value.called)
			finally:
				frappe.db = original_db


class TestSetLastInvoiceInPosOpen(unittest.TestCase):
	"""Test set_last_invoice_in_pos_open function for POS Opening Entry."""

	def test_sets_last_regular_invoice(self):
		"""When creating POS Opening Entry, set custom_ury_last_invoice to
		the last non-Aggregator POS Invoice for that profile.
		"""
		doc = MagicMock()
		doc.pos_profile = "Main POS"

		with patch(f"{MODULE}.frappe.get_last_doc") as mock_get_last_doc:
			last_invoice = MagicMock()
			last_invoice.name = "POS-INV-00100"
			mock_get_last_doc.return_value = last_invoice
			set_last_invoice_in_pos_open(doc, "before_insert")
			self.assertEqual(doc.custom_ury_last_invoice, "POS-INV-00100")

	def test_sets_last_aggregator_invoice(self):
		"""When creating POS Opening Entry, also set custom_ury_last_aggregator_invoice."""
		doc = MagicMock()
		doc.pos_profile = "Main POS"

		with patch(f"{MODULE}.frappe.get_last_doc") as mock_get_last_doc:
			agg_invoice = MagicMock()
			agg_invoice.name = "POS-INV-00095"
			
			def get_last_doc_side_effect(doctype, filters=None):
				if filters and filters.get("order_type") == "Aggregators":
					return agg_invoice
				regular_inv = MagicMock()
				regular_inv.name = "POS-INV-00100"
				return regular_inv
			
			mock_get_last_doc.side_effect = get_last_doc_side_effect
			set_last_invoice_in_pos_open(doc, "before_insert")
			self.assertEqual(doc.custom_ury_last_aggregator_invoice, "POS-INV-00095")

	def test_handles_no_previous_invoices_gracefully(self):
		"""When no previous invoices exist, function should not fail."""
		doc = MagicMock()
		doc.pos_profile = "New POS"

		with patch(f"{MODULE}.frappe.get_last_doc") as mock_get_last_doc:
			mock_get_last_doc.side_effect = Exception("No document found")
			try:
				set_last_invoice_in_pos_open(doc, "before_insert")
			except Exception as e:
				self.fail(f"set_last_invoice_in_pos_open raised {e}")

	def test_sets_both_invoice_types(self):
		"""Both regular and aggregator invoices are set when they exist."""
		doc = MagicMock()
		doc.pos_profile = "Main POS"

		with patch(f"{MODULE}.frappe.get_last_doc") as mock_get_last_doc:
			regular_inv = MagicMock()
			regular_inv.name = "POS-INV-00100"
			agg_inv = MagicMock()
			agg_inv.name = "POS-INV-00090"
			
			def side_effect(doctype, filters=None):
				if filters and filters.get("order_type") == "Aggregators":
					return agg_inv
				return regular_inv
			
			mock_get_last_doc.side_effect = side_effect
			set_last_invoice_in_pos_open(doc, "before_insert")
			
			self.assertEqual(doc.custom_ury_last_invoice, "POS-INV-00100")
			self.assertEqual(doc.custom_ury_last_aggregator_invoice, "POS-INV-00090")


if __name__ == "__main__":
	unittest.main()

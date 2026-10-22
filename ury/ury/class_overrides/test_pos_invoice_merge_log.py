import unittest
from datetime import date, time
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.class_overrides.pos_invoice_merge_log import CustomPOSInvoiceMergeLog


class TestCustomPOSInvoiceMergeLog(FrappeTestCase):
	def test_get_sales_closing_time_and_date_with_closing_entry(self):
		orig_get_value = frappe.db.get_value

		def mock_db_get_value(doctype, filters, fieldname=None, as_dict=False, **kwargs):
			if doctype == "POS Closing Entry":
				return {
					"pos_profile": "Test POS Profile",
					"period_start_date": "2026-10-21 10:00:00",
				}
			if doctype == "POS Profile":
				return {
					"custom_sales_closing_time": "23:00:00",
					"custom_enable_opening_date": 1,
				}
			return orig_get_value(doctype, filters, fieldname=fieldname, as_dict=as_dict, **kwargs)

		with patch("frappe.db.get_value", side_effect=mock_db_get_value):
			merge_log = CustomPOSInvoiceMergeLog({"doctype": "POS Invoice Merge Log"})
			merge_log.pos_closing_entry = "POS-CLO-0001"

			closing_time, closing_date = merge_log.get_sales_closing_time_and_date()
			self.assertEqual(closing_time, time(23, 0, 0))
			self.assertEqual(closing_date, date(2026, 10, 21))

	def test_set_sales_closing_date_and_time(self):
		orig_get_value = frappe.db.get_value

		def mock_db_get_value(doctype, filters, fieldname=None, as_dict=False, **kwargs):
			if doctype == "POS Closing Entry":
				return {
					"pos_profile": "Test POS Profile",
					"period_start_date": "2026-10-21 10:00:00",
				}
			if doctype == "POS Profile":
				return {
					"custom_sales_closing_time": "23:00:00",
					"custom_enable_opening_date": 1,
				}
			return orig_get_value(doctype, filters, fieldname=fieldname, as_dict=as_dict, **kwargs)

		with patch("frappe.db.get_value", side_effect=mock_db_get_value):
			merge_log = CustomPOSInvoiceMergeLog({"doctype": "POS Invoice Merge Log"})
			merge_log.pos_closing_entry = "POS-CLO-0001"
			merge_log.posting_time = "14:30:00"
			merge_log.posting_date = "2026-10-22"

			merge_log.set_sales_closing_date_and_time()

			self.assertEqual(merge_log.posting_time, time(23, 0, 0))
			self.assertEqual(merge_log.posting_date, date(2026, 10, 21))

	def test_preserve_posting_when_not_configured(self):
		orig_get_value = frappe.db.get_value

		def mock_db_get_value(doctype, filters, fieldname=None, as_dict=False, **kwargs):
			if doctype == "POS Closing Entry":
				return {
					"pos_profile": "Standard Profile",
					"period_start_date": "2026-10-21 10:00:00",
				}
			if doctype == "POS Profile":
				return {
					"custom_sales_closing_time": None,
					"custom_enable_opening_date": 0,
				}
			return orig_get_value(doctype, filters, fieldname=fieldname, as_dict=as_dict, **kwargs)

		with patch("frappe.db.get_value", side_effect=mock_db_get_value):
			merge_log = CustomPOSInvoiceMergeLog({"doctype": "POS Invoice Merge Log"})
			merge_log.pos_closing_entry = "POS-CLO-0001"
			merge_log.posting_time = time(15, 0, 0)
			merge_log.posting_date = date(2026, 10, 22)

			merge_log.set_sales_closing_date_and_time()

			self.assertEqual(merge_log.posting_time, time(15, 0, 0))
			self.assertEqual(merge_log.posting_date, date(2026, 10, 22))

	def test_process_merging_into_sales_invoice(self):
		orig_get_value = frappe.db.get_value

		def mock_db_get_value(doctype, filters, fieldname=None, as_dict=False, **kwargs):
			if doctype == "POS Closing Entry":
				return {
					"pos_profile": "Test POS Profile",
					"period_start_date": "2026-10-21 10:00:00",
				}
			if doctype == "POS Profile":
				return {
					"custom_sales_closing_time": "23:00:00",
					"custom_enable_opening_date": 1,
				}
			return orig_get_value(doctype, filters, fieldname=fieldname, as_dict=as_dict, **kwargs)

		mock_sales_invoice = frappe._dict(
			name="SINV-TEST-0001",
			save=lambda: None,
			submit=lambda: None,
		)

		with patch("frappe.db.get_value", side_effect=mock_db_get_value):
			merge_log = CustomPOSInvoiceMergeLog({"doctype": "POS Invoice Merge Log"})
			merge_log.pos_closing_entry = "POS-CLO-0001"
			merge_log.get_new_sales_invoice = lambda: mock_sales_invoice
			merge_log.merge_pos_invoice_into = lambda sinv, data: sinv

			result = merge_log.process_merging_into_sales_invoice([])

			self.assertEqual(result.is_consolidated, 1)
			self.assertEqual(result.set_posting_time, 1)
			self.assertEqual(result.posting_date, date(2026, 10, 21))
			self.assertEqual(result.posting_time, time(23, 0, 0))
			self.assertEqual(merge_log.consolidated_invoice, "SINV-TEST-0001")

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# See license.txt
"""Happy-path data-logic tests for report_api/sales.py's financial reporting
endpoints (COVERAGE_GAP_ANALYSIS.md Table 1, Top 15 item #11: 8 whitelisted
sales-reporting functions with zero test reference; test_sales.py already
covers the negative-permission gate for all of them per TRACK.md's stated
acceptance criterion, but none of the actual query/normalization logic that
feeds the financial dashboards had a test). Administrator bypasses
require_manager(), so these run as Administrator and mock only
`frappe.db.sql` per this track's read-path convention -- never a real
POS Invoice fixture set for a dashboard-aggregation query.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.report_api import sales

MODULE = "ury.ury.report_api.sales"


class TestGetTodaySalesDataNormalization(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def test_null_sums_are_normalized_to_zero_when_no_invoices(self):
		# SUM()/COUNT() over zero matching rows: COUNT is 0, SUM columns NULL.
		row = {
			"total_invoices": 0,
			"item_total": None,
			"total_taxes_and_charges": None,
			"grand_total": None,
			"round_off": None,
			"cash_discounts": None,
		}
		with patch(f"{MODULE}.frappe.db.sql", return_value=[row]):
			result = sales.get_today_sales(branch=None, date="2026-01-15")

		self.assertEqual(result["total_invoices"], 0)
		self.assertEqual(result["item_total"], 0)
		self.assertEqual(result["grand_total"], 0)
		self.assertEqual(result["cash_discounts"], 0)
		self.assertEqual(result["query_date"], "2026-01-15")

	def test_populated_row_passes_through_computed_values(self):
		row = {
			"total_invoices": 12,
			"item_total": 5000.0,
			"total_taxes_and_charges": 250.0,
			"grand_total": 5250.0,
			"round_off": 0.5,
			"cash_discounts": 10.0,
		}
		# `branch` omitted -> all-branches, calendar-day boundary query
		# (no join, no branch_filter) -- see get_today_sales() docstring.
		with patch(f"{MODULE}.frappe.db.sql", return_value=[row]) as mock_sql:
			result = sales.get_today_sales(branch=None, date="2026-01-15")

		self.assertEqual(result["total_invoices"], 12)
		self.assertEqual(result["grand_total"], 5250.0)
		mock_sql.assert_called_once()
		# All-branches mode must NOT filter by branch.
		sql_text = mock_sql.call_args.args[0]
		self.assertNotIn("b.`branch` = %(branch)s", sql_text)

	def test_branch_scoped_query_includes_branch_filter_and_join(self):
		row = {
			"total_invoices": 3,
			"item_total": 100.0,
			"total_taxes_and_charges": 5.0,
			"grand_total": 105.0,
			"round_off": 0,
			"cash_discounts": 0,
		}
		with patch(f"{MODULE}.frappe.db.sql", return_value=[row]) as mock_sql:
			result = sales.get_today_sales(branch="Branch A", date="2026-01-15")

		sql_text = mock_sql.call_args.args[0]
		params = mock_sql.call_args.args[1]
		self.assertIn("b.`branch` = %(branch)s", sql_text)
		self.assertEqual(params["branch"], "Branch A")
		self.assertEqual(result["branch"], "Branch A")

	def test_defaults_to_today_when_no_date_given(self):
		row = {
			"total_invoices": 0, "item_total": None, "total_taxes_and_charges": None,
			"grand_total": None, "round_off": None, "cash_discounts": None,
		}
		with patch(f"{MODULE}.frappe.db.sql", return_value=[row]):
			result = sales.get_today_sales()
		self.assertEqual(result["query_date"], str(frappe.utils.today()))


class TestGetCancelledInvoicesPagination(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def test_page_and_page_size_are_clamped(self):
		count_row = [{"total": 0}]
		summary_row = [{
			"total_count": 0, "total_amount": None,
			"unique_cancellers": 0, "avg_amount": None,
		}]
		with patch(
			f"{MODULE}.frappe.db.sql",
			side_effect=[count_row, summary_row, []],
		):
			result = sales.get_cancelled_invoices(
				"2026-01-01", "2026-01-31", page=0, page_size=9999
			)

		# page clamped to >=1, page_size clamped to <=200
		self.assertEqual(result["pagination"]["page"], 1)
		self.assertEqual(result["pagination"]["page_size"], 200)

	def test_summary_nulls_normalized_to_zero(self):
		count_row = [{"total": 0}]
		summary_row = [{
			"total_count": 0, "total_amount": None,
			"unique_cancellers": 0, "avg_amount": None,
		}]
		with patch(
			f"{MODULE}.frappe.db.sql",
			side_effect=[count_row, summary_row, []],
		):
			result = sales.get_cancelled_invoices("2026-01-01", "2026-01-31")

		self.assertEqual(result["summary"]["total_amount"], 0)
		self.assertEqual(result["summary"]["avg_amount"], 0)
		self.assertEqual(result["pagination"]["total_pages"], 0)

	def test_total_pages_computed_via_ceiling_division(self):
		count_row = [{"total": 101}]
		summary_row = [{
			"total_count": 101, "total_amount": 5000.0,
			"unique_cancellers": 5, "avg_amount": 49.5,
		}]
		with patch(
			f"{MODULE}.frappe.db.sql",
			side_effect=[count_row, summary_row, []],
		):
			result = sales.get_cancelled_invoices(
				"2026-01-01", "2026-01-31", page=1, page_size=50
			)

		# 101 rows / 50 per page -> 3 pages
		self.assertEqual(result["pagination"]["total_pages"], 3)

	def test_row_amount_null_is_normalized_to_zero(self):
		count_row = [{"total": 1}]
		summary_row = [{
			"total_count": 1, "total_amount": 0,
			"unique_cancellers": 1, "avg_amount": 0,
		}]
		invoice_rows = [{
			"date": frappe.utils.getdate("2026-01-10"),
			"time": "10:00 AM",
			"invoice": "INV-0001",
			"amount": None,
			"cancelled_by": "user@test.com",
			"cancellation_reason": "Customer changed mind",
		}]
		with patch(
			f"{MODULE}.frappe.db.sql",
			side_effect=[count_row, summary_row, invoice_rows],
		):
			result = sales.get_cancelled_invoices("2026-01-01", "2026-01-31")

		self.assertEqual(result["invoices"][0]["amount"], 0)
		self.assertEqual(result["invoices"][0]["date"], "2026-01-10")

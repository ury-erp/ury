"""Unit tests for ury/ury/api/dashboard.py

Tests cover:
- get_dashboard_summary: summary stats with and without branch filtering
- get_dashboard_charts: chart data endpoint
- get_recent_transactions: transaction retrieval with error handling
- get_module_records: generic record fetching with branch/doctype validation
"""

from unittest.mock import patch, MagicMock

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.dashboard import (
    get_dashboard_summary,
    get_dashboard_charts,
    get_recent_transactions,
    get_module_records,
)


MODULE = "ury.ury.api.dashboard"


class TestGetDashboardSummary(FrappeTestCase):
    """Test get_dashboard_summary endpoint."""

    def test_summary_returns_required_fields(self):
        """Dashboard summary response includes all required metric fields."""
        with patch(f"{MODULE}.frappe.db.count") as mock_count, \
             patch(f"{MODULE}.frappe.db.exists") as mock_exists:
            mock_count.return_value = 5
            mock_exists.return_value = True

            result = get_dashboard_summary()

            # Verify all expected keys exist in response
            expected_keys = {
                "today_sales",
                "today_orders",
                "occupied_tables",
                "total_tables",
                "avg_order_value",
                "active_cashiers",
                "pending_kitchen_orders",
                "total_menu_items",
            }
            self.assertEqual(set(result.keys()), expected_keys)

    def test_summary_counts_ury_table_doctype(self):
        """Summary counts URY Table records when DocType exists."""
        with patch(f"{MODULE}.frappe.db.count") as mock_count, \
             patch(f"{MODULE}.frappe.db.exists") as mock_exists:
            mock_exists.return_value = True
            mock_count.return_value = 12

            result = get_dashboard_summary()

            # Verify frappe.db.count was called for "URY Table"
            calls = mock_count.call_args_list
            self.assertTrue(
                any(call[0][0] == "URY Table" for call in calls),
                "Should count URY Table records"
            )
            self.assertEqual(result["total_tables"], 12)

    def test_summary_handles_missing_ury_table_doctype(self):
        """Summary returns 0 for table count when URY Table DocType doesn't exist."""
        with patch(f"{MODULE}.frappe.db.count") as mock_count, \
             patch(f"{MODULE}.frappe.db.exists") as mock_exists:
            # URY Table doesn't exist, Item does
            def exists_side_effect(doctype, name=None):
                return name == "Item"
            def count_side_effect(doctype, filters=None):
                if doctype == "Item":
                    return 100
                return 0
            mock_exists.side_effect = exists_side_effect
            mock_count.side_effect = count_side_effect

            result = get_dashboard_summary()

            self.assertEqual(result["total_tables"], 0)
            self.assertEqual(result["total_menu_items"], 100)

    def test_summary_handles_missing_item_doctype(self):
        """Summary returns 0 for item count when Item DocType doesn't exist."""
        with patch(f"{MODULE}.frappe.db.count") as mock_count, \
             patch(f"{MODULE}.frappe.db.exists") as mock_exists:
            # Item doesn't exist, URY Table does
            def exists_side_effect(doctype, name=None):
                return name == "URY Table"
            def count_side_effect(doctype, filters=None):
                if doctype == "URY Table":
                    return 8
                return 0
            mock_exists.side_effect = exists_side_effect
            mock_count.side_effect = count_side_effect

            result = get_dashboard_summary()

            self.assertEqual(result["total_tables"], 8)
            self.assertEqual(result["total_menu_items"], 0)

    def test_summary_counts_active_users(self):
        """Summary counts enabled User records."""
        with patch(f"{MODULE}.frappe.db.count") as mock_count, \
             patch(f"{MODULE}.frappe.db.exists") as mock_exists:
            mock_exists.return_value = True
            # Mock count to return different values for different doctypes
            def count_side_effect(doctype, filters=None):
                if doctype == "User" and filters == {"enabled": 1}:
                    return 3
                return 0
            mock_count.side_effect = count_side_effect

            result = get_dashboard_summary()

            self.assertEqual(result["active_cashiers"], 3)

    def test_summary_with_branch_parameter_accepted(self):
        """Summary accepts branch parameter (currently ignored)."""
        with patch(f"{MODULE}.frappe.db.count") as mock_count, \
             patch(f"{MODULE}.frappe.db.exists") as mock_exists:
            mock_count.return_value = 5
            mock_exists.return_value = True

            # Should not raise error with branch parameter
            result = get_dashboard_summary(branch="Main Branch")
            self.assertIsInstance(result, dict)

    def test_summary_with_all_branch_parameter(self):
        """Summary handles branch='all' (no filtering)."""
        with patch(f"{MODULE}.frappe.db.count") as mock_count, \
             patch(f"{MODULE}.frappe.db.exists") as mock_exists:
            mock_count.return_value = 5
            mock_exists.return_value = True

            result = get_dashboard_summary(branch="all")
            self.assertIsInstance(result, dict)


class TestGetDashboardCharts(FrappeTestCase):
    """Test get_dashboard_charts endpoint."""

    def test_charts_returns_all_chart_types(self):
        """Charts endpoint returns all required chart data structures."""
        expected_charts = {
            "sales_trend",
            "hourly_sales",
            "payment_methods",
            "order_types",
            "top_items",
            "revenue_by_branch",
            "sales_by_course",
        }
        result = get_dashboard_charts()
        self.assertEqual(set(result.keys()), expected_charts)

    def test_charts_returns_list_values(self):
        """Each chart type is initialized as an empty list."""
        result = get_dashboard_charts()
        for chart_type, data in result.items():
            self.assertIsInstance(
                data,
                list,
                f"{chart_type} should be a list"
            )

    def test_charts_with_branch_parameter_accepted(self):
        """Charts endpoint accepts optional branch parameter."""
        result_no_branch = get_dashboard_charts()
        result_with_branch = get_dashboard_charts(branch="Main Branch")

        # Both should return same structure (branch filtering not yet implemented)
        self.assertEqual(set(result_no_branch.keys()), set(result_with_branch.keys()))

    def test_charts_with_all_branch_parameter(self):
        """Charts endpoint handles branch='all'."""
        result = get_dashboard_charts(branch="all")
        self.assertIsInstance(result, dict)


class TestGetRecentTransactions(FrappeTestCase):
    """Test get_recent_transactions endpoint."""

    def test_transactions_retrieves_pos_invoices(self):
        """Transactions endpoint fetches POS Invoice records."""
        mock_invoices = [
            {
                "name": "POS-001",
                "customer": "John Doe",
                "posting_date": "2026-09-09",
                "posting_time": "10:30:00",
                "grand_total": 500,
                "status": "Paid",
                "docstatus": 1,
            }
        ]
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = mock_invoices

            result = get_recent_transactions()

            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["name"], "POS-001")
            mock_get_all.assert_called_once()

    def test_transactions_applies_default_limit(self):
        """Transactions endpoint applies default limit=10."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = []

            get_recent_transactions()

            # Verify limit was applied
            called_kwargs = mock_get_all.call_args.kwargs
            self.assertEqual(called_kwargs.get("limit"), 10)

    def test_transactions_respects_custom_limit(self):
        """Transactions endpoint respects custom limit parameter."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = []

            get_recent_transactions(limit=25)

            called_kwargs = mock_get_all.call_args.kwargs
            self.assertEqual(called_kwargs.get("limit"), 25)

    def test_transactions_converts_limit_to_int(self):
        """Transactions endpoint converts limit to integer."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = []

            # Pass limit as string
            get_recent_transactions(limit="5")

            called_kwargs = mock_get_all.call_args.kwargs
            self.assertEqual(called_kwargs.get("limit"), 5)
            self.assertIsInstance(called_kwargs.get("limit"), int)

    def test_transactions_sets_default_status_when_missing(self):
        """Transactions endpoint sets default status if not present."""
        mock_invoices = [
            {
                "name": "POS-001",
                "customer": "John Doe",
                "docstatus": 0,  # Draft
                "status": None,
            }
        ]
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = mock_invoices

            result = get_recent_transactions()

            self.assertEqual(result[0]["status"], "Draft")

    def test_transactions_sets_default_status_paid_for_submitted(self):
        """Transactions sets status='Paid' for submitted (docstatus=1) invoices."""
        mock_invoices = [
            {
                "name": "POS-001",
                "customer": "John Doe",
                "docstatus": 1,  # Submitted
                "status": None,
            }
        ]
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = mock_invoices

            result = get_recent_transactions()

            self.assertEqual(result[0]["status"], "Paid")

    def test_transactions_sets_default_order_type_when_missing(self):
        """Transactions sets default order_type if not present."""
        mock_invoices = [
            {
                "name": "POS-001",
                "customer": "John Doe",
                "order_type": None,
            }
        ]
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = mock_invoices

            result = get_recent_transactions()

            self.assertEqual(result[0]["order_type"], "Dine In")

    def test_transactions_returns_empty_list_when_pos_invoice_missing(self):
        """Transactions returns empty list when POS Invoice DocType doesn't exist."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists:
            mock_exists.return_value = False

            result = get_recent_transactions()

            self.assertEqual(result, [])

    def test_transactions_handles_exception_gracefully(self):
        """Transactions catches exceptions and returns empty list."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all, \
             patch(f"{MODULE}.frappe.log_error") as mock_log_error:
            mock_exists.return_value = True
            mock_get_all.side_effect = Exception("Database error")

            result = get_recent_transactions()

            self.assertEqual(result, [])
            mock_log_error.assert_called_once()

    def test_transactions_filters_by_docstatus(self):
        """Transactions filters for draft (0) and submitted (1) invoices."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = []

            get_recent_transactions()

            called_kwargs = mock_get_all.call_args.kwargs
            called_filters = called_kwargs.get("filters")
            self.assertIn("docstatus", called_filters)
            self.assertEqual(called_filters["docstatus"], ["in", [0, 1]])

    def test_transactions_orders_by_creation_desc(self):
        """Transactions orders results by creation descending."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = []

            get_recent_transactions()

            called_kwargs = mock_get_all.call_args.kwargs
            self.assertEqual(called_kwargs.get("order_by"), "creation desc")

    def test_transactions_with_branch_parameter_accepted(self):
        """Transactions accepts branch parameter (currently ignored)."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = []

            result = get_recent_transactions(branch="Main Branch")
            self.assertIsInstance(result, list)


class TestGetModuleRecords(FrappeTestCase):
    """Test get_module_records endpoint."""

    def test_module_records_returns_all_records_for_doctype(self):
        """Module records fetches all records for a given DocType."""
        mock_records = [
            {"name": "ITEM-001", "item_name": "Cake"},
            {"name": "ITEM-002", "item_name": "Coffee"},
        ]
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = mock_records

            result = get_module_records("Item")

            self.assertEqual(len(result), 2)
            self.assertEqual(result[0]["name"], "ITEM-001")
            self.assertEqual(result[1]["name"], "ITEM-002")

    def test_module_records_returns_empty_when_doctype_missing(self):
        """Module records returns empty list when DocType doesn't exist."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists:
            mock_exists.return_value = False

            result = get_module_records("NonExistentDocType")

            self.assertEqual(result, [])

    def test_module_records_handles_exception_gracefully(self):
        """Module records catches exceptions and returns empty list."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.side_effect = Exception("Database error")

            result = get_module_records("Item")

            self.assertEqual(result, [])

    def test_module_records_filters_by_branch_field(self):
        """Module records filters by 'branch' field when available."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_meta") as mock_get_meta, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_meta = MagicMock()
            mock_meta.has_field.side_effect = lambda field: field == "branch"
            mock_get_meta.return_value = mock_meta
            mock_get_all.return_value = []

            get_module_records("URY Table", branch="Main Branch")

            called_kwargs = mock_get_all.call_args.kwargs
            called_filters = called_kwargs.get("filters")
            self.assertEqual(called_filters.get("branch"), "Main Branch")

    def test_module_records_filters_by_custom_branch_field(self):
        """Module records falls back to 'custom_branch' field when 'branch' unavailable."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_meta") as mock_get_meta, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_meta = MagicMock()
            # has_branch returns False, has_custom_branch returns True
            mock_meta.has_field.side_effect = lambda field: field == "custom_branch"
            mock_get_meta.return_value = mock_meta
            mock_get_all.return_value = []

            get_module_records("POS Invoice", branch="Main Branch")

            called_kwargs = mock_get_all.call_args.kwargs
            called_filters = called_kwargs.get("filters")
            self.assertEqual(called_filters.get("custom_branch"), "Main Branch")

    def test_module_records_no_filter_when_branch_field_missing(self):
        """Module records doesn't filter branch when field doesn't exist on DocType."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_meta") as mock_get_meta, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_meta = MagicMock()
            mock_meta.has_field.return_value = False  # No branch or custom_branch
            mock_get_meta.return_value = mock_meta
            mock_get_all.return_value = []

            get_module_records("User", branch="Main Branch")

            called_kwargs = mock_get_all.call_args.kwargs
            called_filters = called_kwargs.get("filters")
            # Filters should be empty (branch not applied)
            self.assertEqual(called_filters, {})

    def test_module_records_ignores_all_branch_value(self):
        """Module records doesn't filter when branch='all' (passes through)."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_meta") as mock_get_meta, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_meta = MagicMock()
            mock_meta.has_field.return_value = False
            mock_get_meta.return_value = mock_meta
            mock_get_all.return_value = []

            get_module_records("Item", branch="all")

            # With branch='all', the code doesn't enter the branch check block
            called_kwargs = mock_get_all.call_args.kwargs
            called_filters = called_kwargs.get("filters")
            # Note: the actual code has `if branch and branch != 'all': pass`
            # so filtering is skipped for 'all'
            self.assertEqual(called_filters, {})

    def test_module_records_requests_all_fields(self):
        """Module records fetches all fields ('*')."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = []

            get_module_records("Item")

            called_kwargs = mock_get_all.call_args.kwargs
            self.assertEqual(called_kwargs.get("fields"), ["*"])

    def test_module_records_with_no_branch_parameter(self):
        """Module records works without branch parameter."""
        with patch(f"{MODULE}.frappe.db.exists") as mock_exists, \
             patch(f"{MODULE}.frappe.get_all") as mock_get_all:
            mock_exists.return_value = True
            mock_get_all.return_value = []

            result = get_module_records("Item")

            self.assertEqual(result, [])
            called_kwargs = mock_get_all.call_args.kwargs
            called_filters = called_kwargs.get("filters")
            self.assertEqual(called_filters, {})

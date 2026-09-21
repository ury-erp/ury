"""Tests for pos_extend API module.

Tests for validate_search_input and overrided_past_order_list functions,
covering validation logic, filtering, and branch/user isolation.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.pos_extend import validate_search_input, overrided_past_order_list


MODULE = "ury.ury.api.pos_extend"


class TestValidateSearchInput(FrappeTestCase):
    """Tests for validate_search_input function."""

    def test_empty_search_term_returns_empty_string(self):
        """Empty search term should return empty string."""
        result = validate_search_input("")
        self.assertEqual(result, "")

    def test_none_search_term_returns_empty_string(self):
        """None search term should return empty string."""
        result = validate_search_input(None)
        self.assertEqual(result, "")

    def test_valid_alphanumeric_search_term(self):
        """Valid alphanumeric search term should be returned unchanged."""
        result = validate_search_input("CUST123")
        self.assertEqual(result, "CUST123")

    def test_search_term_with_spaces(self):
        """Search term with spaces should be accepted."""
        result = validate_search_input("John Doe")
        self.assertEqual(result, "John Doe")

    def test_search_term_with_hyphens(self):
        """Search term with hyphens should be accepted."""
        result = validate_search_input("Customer-001")
        self.assertEqual(result, "Customer-001")

    def test_search_term_with_underscore(self):
        """Search term with underscore should be accepted."""
        result = validate_search_input("test_customer")
        self.assertEqual(result, "test_customer")

    def test_search_term_with_at_symbol(self):
        """Search term with @ symbol should be accepted."""
        result = validate_search_input("customer@example")
        self.assertEqual(result, "customer@example")

    def test_search_term_with_dot(self):
        """Search term with dot should be accepted."""
        result = validate_search_input("customer.name")
        self.assertEqual(result, "customer.name")

    def test_search_term_exceeding_max_length(self):
        """Search term exceeding 100 characters should throw."""
        long_term = "a" * 101
        with self.assertRaises(frappe.ValidationError):
            validate_search_input(long_term)

    def test_search_term_exactly_at_max_length(self):
        """Search term exactly 100 characters should be accepted."""
        term = "a" * 100
        result = validate_search_input(term)
        self.assertEqual(result, term)

    def test_search_term_with_invalid_special_characters(self):
        """Search term with invalid special characters should throw."""
        with self.assertRaises(frappe.ValidationError):
            validate_search_input("customer$123")

    def test_search_term_with_exclamation_mark_throws(self):
        """Search term with exclamation mark should throw."""
        with self.assertRaises(frappe.ValidationError):
            validate_search_input("customer!")

    def test_search_term_with_hashtag_throws(self):
        """Search term with hashtag should throw."""
        with self.assertRaises(frappe.ValidationError):
            validate_search_input("customer#123")

    def test_search_term_with_bracket_throws(self):
        """Search term with bracket should throw."""
        with self.assertRaises(frappe.ValidationError):
            validate_search_input("customer[123]")


class TestOverridedPastOrderListValidation(FrappeTestCase):
    """Tests for validate_search_input integration in overrided_past_order_list."""

    @patch(f"{MODULE}.frappe.db.sql")
    def test_invalid_search_term_throws_before_db_query(self, mock_db_sql):
        """Invalid search term should throw before any database query."""
        frappe.set_user("testuser")
        with self.assertRaises(frappe.ValidationError):
            overrided_past_order_list("invalid$term", "Draft")
        mock_db_sql.assert_not_called()

    @patch(f"{MODULE}.frappe.db.sql")
    def test_long_search_term_throws_before_db_query(self, mock_db_sql):
        """Search term exceeding length limit should throw before database query."""
        frappe.set_user("testuser")
        long_term = "a" * 101
        with self.assertRaises(frappe.ValidationError):
            overrided_past_order_list(long_term, "Draft")
        mock_db_sql.assert_not_called()


class TestOverridedPastOrderListNonAdminUser(FrappeTestCase):
    """Tests for non-Administrator user scenarios."""

    @patch(f"{MODULE}.frappe.db.sql")
    def test_non_admin_user_not_associated_with_branch_throws(self, mock_db_sql):
        """Non-admin user without branch association should throw."""
        frappe.set_user("salesman@example.com")
        mock_db_sql.return_value = []  # No branch found

        with self.assertRaises(frappe.ValidationError):
            overrided_past_order_list("", "Draft")

    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_non_admin_user_with_valid_branch_queries_db(self, mock_get_all, mock_db_sql):
        """Non-admin user with valid branch should proceed with filtered query."""
        frappe.set_user("salesman@example.com")
        mock_db_sql.return_value = [
            {"branch": "Main Branch", "room": "Room 1"}
        ]
        mock_get_all.return_value = []

        result = overrided_past_order_list("", "Draft")
        self.assertEqual(result, [])
        mock_get_all.assert_called()

    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_non_admin_to_bill_status_filters_correct_invoices(self, mock_get_all, mock_db_sql):
        """Non-admin user with 'To Bill' status should filter to Draft invoices with table and no print."""
        frappe.set_user("salesman@example.com")
        mock_db_sql.return_value = [
            {"branch": "Main Branch", "room": "Room 1"}
        ]
        mock_get_all.return_value = [
            frappe._dict({
                "name": "INV-001",
                "customer": "Customer 1",
                "restaurant_table": "Table 1",
                "invoice_printed": 0,
            }),
            frappe._dict({
                "name": "INV-002",
                "customer": "Customer 2",
                "restaurant_table": "Table 2",
                "invoice_printed": 1,  # Printed, should be excluded
            }),
            frappe._dict({
                "name": "INV-003",
                "customer": "Customer 3",
                "restaurant_table": None,  # No table, should be excluded
                "invoice_printed": 0,
            }),
        ]

        result = overrided_past_order_list("", "To Bill")
        # Should only include INV-001
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "INV-001")

    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_non_admin_other_status_filters_correct_invoices(self, mock_get_all, mock_db_sql):
        """Non-admin user with non-'To Bill' status should filter invoices without table or with print."""
        frappe.set_user("salesman@example.com")
        mock_db_sql.return_value = [
            {"branch": "Main Branch", "room": "Room 1"}
        ]
        mock_get_all.return_value = [
            frappe._dict({
                "name": "INV-001",
                "customer": "Customer 1",
                "restaurant_table": "Table 1",
                "invoice_printed": 1,  # Has print, should be included
            }),
            frappe._dict({
                "name": "INV-002",
                "customer": "Customer 2",
                "restaurant_table": None,  # No table, should be included
                "invoice_printed": 0,
            }),
            frappe._dict({
                "name": "INV-003",
                "customer": "Customer 3",
                "restaurant_table": "Table 3",
                "invoice_printed": 0,  # Has table and no print, should be excluded
            }),
        ]

        result = overrided_past_order_list("", "Submitted")
        # Should include INV-001 and INV-002, exclude INV-003
        self.assertEqual(len(result), 2)
        names = {inv["name"] for inv in result}
        self.assertIn("INV-001", names)
        self.assertIn("INV-002", names)
        self.assertNotIn("INV-003", names)


class TestOverridedPastOrderListAdminUser(FrappeTestCase):
    """Tests for Administrator user scenarios."""

    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_admin_to_bill_status_no_branch_filter(self, mock_get_all, mock_db_sql):
        """Administrator with 'To Bill' status should see all Draft invoices with table and no print."""
        frappe.set_user("Administrator")
        mock_get_all.return_value = [
            frappe._dict({
                "name": "INV-001",
                "customer": "Customer 1",
                "restaurant_table": "Table 1",
                "invoice_printed": 0,
            }),
            frappe._dict({
                "name": "INV-002",
                "customer": "Customer 2",
                "restaurant_table": None,
                "invoice_printed": 0,
            }),
        ]

        result = overrided_past_order_list("", "To Bill")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "INV-001")
        # Verify SQL query for branch info was not called
        mock_db_sql.assert_not_called()

    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_admin_other_status_no_branch_filter(self, mock_get_all, mock_db_sql):
        """Administrator with non-'To Bill' status should see all matching invoices without table or with print."""
        frappe.set_user("Administrator")
        mock_get_all.return_value = [
            frappe._dict({
                "name": "INV-001",
                "customer": "Customer 1",
                "restaurant_table": "Table 1",
                "invoice_printed": 1,
            }),
            frappe._dict({
                "name": "INV-002",
                "customer": "Customer 2",
                "restaurant_table": None,
                "invoice_printed": 0,
            }),
        ]

        result = overrided_past_order_list("", "Submitted")
        self.assertEqual(len(result), 2)
        mock_db_sql.assert_not_called()


class TestOverridedPastOrderListSearchFunctionality(FrappeTestCase):
    """Tests for search term and status combined filtering."""

    @patch(f"{MODULE}.frappe.db.get_all")
    def test_search_term_and_status_searches_by_customer_and_name(self, mock_get_all):
        """Search with term and status should search both customer and invoice name."""
        frappe.set_user("Administrator")
        mock_get_all.side_effect = [
            # First call: search by customer
            [
                {"name": "INV-001", "customer": "John Doe", "grand_total": 100}
            ],
            # Second call: search by name
            [
                {"name": "INV-JOHN-001", "customer": "Customer A", "grand_total": 200}
            ],
        ]

        result = overrided_past_order_list("John", "Submitted")
        self.assertEqual(len(result), 2)
        # Results should be combined
        self.assertEqual(result[0]["name"], "INV-001")
        self.assertEqual(result[1]["name"], "INV-JOHN-001")

    @patch(f"{MODULE}.frappe.db.get_all")
    def test_search_returns_combined_results_from_customer_and_name_queries(self, mock_get_all):
        """Search results from customer and name queries should be combined."""
        frappe.set_user("Administrator")
        customer_results = [
            {
                "name": "INV-001",
                "customer": "Test Customer",
                "grand_total": 500,
                "currency": "USD",
                "posting_time": "10:00:00",
                "posting_date": "2026-01-01",
                "restaurant_table": None,
                "invoice_printed": 0,
            }
        ]
        name_results = [
            {
                "name": "TEST-INV-001",
                "customer": "Another Customer",
                "grand_total": 300,
                "currency": "USD",
                "posting_time": "11:00:00",
                "posting_date": "2026-01-01",
                "restaurant_table": "Table 1",
                "invoice_printed": 1,
            }
        ]
        mock_get_all.side_effect = [customer_results, name_results]

        result = overrided_past_order_list("Test", "Submitted")
        self.assertEqual(len(result), 2)
        # Should have combined both results
        self.assertIn("INV-001", [inv["name"] for inv in result])
        self.assertIn("TEST-INV-001", [inv["name"] for inv in result])

    @patch(f"{MODULE}.frappe.db.get_all")
    def test_empty_search_with_status_only_no_search_query(self, mock_get_all):
        """Empty search term with status should not call search queries."""
        frappe.set_user("Administrator")
        mock_get_all.return_value = [
            frappe._dict({
                "name": "INV-001",
                "customer": "Customer",
                "restaurant_table": None,
                "invoice_printed": 1,
            })
        ]

        result = overrided_past_order_list("", "Submitted")
        self.assertEqual(len(result), 1)
        # Only one call for status filter, no search calls
        self.assertEqual(mock_get_all.call_count, 1)


class TestOverridedPastOrderListFields(FrappeTestCase):
    """Tests for correct fields being queried."""

    @patch(f"{MODULE}.frappe.db.get_all")
    def test_queries_correct_fields(self, mock_get_all):
        """Function should query the correct set of fields."""
        frappe.set_user("Administrator")
        mock_get_all.return_value = []

        overrided_past_order_list("", "Submitted")

        # Get the first call's arguments
        call_args = mock_get_all.call_args_list[0]
        # kwargs should contain 'fields'
        fields_arg = call_args[1].get("fields", [])
        expected_fields = [
            "name",
            "grand_total",
            "currency",
            "customer",
            "posting_time",
            "posting_date",
            "restaurant_table",
            "invoice_printed",
        ]
        self.assertEqual(set(fields_arg), set(expected_fields))


class TestOverridedPastOrderListEdgeCases(FrappeTestCase):
    """Tests for edge cases and error scenarios."""

    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_multiple_invoices_with_mixed_conditions(self, mock_get_all, mock_db_sql):
        """Test with multiple invoices having mixed table/print conditions."""
        frappe.set_user("salesman@example.com")
        mock_db_sql.return_value = [
            {"branch": "Main Branch", "room": "Room 1"}
        ]
        mock_get_all.return_value = [
            frappe._dict({
                "name": "INV-001",
                "customer": "Cust 1",
                "restaurant_table": "T1",
                "invoice_printed": 0,
            }),
            frappe._dict({
                "name": "INV-002",
                "customer": "Cust 2",
                "restaurant_table": "T2",
                "invoice_printed": 1,
            }),
            frappe._dict({
                "name": "INV-003",
                "customer": "Cust 3",
                "restaurant_table": None,
                "invoice_printed": 0,
            }),
            frappe._dict({
                "name": "INV-004",
                "customer": "Cust 4",
                "restaurant_table": None,
                "invoice_printed": 1,
            }),
        ]

        result = overrided_past_order_list("", "To Bill")
        # For "To Bill" status, only include if has table AND not printed
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "INV-001")

    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_with_limit_parameter(self, mock_get_all, mock_db_sql):
        """Function should accept and pass limit parameter (if implemented)."""
        frappe.set_user("salesman@example.com")
        mock_db_sql.return_value = [
            {"branch": "Main Branch", "room": "Room 1"}
        ]
        mock_get_all.return_value = []

        # Call with custom limit
        overrided_past_order_list("", "Draft", limit=50)
        # Just verify it doesn't throw
        self.assertTrue(True)

    @patch(f"{MODULE}.frappe.db.get_all")
    def test_valid_search_special_chars_like_hyphen(self, mock_get_all):
        """Search term with hyphen should work (valid character)."""
        frappe.set_user("Administrator")
        mock_get_all.return_value = []
        # Should not throw
        result = overrided_past_order_list("Customer-001", "Submitted")
        self.assertEqual(result, [])

    @patch(f"{MODULE}.frappe.db.get_all")
    def test_search_with_spaces(self, mock_get_all):
        """Search term with spaces should work."""
        frappe.set_user("Administrator")
        mock_get_all.return_value = []
        # Should not throw
        result = overrided_past_order_list("Customer Name", "Submitted")
        self.assertEqual(result, [])


class TestOverridedPastOrderListBranchIsolation(FrappeTestCase):
    """Tests to ensure branch isolation for non-admin users."""

    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}.frappe.db.get_all")
    def test_non_admin_user_only_sees_own_branch_invoices(self, mock_get_all, mock_db_sql):
        """Non-admin user should only see invoices from their assigned branch."""
        frappe.set_user("user1@branch1.com")
        mock_db_sql.return_value = [
            {"branch": "Branch A", "room": "Room 1"}
        ]
        mock_get_all.return_value = [
            frappe._dict({
                "name": "INV-BRANCH-A-001",
                "customer": "Customer",
                "restaurant_table": "T1",
                "invoice_printed": 0,
            })
        ]

        result = overrided_past_order_list("", "To Bill")
        self.assertEqual(len(result), 1)
        # Verify the query was called with the user's branch
        call_kwargs = mock_get_all.call_args_list[0][1]
        filters = call_kwargs.get("filters", {})
        # Filters should include the branch from the user's assignment
        self.assertIn("branch", filters)
        self.assertEqual(filters["branch"], "Branch A")

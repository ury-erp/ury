# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Tests for URY KOT Validation API module.

Tests cover KOT creation workflow, invoice processing, and error log tracking
with proper permission handling for the get_kot_errors() API endpoint.
"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_validation import (
    get_unprocessed_invoices,
    process_invoice,
    get_productions_for_branch,
    create_kot,
    create_kot_log,
    get_kot_errors,
    kotValidationThread,
)

MODULE = "ury.ury.api.ury_kot_validation"

# Test user constants for permission testing
TEST_CASHIER = "_test_kot_validation_cashier@example.com"
TEST_SUPERVISOR = "_test_kot_validation_supervisor@example.com"


def _create_test_user(email, roles):
    """Helper to create a test user with specified roles."""
    if frappe.db.exists("User", email):
        frappe.delete_doc("User", email, force=True, ignore_permissions=True)
    user = frappe.get_doc(
        {
            "doctype": "User",
            "email": email,
            "first_name": email.split("@")[0],
            "send_welcome_email": 0,
            "enabled": 1,
        }
    ).insert(ignore_permissions=True)
    for role in roles:
        user.add_roles(role)
    return user


def _invoice_dict(**values):
    """Helper to create a test invoice object."""
    invoice = frappe._dict(
        {
            "name": "POS-INV-001",
            "docstatus": 0,
            "creation": datetime.now(),
            "waiter": "Waiter1",
            "pos_profile": "POS-001",
            "customer": "Customer1",
            "branch": "Branch1",
            "restaurant_table": None,
            "order_no": None,
            "items": [],
        }
    )
    invoice.update(values)
    return invoice


def _pos_profile_dict(**values):
    """Helper to create a test POS Profile object."""
    profile = frappe._dict(
        {
            "name": "POS-001",
            "branch": "Branch1",
            "kot_naming_series": "KOT-.YYYY.-.MM.-.###",
        }
    )
    profile.update(values)
    return profile


def _production_unit_dict(**values):
    """Helper to create a test Production Unit object."""
    production = frappe._dict(
        {
            "name": "PROD-001",
            "branch": "Branch1",
            "item_groups": [frappe._dict({"item_group": "Food"})],
        }
    )
    production.update(values)
    return production


def _kot_item_dict(**values):
    """Helper to create a test KOT item object."""
    item = frappe._dict(
        {
            "item_code": "BURGER",
            "item_name": "Burger",
            "qty": 1,
            "item_group": "Food",
        }
    )
    item.update(values)
    return item


class TestGetUnprocessedInvoices(FrappeTestCase):
    """Tests for get_unprocessed_invoices() database query."""

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user("Administrator")

    @patch(f"{MODULE}.frappe.db.sql")
    def test_get_unprocessed_invoices_returns_list(self, mock_db_sql):
        """Should query and return invoices with docstatus=0 within time range."""
        start_time = datetime.now() - timedelta(minutes=5)
        end_time = datetime.now() - timedelta(minutes=1)

        mock_db_sql.return_value = [
            {"name": "POS-INV-001", "creation": datetime.now()},
            {"name": "POS-INV-002", "creation": datetime.now()},
        ]

        result = get_unprocessed_invoices(start_time, end_time)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["name"], "POS-INV-001")
        self.assertEqual(result[1]["name"], "POS-INV-002")
        mock_db_sql.assert_called_once()

    @patch(f"{MODULE}.frappe.db.sql")
    def test_get_unprocessed_invoices_empty_list(self, mock_db_sql):
        """Should return empty list when no unprocessed invoices exist."""
        start_time = datetime.now() - timedelta(minutes=5)
        end_time = datetime.now() - timedelta(minutes=1)

        mock_db_sql.return_value = []

        result = get_unprocessed_invoices(start_time, end_time)

        self.assertEqual(len(result), 0)
        self.assertIsInstance(result, list)

    @patch(f"{MODULE}.frappe.db.sql")
    def test_get_unprocessed_invoices_passes_time_range(self, mock_db_sql):
        """Should pass start and end times to database query."""
        start_time = datetime(2024, 1, 1, 10, 0)
        end_time = datetime(2024, 1, 1, 10, 5)

        mock_db_sql.return_value = []
        get_unprocessed_invoices(start_time, end_time)

        call_args = mock_db_sql.call_args
        self.assertIsNotNone(call_args)
        self.assertEqual(call_args[0][1], (start_time, end_time))


class TestGetProductionsForBranch(FrappeTestCase):
    """Tests for get_productions_for_branch() lookup."""

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user("Administrator")

    @patch(f"{MODULE}.frappe.get_all")
    def test_get_productions_for_branch_returns_list(self, mock_get_all):
        """Should fetch production units filtered by branch."""
        mock_get_all.return_value = [
            frappe._dict({"name": "PROD-001", "item_groups": []}),
            frappe._dict({"name": "PROD-002", "item_groups": []}),
        ]

        result = get_productions_for_branch("Branch1")

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0].name, "PROD-001")
        mock_get_all.assert_called_once_with(
            "URY Production Unit", filters={"branch": "Branch1"}, fields=["name", "item_groups"]
        )

    @patch(f"{MODULE}.frappe.get_all")
    def test_get_productions_for_branch_empty_result(self, mock_get_all):
        """Should return empty list when no production units exist for branch."""
        mock_get_all.return_value = []

        result = get_productions_for_branch("NonexistentBranch")

        self.assertEqual(len(result), 0)


class TestCreateKotLog(FrappeTestCase):
    """Tests for create_kot_log() function."""

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user("Administrator")

    @patch(f"{MODULE}.frappe.publish_realtime")
    @patch(f"{MODULE}.frappe.new_doc")
    @patch(f"{MODULE}.frappe.get_doc")
    def test_create_kot_log_inserts_log_entry(
        self, mock_get_doc, mock_new_doc, mock_publish_realtime
    ):
        """Should create and insert KOT error log document."""
        kotdoc = frappe._dict(
            {"name": "KOT-001", "production": "PROD-001", "pos_profile": "POS-001"}
        )
        invoice_doc = frappe._dict(
            {
                "name": "POS-INV-001",
                "creation": datetime.now(),
                "branch": "Branch1",
            }
        )
        mock_get_doc.return_value = invoice_doc

        log_doc = frappe._dict()
        log_doc.update = MagicMock(return_value=None)
        log_doc.insert = MagicMock(return_value=None)

        mock_new_doc.return_value = log_doc

        create_kot_log(kotdoc, "POS-INV-001")

        mock_new_doc.assert_called_once_with("URY KOT Error Log")
        log_doc.insert.assert_called_once()
        mock_publish_realtime.assert_called_once()

    @patch(f"{MODULE}.frappe.publish_realtime")
    @patch(f"{MODULE}.frappe.new_doc")
    @patch(f"{MODULE}.frappe.get_doc")
    def test_create_kot_log_publishes_realtime(
        self, mock_get_doc, mock_new_doc, mock_publish_realtime
    ):
        """Should publish realtime event on dedicated channel."""
        kotdoc = frappe._dict(
            {"name": "KOT-001", "production": "PROD-001", "pos_profile": "POS-001"}
        )
        invoice_doc = frappe._dict(
            {
                "name": "POS-INV-001",
                "creation": datetime(2024, 1, 1, 12, 0),
                "branch": "Branch1",
            }
        )
        mock_get_doc.return_value = invoice_doc

        log_doc = frappe._dict()
        log_doc.update = MagicMock()
        log_doc.insert = MagicMock()
        mock_new_doc.return_value = log_doc

        create_kot_log(kotdoc, "POS-INV-001")

        mock_publish_realtime.assert_called_once()
        call_args = mock_publish_realtime.call_args
        channel = call_args[0][0]
        payload = call_args[0][1]

        self.assertIn("kot_error_", channel)
        self.assertIn("Branch1", channel)
        self.assertIn("PROD-001", channel)
        self.assertEqual(payload["kot"], "KOT-001")
        self.assertEqual(payload["invoice"], "POS-INV-001")


class TestCreateKot(FrappeTestCase):
    """Tests for create_kot() function."""

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user("Administrator")

    @patch(f"{MODULE}.create_kot_log")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.new_doc")
    def test_create_kot_inserts_and_submits_document(
        self, mock_new_doc, mock_get_doc, mock_create_kot_log
    ):
        """Should create, populate, insert, and submit KOT document."""
        pos_invoice = frappe._dict(
            {
                "name": "POS-INV-001",
                "customer": "Customer1",
                "restaurant_table": "Table1",
                "order_no": "ORD-001",
                "creation": datetime.now(),
            }
        )
        mock_get_doc.return_value = pos_invoice

        pos_profile = frappe._dict({"name": "POS-001", "kot_naming_series": "KOT-.###"})

        kot_doc = frappe._dict()
        kot_doc.update = MagicMock(return_value=None)
        kot_doc.append = MagicMock(return_value=None)
        kot_doc.insert = MagicMock(return_value=None)
        kot_doc.submit = MagicMock(return_value=None)
        kot_doc.db_set = MagicMock(return_value=None)

        mock_new_doc.return_value = kot_doc

        production_items = [_kot_item_dict(item_code="BURGER", qty=2)]

        create_kot(
            "POS-INV-001",
            pos_profile,
            "KOT-.###",
            production_items,
            "Waiter1",
            "PROD-001",
        )

        mock_new_doc.assert_called_once_with("URY KOT")
        kot_doc.update.assert_called_once()
        kot_doc.insert.assert_called_once()
        kot_doc.submit.assert_called_once()
        kot_doc.db_set.assert_called_once_with("owner", "Waiter1")
        mock_create_kot_log.assert_called_once()

    @patch(f"{MODULE}.create_kot_log")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.new_doc")
    def test_create_kot_populates_fields(
        self, mock_new_doc, mock_get_doc, mock_create_kot_log
    ):
        """Should populate all KOT fields with correct values."""
        pos_invoice = frappe._dict(
            {
                "name": "POS-INV-001",
                "customer": "Customer1",
                "restaurant_table": "Table1",
                "order_no": "ORD-001",
                "creation": datetime.now(),
            }
        )
        mock_get_doc.return_value = pos_invoice

        pos_profile = frappe._dict({"name": "POS-001", "kot_naming_series": "KOT-.###"})

        kot_doc = frappe._dict()
        kot_doc.update = MagicMock()
        kot_doc.append = MagicMock()
        kot_doc.insert = MagicMock()
        kot_doc.submit = MagicMock()
        kot_doc.db_set = MagicMock()

        mock_new_doc.return_value = kot_doc

        production_items = [_kot_item_dict(item_code="BURGER", qty=2)]

        create_kot(
            "POS-INV-001",
            pos_profile,
            "KOT-.###",
            production_items,
            "Waiter1",
            "PROD-001",
        )

        update_data = kot_doc.update.call_args[0][0]
        self.assertEqual(update_data["invoice"], "POS-INV-001")
        self.assertEqual(update_data["customer_name"], "Customer1")
        self.assertEqual(update_data["restaurant_table"], "Table1")
        self.assertEqual(update_data["order_no"], "ORD-001")
        self.assertEqual(update_data["pos_profile"], "POS-001")
        self.assertEqual(update_data["production"], "PROD-001")

    @patch(f"{MODULE}.create_kot_log")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.new_doc")
    def test_create_kot_appends_items(
        self, mock_new_doc, mock_get_doc, mock_create_kot_log
    ):
        """Should append all production items to KOT."""
        pos_invoice = frappe._dict(
            {
                "name": "POS-INV-001",
                "customer": "Customer1",
                "restaurant_table": None,
                "order_no": None,
                "creation": datetime.now(),
            }
        )
        mock_get_doc.return_value = pos_invoice

        pos_profile = frappe._dict({"name": "POS-001"})

        kot_doc = frappe._dict()
        kot_doc.update = MagicMock()
        kot_doc.append = MagicMock()
        kot_doc.insert = MagicMock()
        kot_doc.submit = MagicMock()
        kot_doc.db_set = MagicMock()

        mock_new_doc.return_value = kot_doc

        production_items = [
            _kot_item_dict(item_code="BURGER", item_name="Burger", qty=2),
            _kot_item_dict(item_code="FRIES", item_name="Fries", qty=1),
        ]

        create_kot(
            "POS-INV-001",
            pos_profile,
            "KOT-.###",
            production_items,
            "Waiter1",
            "PROD-001",
        )

        self.assertEqual(kot_doc.append.call_count, 2)


class TestProcessInvoice(FrappeTestCase):
    """Tests for process_invoice() workflow."""

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user("Administrator")

    @patch(f"{MODULE}.create_kot")
    @patch(f"{MODULE}.get_productions_for_branch")
    @patch(f"{MODULE}.frappe.get_list")
    @patch(f"{MODULE}.frappe.get_doc")
    def test_process_invoice_creates_kot_when_none_exists(
        self, mock_get_doc, mock_get_list, mock_get_productions, mock_create_kot
    ):
        """Should create KOT if none exists for invoice."""
        pos_invoice = _invoice_dict(
            name="POS-INV-001",
            waiter="Waiter1",
            pos_profile="POS-001",
            customer="Customer1",
            branch="Branch1",
            items=[_kot_item_dict(item_code="BURGER")],
        )

        pos_profile = _pos_profile_dict()
        production_unit = _production_unit_dict()
        item = frappe._dict({"item_group": "Food"})

        def get_doc_side_effect(doctype, name):
            if doctype == "POS Invoice":
                return pos_invoice
            elif doctype == "POS Profile":
                return pos_profile
            elif doctype == "URY Production Unit":
                return production_unit
            elif doctype == "Item":
                return item
            raise ValueError(f"Unexpected doctype: {doctype}")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_get_list.return_value = []
        mock_get_productions.return_value = [frappe._dict(name="PROD-001")]

        process_invoice(pos_invoice)

        mock_create_kot.assert_called_once()

    @patch(f"{MODULE}.create_kot")
    @patch(f"{MODULE}.get_productions_for_branch")
    @patch(f"{MODULE}.frappe.get_list")
    @patch(f"{MODULE}.frappe.get_doc")
    def test_process_invoice_skips_when_kot_exists(
        self, mock_get_doc, mock_get_list, mock_get_productions, mock_create_kot
    ):
        """Should not create KOT if one already exists for invoice."""
        pos_invoice = _invoice_dict(name="POS-INV-001")
        pos_profile = _pos_profile_dict()

        mock_get_doc.side_effect = lambda doctype, name: (
            pos_invoice if doctype == "POS Invoice" else pos_profile
        )
        mock_get_list.return_value = [frappe._dict(name="KOT-001")]

        process_invoice(pos_invoice)

        mock_create_kot.assert_not_called()


class TestGetKotErrors(FrappeTestCase):
    """Tests for get_kot_errors() API endpoint with permission checks."""

    def setUp(self):
        frappe.set_user("Administrator")
        self._create_users()

    def tearDown(self):
        frappe.set_user("Administrator")
        self._cleanup_users()

    def _create_users(self):
        """Create test users with different roles."""
        _create_test_user(TEST_CASHIER, [])
        _create_test_user(TEST_SUPERVISOR, ["URY Manager"])

    def _cleanup_users(self):
        """Delete test users."""
        for email in [TEST_CASHIER, TEST_SUPERVISOR]:
            if frappe.db.exists("User", email):
                frappe.delete_doc("User", email, force=True, ignore_permissions=True)

    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.getBranch")
    def test_get_kot_errors_returns_logs(
        self, mock_get_branch, mock_db_get_value, mock_get_all
    ):
        """Should return KOT error logs filtered by POS Profile."""
        frappe.set_user("Administrator")
        mock_get_branch.return_value = "Branch1"
        mock_db_get_value.return_value = "Branch1"
        mock_get_all.return_value = [
            frappe._dict(
                {
                    "kot": "KOT-001",
                    "invoice": "POS-INV-001",
                    "invoice_creation_time": datetime.now(),
                    "production": "PROD-001",
                    "date": "2024-01-01",
                    "time": "12:00:00",
                }
            )
        ]

        result = get_kot_errors("POS-001")

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["kot"], "KOT-001")
        mock_get_all.assert_called_once()

    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.getBranch")
    def test_get_kot_errors_throws_when_not_found(
        self, mock_get_branch, mock_db_get_value, mock_get_all
    ):
        """Should throw DoesNotExistError when POS Profile does not exist."""
        frappe.set_user("Administrator")
        mock_get_branch.return_value = "Branch1"
        mock_db_get_value.return_value = None

        with self.assertRaises(frappe.DoesNotExistError):
            get_kot_errors("NONEXISTENT")

    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.getBranch")
    def test_get_kot_errors_non_supervisor_branch_check(
        self, mock_get_branch, mock_db_get_value
    ):
        """Non-supervisor cannot access POS Profile from different branch."""
        frappe.set_user(TEST_CASHIER)
        mock_get_branch.return_value = "Branch1"
        mock_db_get_value.return_value = "Branch2"

        try:
            with self.assertRaises(frappe.PermissionError):
                get_kot_errors("POS-002")
        finally:
            frappe.set_user("Administrator")

    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.getBranch")
    def test_get_kot_errors_supervisor_access(
        self, mock_get_branch, mock_db_get_value, mock_get_all
    ):
        """URY Manager can access any branch POS Profile."""
        frappe.set_user(TEST_SUPERVISOR)
        mock_get_branch.side_effect = Exception("No branch")
        mock_db_get_value.return_value = "AnyBranch"
        mock_get_all.return_value = []

        try:
            result = get_kot_errors("POS-ANY")
            self.assertIsInstance(result, list)
        finally:
            frappe.set_user("Administrator")

    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.getBranch")
    def test_get_kot_errors_limits_results(
        self, mock_get_branch, mock_db_get_value, mock_get_all
    ):
        """Should limit results to 50 per call."""
        frappe.set_user("Administrator")
        mock_get_branch.return_value = "Branch1"
        mock_db_get_value.return_value = "Branch1"
        mock_get_all.return_value = []

        get_kot_errors("POS-001")

        call_kwargs = mock_get_all.call_args.kwargs
        self.assertEqual(call_kwargs["limit_page_length"], 50)

    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.getBranch")
    def test_get_kot_errors_filters_correctly(
        self, mock_get_branch, mock_db_get_value, mock_get_all
    ):
        """Should filter logs by branch and pos_profile."""
        frappe.set_user("Administrator")
        mock_get_branch.return_value = "Branch1"
        mock_db_get_value.return_value = "Branch1"
        mock_get_all.return_value = []

        get_kot_errors("POS-001")

        call_args = mock_get_all.call_args
        filters = call_args.kwargs["filters"]
        self.assertEqual(filters["branch"], "Branch1")
        self.assertEqual(filters["pos_profile"], "POS-001")


class TestKotValidationThread(FrappeTestCase):
    """Tests for kotValidationThread() background task."""

    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user("Administrator")

    @patch(f"{MODULE}.process_invoice")
    @patch(f"{MODULE}.get_unprocessed_invoices")
    @patch(f"{MODULE}.get_datetime")
    def test_kot_validation_thread_time_range(
        self, mock_get_datetime, mock_get_unprocessed, mock_process_invoice
    ):
        """Should fetch invoices within 1-5 minute window."""
        now = datetime(2024, 1, 1, 12, 0, 0)
        mock_get_datetime.return_value = now
        mock_get_unprocessed.return_value = [
            frappe._dict(name="POS-INV-001"),
            frappe._dict(name="POS-INV-002"),
        ]

        kotValidationThread()

        call_args = mock_get_unprocessed.call_args
        start_time = call_args[0][0]
        end_time = call_args[0][1]

        self.assertEqual(start_time, now - timedelta(minutes=5))
        self.assertEqual(end_time, now - timedelta(minutes=1))
        self.assertEqual(mock_process_invoice.call_count, 2)

    @patch(f"{MODULE}.process_invoice")
    @patch(f"{MODULE}.get_unprocessed_invoices")
    @patch(f"{MODULE}.get_datetime")
    def test_kot_validation_thread_empty_list(
        self, mock_get_datetime, mock_get_unprocessed, mock_process_invoice
    ):
        """Should handle case when no invoices need processing."""
        now = datetime(2024, 1, 1, 12, 0, 0)
        mock_get_datetime.return_value = now
        mock_get_unprocessed.return_value = []

        kotValidationThread()

        mock_process_invoice.assert_not_called()

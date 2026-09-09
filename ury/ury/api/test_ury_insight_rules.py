import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, get_datetime, nowdate
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

from ury.ury.api.ury_insight_rules import (
    run_exception_rules,
    _run_exception_rules,
    _upsert_insight,
    _rule_long_open_tickets,
    _rule_aging_unpaid_orders,
    _rule_notable_cancellations,
    _rule_aging_stock,
    DEDUPE_WINDOW_MINUTES,
    LONG_OPEN_TICKET_MINUTES,
    AGING_STOCK_HOURS,
    CANCELLATION_SPIKE_MULTIPLIER,
    CANCELLATION_SPIKE_MIN_COUNT,
)


MODULE = "ury.ury.api.ury_insight_rules"
TEST_RULE_KEY = "_test_rule_key"
TEST_BRANCH = None
TEST_TITLE = "Test Insight Title"


class TestUpsertInsight(FrappeTestCase):
    """Test _upsert_insight deduplication and creation/update behavior."""

    def setUp(self):
        # Clean up any test insights from previous runs
        frappe.db.delete("URY Insight", {
            "rule_key": TEST_RULE_KEY,
            "branch": TEST_BRANCH,
        })

    def tearDown(self):
        frappe.db.delete("URY Insight", {
            "rule_key": TEST_RULE_KEY,
            "branch": TEST_BRANCH,
        })

    def test_upsert_creates_new_insight_when_none_exists(self):
        """New insight should be created when none exists for this rule_key+branch."""
        name = _upsert_insight(
            rule_key=TEST_RULE_KEY,
            branch=TEST_BRANCH,
            title="First insight",
            severity="Warning",
            source_tool="test_tool",
        )

        self.assertIsNotNone(name)
        doc = frappe.get_doc("URY Insight", name)
        self.assertEqual(doc.rule_key, TEST_RULE_KEY)
        self.assertEqual(doc.branch, TEST_BRANCH)
        self.assertEqual(doc.title, "First insight")
        self.assertEqual(doc.severity, "Warning")
        self.assertEqual(doc.source_tool, "test_tool")
        self.assertEqual(doc.dismissed, 0)

    def test_upsert_dedupes_within_window(self):
        """Second call within DEDUPE_WINDOW_MINUTES should not create duplicate."""
        # Create first insight
        name1 = _upsert_insight(
            rule_key=TEST_RULE_KEY,
            branch=TEST_BRANCH,
            title="First insight",
            severity="Warning",
            source_tool="test_tool",
        )

        # Call again immediately
        name2 = _upsert_insight(
            rule_key=TEST_RULE_KEY,
            branch=TEST_BRANCH,
            title="Second insight",
            severity="Critical",
            source_tool="test_tool",
        )

        # Should return the same insight (deduplicated)
        self.assertEqual(name1, name2)

        # Verify only one exists
        count = frappe.db.count("URY Insight", {
            "rule_key": TEST_RULE_KEY,
            "branch": TEST_BRANCH,
        })
        self.assertEqual(count, 1)

        # Verify title and severity were updated
        doc = frappe.get_doc("URY Insight", name2)
        self.assertEqual(doc.title, "Second insight")
        self.assertEqual(doc.severity, "Critical")

    def test_upsert_respects_dismissed_filter(self):
        """Dismissed insights should not be deduped; create new one instead."""
        # Create and dismiss first insight
        name1 = _upsert_insight(
            rule_key=TEST_RULE_KEY,
            branch=TEST_BRANCH,
            title="First insight",
            severity="Warning",
            source_tool="test_tool",
        )
        doc1 = frappe.get_doc("URY Insight", name1)
        doc1.dismissed = 1
        doc1.save()

        # Call again immediately
        name2 = _upsert_insight(
            rule_key=TEST_RULE_KEY,
            branch=TEST_BRANCH,
            title="Second insight",
            severity="Warning",
            source_tool="test_tool",
        )

        # Should create a new insight (dismissed one doesn't match)
        self.assertNotEqual(name1, name2)

        # Verify both exist
        count = frappe.db.count("URY Insight", {
            "rule_key": TEST_RULE_KEY,
            "branch": TEST_BRANCH,
        })
        self.assertEqual(count, 2)

    @patch(f"{MODULE}.frappe.get_doc")
    def test_upsert_different_branches_do_not_dedupe(self, mock_get_doc):
        """Insights for different branches should not dedupe each other."""
        # Branch is a real linked doctype and _upsert_insight's doc.insert()
        # validates the link, so mock frappe.get_doc here rather than using
        # made-up branch names that don't exist as real Branch records.
        doc1 = MagicMock()
        doc1.name = "INSIGHT-A"
        doc2 = MagicMock()
        doc2.name = "INSIGHT-B"
        mock_get_doc.side_effect = [doc1, doc2]

        name1 = _upsert_insight(
            rule_key=TEST_RULE_KEY,
            branch="Branch A",
            title="Branch A insight",
            severity="Warning",
            source_tool="test_tool",
        )

        name2 = _upsert_insight(
            rule_key=TEST_RULE_KEY,
            branch="Branch B",
            title="Branch B insight",
            severity="Warning",
            source_tool="test_tool",
        )

        # Should create two separate insights
        self.assertNotEqual(name1, name2)
        self.assertEqual(mock_get_doc.call_count, 2)

    def test_upsert_different_rule_keys_do_not_dedupe(self):
        """Insights for different rule_keys should not dedupe each other."""
        name1 = _upsert_insight(
            rule_key="rule_a",
            branch=TEST_BRANCH,
            title="Rule A insight",
            severity="Warning",
            source_tool="test_tool",
        )

        name2 = _upsert_insight(
            rule_key="rule_b",
            branch=TEST_BRANCH,
            title="Rule B insight",
            severity="Warning",
            source_tool="test_tool",
        )

        # Should create two separate insights
        self.assertNotEqual(name1, name2)

        # Clean up
        for key in ["rule_a", "rule_b"]:
            frappe.db.delete("URY Insight", {
                "rule_key": key,
                "branch": TEST_BRANCH,
            })


class TestRunExceptionRules(FrappeTestCase):
    """Test run_exception_rules endpoint with role checking."""

    @patch(f"{MODULE}.require_manager")
    @patch(f"{MODULE}._run_exception_rules")
    def test_run_exception_rules_calls_require_manager(self, mock_inner, mock_require):
        """run_exception_rules should enforce require_manager check."""
        mock_inner.return_value = []

        run_exception_rules()

        mock_require.assert_called_once()
        mock_inner.assert_called_once()

    @patch(f"{MODULE}.require_manager")
    @patch(f"{MODULE}._run_exception_rules")
    def test_run_exception_rules_returns_inner_result(self, mock_inner, mock_require):
        """run_exception_rules should return result from _run_exception_rules."""
        expected = ["insight1", "insight2"]
        mock_inner.return_value = expected

        result = run_exception_rules()

        self.assertEqual(result, expected)


class TestRunExceptionRulesInner(FrappeTestCase):
    """Test _run_exception_rules orchestration logic."""

    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}._rule_long_open_tickets")
    @patch(f"{MODULE}._rule_aging_unpaid_orders")
    @patch(f"{MODULE}._rule_notable_cancellations")
    @patch(f"{MODULE}._rule_aging_stock")
    def test_inner_gets_all_branches(self, mock_aging_stock, mock_cancellations,
                                     mock_unpaid, mock_long_open, mock_get_all):
        """_run_exception_rules should fetch all branches."""
        mock_get_all.return_value = []
        mock_long_open.return_value = []
        mock_unpaid.return_value = []
        mock_cancellations.return_value = []
        mock_aging_stock.return_value = []

        _run_exception_rules()

        mock_get_all.assert_called_once_with("Branch", fields=["name"])

    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}._rule_long_open_tickets")
    @patch(f"{MODULE}._rule_aging_unpaid_orders")
    @patch(f"{MODULE}._rule_notable_cancellations")
    @patch(f"{MODULE}._rule_aging_stock")
    def test_inner_runs_all_four_rules(self, mock_aging_stock, mock_cancellations,
                                       mock_unpaid, mock_long_open, mock_get_all):
        """_run_exception_rules should call all four rule functions."""
        branch_row = MagicMock()
        branch_row.name = "Branch A"
        mock_get_all.return_value = [branch_row]
        mock_long_open.return_value = ["i1"]
        mock_unpaid.return_value = ["i2"]
        mock_cancellations.return_value = ["i3"]
        mock_aging_stock.return_value = ["i4"]

        result = _run_exception_rules()

        mock_long_open.assert_called_with("Branch A")
        mock_unpaid.assert_called_with("Branch A")
        mock_cancellations.assert_called_with("Branch A")
        mock_aging_stock.assert_called_with("Branch A")
        self.assertEqual(result, ["i1", "i2", "i3", "i4"])

    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}._rule_long_open_tickets")
    @patch(f"{MODULE}._rule_aging_unpaid_orders")
    @patch(f"{MODULE}._rule_notable_cancellations")
    @patch(f"{MODULE}._rule_aging_stock")
    def test_inner_falls_back_to_none_branch_when_no_branches(self, mock_aging_stock,
                                                              mock_cancellations, mock_unpaid,
                                                              mock_long_open, mock_get_all):
        """_run_exception_rules should use [None] when no branches exist."""
        mock_get_all.return_value = []
        mock_long_open.return_value = ["i1"]
        mock_unpaid.return_value = ["i2"]
        mock_cancellations.return_value = ["i3"]
        mock_aging_stock.return_value = ["i4"]

        result = _run_exception_rules()

        mock_long_open.assert_called_with(None)
        mock_unpaid.assert_called_with(None)
        mock_cancellations.assert_called_with(None)
        mock_aging_stock.assert_called_with(None)


class TestRuleLongOpenTickets(FrappeTestCase):
    """Test _rule_long_open_tickets logic."""

    @patch(f"{MODULE}._business_day_bounds")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_returns_empty_when_no_old_tickets(self, mock_upsert, mock_sql, mock_bounds):
        """No insights created when no tickets exist beyond threshold."""
        mock_bounds.return_value = (
            datetime(2024, 1, 1, 0, 0, 0),
            datetime(2024, 1, 1, 23, 59, 59),
        )
        mock_sql.return_value = []

        result = _rule_long_open_tickets(None)

        self.assertEqual(result, [])
        mock_upsert.assert_not_called()

    @patch(f"{MODULE}._business_day_bounds")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_creates_insight_when_tickets_exist(self, mock_upsert, mock_sql, mock_bounds):
        """Insight created when old tickets are found."""
        mock_bounds.return_value = (
            datetime(2024, 1, 1, 0, 0, 0),
            datetime(2024, 1, 1, 23, 59, 59),
        )
        mock_sql.return_value = [
            MagicMock(name="KOT-001"),
            MagicMock(name="KOT-002"),
        ]
        mock_upsert.return_value = "insight_123"

        result = _rule_long_open_tickets(None)

        self.assertEqual(result, ["insight_123"])
        mock_upsert.assert_called_once()
        call_args = mock_upsert.call_args
        self.assertEqual(call_args.kwargs["rule_key"], "long_open_tickets")
        self.assertIn("2 ticket", call_args.kwargs["title"])
        self.assertEqual(call_args.kwargs["severity"], "Warning")

    @patch(f"{MODULE}._business_day_bounds")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_includes_branch_in_query_conditions(self, mock_upsert, mock_sql, mock_bounds):
        """Branch parameter should be included in query."""
        mock_bounds.return_value = (
            datetime(2024, 1, 1, 0, 0, 0),
            datetime(2024, 1, 1, 23, 59, 59),
        )
        mock_sql.return_value = []

        _rule_long_open_tickets("Branch A")

        mock_sql.assert_called_once()
        call_str = str(mock_sql.call_args[0][0])  # SQL string
        self.assertIn("branch", call_str)
        params = mock_sql.call_args[0][1]
        self.assertEqual(params.get("branch"), "Branch A")


class TestRuleAgingUnpaidOrders(FrappeTestCase):
    """Test _rule_aging_unpaid_orders logic."""

    @patch(f"{MODULE}.get_needs_attention")
    @patch(f"{MODULE}._upsert_insight")
    def test_returns_empty_when_no_pending_payment(self, mock_upsert, mock_get_attention):
        """No insights when there are no pending payment items."""
        mock_get_attention.return_value = [
            {"type": "other_type", "severity": "high"},
        ]

        result = _rule_aging_unpaid_orders(None)

        self.assertEqual(result, [])
        mock_upsert.assert_not_called()

    @patch(f"{MODULE}.get_needs_attention")
    @patch(f"{MODULE}._upsert_insight")
    def test_creates_insight_for_pending_payment(self, mock_upsert, mock_get_attention):
        """Insight created when pending_payment item exists."""
        mock_get_attention.return_value = [
            {
                "type": "pending_payment",
                "severity": "high",
                "message": "Orders awaiting payment",
            },
        ]
        mock_upsert.return_value = "insight_456"

        result = _rule_aging_unpaid_orders(None)

        self.assertEqual(result, ["insight_456"])
        mock_upsert.assert_called_once()
        call_args = mock_upsert.call_args
        self.assertEqual(call_args.kwargs["rule_key"], "aging_unpaid_orders")
        self.assertEqual(call_args.kwargs["title"], "Orders awaiting payment")
        self.assertEqual(call_args.kwargs["severity"], "Critical")

    @patch(f"{MODULE}.get_needs_attention")
    @patch(f"{MODULE}._upsert_insight")
    def test_severity_warning_for_non_high_severity(self, mock_upsert, mock_get_attention):
        """Severity should be Warning when item severity is not 'high'."""
        mock_get_attention.return_value = [
            {
                "type": "pending_payment",
                "severity": "low",
                "message": "Some orders pending",
            },
        ]
        mock_upsert.return_value = "insight_456"

        _rule_aging_unpaid_orders(None)

        call_args = mock_upsert.call_args
        self.assertEqual(call_args.kwargs["severity"], "Warning")

    @patch(f"{MODULE}.get_needs_attention")
    @patch(f"{MODULE}._upsert_insight")
    def test_passes_branch_to_get_needs_attention(self, mock_upsert, mock_get_attention):
        """Branch parameter should be passed to get_needs_attention."""
        mock_get_attention.return_value = []

        _rule_aging_unpaid_orders("Branch X")

        mock_get_attention.assert_called_once_with(branch="Branch X")


class TestRuleNotableCancellations(FrappeTestCase):
    """Test _rule_notable_cancellations logic."""

    @patch(f"{MODULE}._business_day_bounds")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_returns_empty_when_today_count_below_min(self, mock_upsert, mock_sql, mock_bounds):
        """No insights when today's cancellation count is below minimum."""
        mock_bounds.return_value = (
            datetime(2024, 1, 1, 0, 0, 0),
            datetime(2024, 1, 1, 23, 59, 59),
        )
        # First call: today count below minimum
        mock_sql.return_value = [MagicMock(cnt=1)]

        result = _rule_notable_cancellations(None)

        self.assertEqual(result, [])
        mock_upsert.assert_not_called()

    @patch(f"{MODULE}._business_day_bounds")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_returns_empty_when_below_baseline_multiplier(self, mock_upsert, mock_sql, mock_bounds):
        """No insights when today is not significantly above baseline."""
        mock_bounds.return_value = (
            datetime(2024, 1, 2, 0, 0, 0),  # Monday
            datetime(2024, 1, 2, 23, 59, 59),
        )
        # First call: today count
        # Second call: baseline for same weekday from past 14 days
        mock_sql.side_effect = [
            [MagicMock(cnt=5)],  # 5 today (meets minimum)
            [
                MagicMock(d=None, cnt=3),
                MagicMock(d=None, cnt=4),
            ],  # avg = 3.5, need >= 3.5 * 2 = 7
        ]

        result = _rule_notable_cancellations(None)

        self.assertEqual(result, [])

    @patch(f"{MODULE}._business_day_bounds")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_creates_insight_when_spike_detected(self, mock_upsert, mock_sql, mock_bounds):
        """Insight created when cancellations spike above baseline."""
        mock_bounds.return_value = (
            datetime(2024, 1, 2, 0, 0, 0),  # Monday
            datetime(2024, 1, 2, 23, 59, 59),
        )
        mock_sql.side_effect = [
            [MagicMock(cnt=10)],  # 10 today
            [
                MagicMock(d=None, cnt=2),
                MagicMock(d=None, cnt=3),
            ],  # avg = 2.5, 10 >= 2.5 * 2
        ]
        mock_upsert.return_value = "insight_789"

        result = _rule_notable_cancellations(None)

        self.assertEqual(result, ["insight_789"])
        mock_upsert.assert_called_once()
        call_args = mock_upsert.call_args
        self.assertEqual(call_args.kwargs["rule_key"], "notable_cancellations")
        self.assertIn("10 cancelled", call_args.kwargs["title"])
        self.assertEqual(call_args.kwargs["severity"], "Warning")

    @patch(f"{MODULE}._business_day_bounds")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_creates_insight_when_no_baseline_but_count_meets_minimum(self, mock_upsert,
                                                                       mock_sql, mock_bounds):
        """Insight created when no baseline exists but count meets minimum."""
        mock_bounds.return_value = (
            datetime(2024, 1, 2, 0, 0, 0),
            datetime(2024, 1, 2, 23, 59, 59),
        )
        mock_sql.side_effect = [
            [MagicMock(cnt=3)],  # 3 today (meets minimum)
            [],  # No baseline (first Monday of the month)
        ]
        mock_upsert.return_value = "insight_789"

        result = _rule_notable_cancellations(None)

        self.assertEqual(result, ["insight_789"])


class TestRuleAgingStock(FrappeTestCase):
    """Test _rule_aging_stock logic."""

    @patch(f"{MODULE}.get_datetime")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_returns_empty_when_no_aging_stock(self, mock_upsert, mock_sql, mock_datetime):
        """No insights when no aging stock movements exist."""
        mock_datetime.return_value = datetime(2024, 1, 1, 12, 0, 0)
        mock_sql.return_value = []

        result = _rule_aging_stock(None)

        self.assertEqual(result, [])
        mock_upsert.assert_not_called()

    @patch(f"{MODULE}.get_datetime")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_creates_insights_for_each_aging_item(self, mock_upsert, mock_sql, mock_datetime):
        """Insight created for each aging stock item."""
        mock_datetime.return_value = datetime(2024, 1, 1, 12, 0, 0)
        mock_sql.return_value = [
            {
                "component_item": "ITEM-A",
                "department": "Dept 1",
                "receipt_qty": 10,
                "return_qty": 2,
                "oldest_receipt": datetime(2024, 1, 1, 0, 0, 0),
            },
            {
                "component_item": "ITEM-B",
                "department": "Dept 2",
                "receipt_qty": 5,
                "return_qty": 1,
                "oldest_receipt": datetime(2024, 1, 1, 0, 0, 0),
            },
        ]
        mock_upsert.side_effect = ["insight_1", "insight_2"]

        result = _rule_aging_stock(None)

        self.assertEqual(result, ["insight_1", "insight_2"])
        self.assertEqual(mock_upsert.call_count, 2)

        # Verify first call
        first_call = mock_upsert.call_args_list[0]
        self.assertEqual(first_call.kwargs["rule_key"], "aging_stock")
        self.assertIn("ITEM-A", first_call.kwargs["title"])
        self.assertIn("8 units", first_call.kwargs["title"])  # 10 - 2
        self.assertIn("Dept 1", first_call.kwargs["title"])

    @patch(f"{MODULE}.get_datetime")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_includes_branch_in_query_conditions(self, mock_upsert, mock_sql, mock_datetime):
        """Branch parameter should be included in query."""
        mock_datetime.return_value = datetime(2024, 1, 1, 12, 0, 0)
        mock_sql.return_value = []

        _rule_aging_stock("Branch Z")

        mock_sql.assert_called_once()
        params = mock_sql.call_args[0][1]
        self.assertEqual(params.get("branch"), "Branch Z")

    @patch(f"{MODULE}.get_datetime")
    @patch(f"{MODULE}.frappe.db.sql")
    @patch(f"{MODULE}._upsert_insight")
    def test_calculates_net_quantity_correctly(self, mock_upsert, mock_sql, mock_datetime):
        """Net quantity should be receipt_qty - return_qty."""
        mock_datetime.return_value = datetime(2024, 1, 1, 12, 0, 0)
        mock_sql.return_value = [
            {
                "component_item": "ITEM-X",
                "department": "Kitchen",
                "receipt_qty": 100,
                "return_qty": 35,
                "oldest_receipt": datetime(2024, 1, 1, 0, 0, 0),
            },
        ]
        mock_upsert.return_value = "insight_123"

        _rule_aging_stock(None)

        call_args = mock_upsert.call_args
        self.assertIn("65 units", call_args.kwargs["title"])  # 100 - 35


class TestIntegrationScenario(FrappeTestCase):
    """Integration tests with real database operations."""

    def setUp(self):
        # Clean up any test URY Insights
        frappe.db.delete("URY Insight", {"rule_key": ["in", [
            "test_long_open",
            "test_unpaid",
            "test_cancellations",
            "test_stock",
        ]]})

    def tearDown(self):
        frappe.db.delete("URY Insight", {"rule_key": ["in", [
            "test_long_open",
            "test_unpaid",
            "test_cancellations",
            "test_stock",
        ]]})

    def test_upsert_insight_full_lifecycle(self):
        """Test complete lifecycle of creating, updating, and deduping insights."""
        # Create first insight
        name1 = _upsert_insight(
            rule_key="test_long_open",
            branch=None,
            title="Initial insight",
            severity="Warning",
            source_tool="test_tool",
        )

        doc1 = frappe.get_doc("URY Insight", name1)
        self.assertEqual(doc1.title, "Initial insight")
        self.assertEqual(doc1.dismissed, 0)

        # Update within dedupe window
        name2 = _upsert_insight(
            rule_key="test_long_open",
            branch=None,
            title="Updated insight",
            severity="Critical",
            source_tool="test_tool",
        )

        # Should be same insight
        self.assertEqual(name1, name2)
        doc2 = frappe.get_doc("URY Insight", name2)
        self.assertEqual(doc2.title, "Updated insight")
        self.assertEqual(doc2.severity, "Critical")

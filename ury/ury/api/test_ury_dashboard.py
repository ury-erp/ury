import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock
from ury.ury.api.ury_dashboard import (
    get_dashboard_stats,
    get_needs_attention,
    get_shift_metrics,
    get_baseline,
    get_floor_load,
)


class TestGetDashboardStats(FrappeTestCase):

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    def test_cache_hit_returns_immediately(self, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        cached_data = {"todays_sales": 5000, "orders_today": 10}
        mock_cache_instance.get_value.return_value = cached_data

        result = get_dashboard_stats(branch="URY Branch")

        self.assertEqual(result, cached_data)
        mock_cache_instance.get_value.assert_called_once_with("ury_dashboard_stats:URY Branch")

    @patch("ury.ury.api.ury_dashboard.frappe.db.count")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    def test_cache_miss_with_branch(self, mock_cache_obj, mock_sql, mock_count):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_sql.return_value = [frappe._dict({"total_invoices": 10, "grand_total": 1000.0})]
        mock_count.side_effect = [5, 10]

        result = get_dashboard_stats(branch="URY Branch")

        self.assertEqual(result["todays_sales"], 1000.0)
        self.assertEqual(result["orders_today"], 10)
        self.assertEqual(result["avg_order_value"], 100.0)
        self.assertEqual(result["active_tables"], 5)
        self.assertEqual(result["total_tables"], 10)
        mock_cache_instance.set_value.assert_called_once()

    @patch("ury.ury.api.ury_dashboard.frappe.db.count")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    def test_cache_miss_zero_invoices_no_division_error(self, mock_cache_obj, mock_sql, mock_count):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_sql.return_value = [frappe._dict({"total_invoices": 0, "grand_total": None})]
        mock_count.side_effect = [2, 5]

        result = get_dashboard_stats(branch="URY Branch")

        self.assertEqual(result["todays_sales"], 0)
        self.assertEqual(result["orders_today"], 0)
        self.assertEqual(result["avg_order_value"], 0)

    @patch("ury.ury.api.ury_dashboard.frappe.db.count")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    def test_cache_miss_no_branch(self, mock_cache_obj, mock_sql, mock_count):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_sql.return_value = [frappe._dict({"total_invoices": 5, "grand_total": 500.0})]
        mock_count.side_effect = [3, 8]

        result = get_dashboard_stats(branch=None)

        self.assertEqual(result["todays_sales"], 500.0)
        self.assertEqual(result["orders_today"], 5)
        self.assertIn("active_tables", result)
        mock_sql.assert_called_once()


class TestGetNeedsAttention(FrappeTestCase):

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    def test_cache_hit_returns_immediately(self, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        cached_items = [{"type": "pending_payment", "severity": "high"}]
        mock_cache_instance.get_value.return_value = cached_items

        result = get_needs_attention(branch="URY Branch")

        self.assertEqual(result, cached_items)
        mock_cache_instance.get_value.assert_called_once_with("ury_dashboard_needs_attention:URY Branch")

    @patch("ury.ury.api.ury_dashboard.frappe.get_all")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.add_to_date")
    @patch("ury.ury.api.ury_dashboard.get_datetime")
    @patch("ury.ury.api.ury_dashboard.today")
    def test_cache_miss_with_pending_payments(self, mock_today, mock_get_datetime, mock_add_to_date, mock_cache_obj, mock_sql, mock_get_all):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        mock_get_datetime.return_value = "2026-08-19 10:00:00"
        mock_add_to_date.return_value = "2026-08-19 09:45:00"

        mock_sql.return_value = [{"name": "INV-001", "creation": "2026-08-19 09:00:00"}]
        mock_get_all.side_effect = [[], [], []]

        result = get_needs_attention(branch="URY Branch")

        pending_items = [item for item in result if item["type"] == "pending_payment"]
        self.assertEqual(len(pending_items), 1)
        self.assertEqual(pending_items[0]["severity"], "high")
        mock_cache_instance.set_value.assert_called_once()

    @patch("ury.ury.api.ury_dashboard.frappe.get_all")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.add_to_date")
    @patch("ury.ury.api.ury_dashboard.get_datetime")
    @patch("ury.ury.api.ury_dashboard.today")
    def test_cache_miss_all_empty(self, mock_today, mock_get_datetime, mock_add_to_date, mock_cache_obj, mock_sql, mock_get_all):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        mock_get_datetime.return_value = "2026-08-19 10:00:00"
        mock_add_to_date.return_value = "2026-08-19 09:45:00"

        mock_sql.return_value = []
        mock_get_all.side_effect = [[], [], []]

        result = get_needs_attention(branch=None)

        self.assertEqual(result, [])


class TestGetShiftMetrics(FrappeTestCase):

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    def test_cache_hit_returns_immediately(self, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        cached_metrics = {"sales": 500.0, "covers": 10, "avg_per_cover": 50.0, "avg_ticket_minutes": 12.5}
        mock_cache_instance.get_value.return_value = cached_metrics

        result = get_shift_metrics(branch="URY Branch")

        self.assertEqual(result, cached_metrics)
        mock_cache_instance.get_value.assert_called_once()

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.frappe.db.get_value")
    def test_cache_miss_with_metrics(self, mock_get_value, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_get_value.return_value = None

        mock_sql.side_effect = [
            [frappe._dict({"invoice_count": 5, "sales": 500.0, "covers": 10})],
            [frappe._dict({"avg_ticket_minutes": 12.5})],
        ]

        result = get_shift_metrics(branch="URY Branch")

        self.assertEqual(result["sales"], 500.0)
        self.assertEqual(result["covers"], 10)
        self.assertEqual(result["avg_per_cover"], 50.0)
        self.assertEqual(result["avg_ticket_minutes"], 12.5)

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.frappe.db.get_value")
    def test_cache_miss_zero_covers_no_division_error(self, mock_get_value, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_get_value.return_value = None

        mock_sql.side_effect = [
            [frappe._dict({"invoice_count": 0, "sales": 0, "covers": 0})],
            [frappe._dict({"avg_ticket_minutes": None})],
        ]

        result = get_shift_metrics(branch=None)

        self.assertEqual(result["covers"], 0)
        self.assertEqual(result["avg_per_cover"], 0)


class TestGetBaseline(FrappeTestCase):

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.get_datetime")
    def test_empty_rows_returns_zeros(self, mock_get_datetime, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_get_datetime.return_value = MagicMock(weekday=MagicMock(return_value=2), hour=14)
        mock_get_datetime.return_value.weekday.return_value = 2
        mock_get_datetime.return_value.hour = 14

        mock_sql.return_value = []

        result = get_baseline(branch="URY Branch", weeks=6)

        self.assertEqual(result["sample_days"], 0)
        self.assertEqual(result["median_sales"], 0)
        self.assertEqual(result["median_covers"], 0)

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.get_datetime")
    def test_three_rows_median_calculation(self, mock_get_datetime, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_get_datetime.return_value = MagicMock(weekday=MagicMock(return_value=3), hour=12)
        mock_get_datetime.return_value.weekday.return_value = 3
        mock_get_datetime.return_value.hour = 12

        mock_sql.return_value = [
            frappe._dict({"d": "2026-08-12", "sales": 100, "covers": 5}),
            frappe._dict({"d": "2026-08-05", "sales": 300, "covers": 15}),
            frappe._dict({"d": "2026-08-19", "sales": 200, "covers": 10}),
        ]

        result = get_baseline(branch=None, weeks=6)

        self.assertEqual(result["sample_days"], 3)
        self.assertEqual(result["median_sales"], 200)
        self.assertEqual(result["median_covers"], 10)

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.get_datetime")
    def test_two_rows_median_average_of_two_middle_values(self, mock_get_datetime, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_get_datetime.return_value = MagicMock(weekday=MagicMock(return_value=1), hour=10)
        mock_get_datetime.return_value.weekday.return_value = 1
        mock_get_datetime.return_value.hour = 10

        mock_sql.return_value = [
            frappe._dict({"d": "2026-08-12", "sales": 100, "covers": 5}),
            frappe._dict({"d": "2026-08-05", "sales": 300, "covers": 15}),
        ]

        result = get_baseline(branch="URY Branch", weeks=6)

        self.assertEqual(result["sample_days"], 2)
        self.assertEqual(result["median_sales"], 200.0)
        self.assertEqual(result["median_covers"], 10.0)


class TestGetFloorLoad(FrappeTestCase):

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    def test_floor_load_returns_waiter_data(self, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_sql.return_value = [
            {"waiter": "John", "table_count": 3},
            {"waiter": "Jane", "table_count": 1},
        ]

        result = get_floor_load(branch="URY Branch")

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["waiter"], "John")
        self.assertEqual(result[0]["table_count"], 3)
        mock_cache_instance.set_value.assert_called_once()

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    def test_floor_load_cache_hit(self, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        cached_data = [{"waiter": "Alice", "table_count": 2}]
        mock_cache_instance.get_value.return_value = cached_data

        result = get_floor_load(branch="URY Branch")

        self.assertEqual(result, cached_data)
        mock_sql.assert_not_called()

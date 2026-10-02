import frappe
from datetime import date, datetime
from unittest import TestCase, addModuleCleanup
from unittest.mock import patch, MagicMock
from ury.ury.api.ury_dashboard import (
    get_dashboard_stats,
    get_needs_attention,
    get_shift_metrics,
    get_baseline,
    get_floor_load,
)


def setUpModule():
    # These API tests mock persistence and do not need a Frappe test site.
    mock_frappe = MagicMock()
    mock_frappe.db.get_value.return_value = None
    for target, value in (
        ("ury.ury.api.ury_dashboard.frappe", mock_frappe),
        ("frappe.utils.data.get_system_timezone", lambda: "Africa/Kampala"),
    ):
        patcher = patch(target, value)
        patcher.start()
        addModuleCleanup(patcher.stop)


class TestGetDashboardStats(TestCase):

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


class TestGetNeedsAttention(TestCase):

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

        mock_sql.side_effect = [[{"name": "INV-001", "creation": "2026-08-19 09:00:00"}], []]
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


class TestGetShiftMetrics(TestCase):

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
            [frappe._dict({"production_time": "12.5"})],
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
            [frappe._dict({"production_time": None, "avg_ticket_minutes": None})],
        ]

        result = get_shift_metrics(branch=None)

        self.assertEqual(result["covers"], 0)
        self.assertEqual(result["avg_per_cover"], 0)


class TestGetBaseline(TestCase):

    @patch("ury.ury.api.ury_dashboard.frappe.cache")
    @patch("ury.ury.api.ury_dashboard.frappe.db.sql")
    @patch("ury.ury.api.ury_dashboard.get_datetime")
    def test_empty_rows_returns_zeros(self, mock_get_datetime, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_get_datetime.return_value = datetime(2026, 8, 19, 14)

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

        mock_get_datetime.return_value = datetime(2026, 8, 20, 12)

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

        mock_get_datetime.return_value = datetime(2026, 8, 18, 10)

        mock_sql.return_value = [
            frappe._dict({"d": "2026-08-12", "sales": 100, "covers": 5}),
            frappe._dict({"d": "2026-08-05", "sales": 300, "covers": 15}),
        ]

        result = get_baseline(branch="URY Branch", weeks=6)

        self.assertEqual(result["sample_days"], 2)
        self.assertEqual(result["median_sales"], 200.0)
        self.assertEqual(result["median_covers"], 10.0)


class TestGetFloorLoad(TestCase):

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


class TestDashboardSiteTime(TestCase):
    def setUp(self):
        self.site_now = datetime(2026, 10, 2, 0, 7)
        self.cache = MagicMock()
        self.cache.get_value.return_value = None
        for target, value in (
            ("ury.ury.api.ury_dashboard.frappe.cache", MagicMock(return_value=self.cache)),
            ("frappe.utils.data.now_datetime", lambda: self.site_now),
            ("ury.ury.api.ury_dashboard.frappe.db.get_value", MagicMock(return_value=None)),
            ("ury.ury.api.ury_dashboard.frappe.db.count", MagicMock(return_value=1)),
        ):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def check_stats_window(self, branch, hours, start, end):
        with patch("ury.ury.api.ury_dashboard.frappe.db.get_value", return_value=hours), patch(
            "ury.ury.api.ury_dashboard.frappe.db.sql",
            return_value=[frappe._dict(total_invoices=1, grand_total=84000)],
        ) as sql:
            result = get_dashboard_stats(branch)
        query, params = sql.call_args.args
        self.assertEqual(params.get("start"), start)
        self.assertEqual(params.get("end"), end)
        self.assertNotIn("curdate", query.lower())
        self.assertIn("< %(end)s", query)
        self.assertEqual(params.get("branch"), branch)
        self.assertEqual(result["todays_sales"], 84000)
        self.assertEqual(result["orders_today"], 1)
        self.cache.set_value.assert_called_once_with(
            f"ury_dashboard_stats:{branch}", result, expires_in_sec=30,
        )

    def test_stats_use_site_day_without_report_settings(self):
        self.check_stats_window("Salama", None, datetime(2026, 10, 2), datetime(2026, 10, 3))

    def test_stats_without_branch_use_site_day(self):
        self.check_stats_window(None, None, datetime(2026, 10, 2), datetime(2026, 10, 3))

    def test_stats_before_report_cutoff_use_previous_business_day(self):
        self.check_stats_window("Salama", 6, datetime(2026, 10, 1, 6), datetime(2026, 10, 2, 6))

    def test_stats_after_report_cutoff_use_current_business_day(self):
        self.site_now = datetime(2026, 10, 2, 12)
        self.check_stats_window("Salama", 6, datetime(2026, 10, 2, 6), datetime(2026, 10, 3, 6))

    def test_baseline_uses_site_date_not_database_utc_date(self):
        with patch("ury.ury.api.ury_dashboard.frappe.db.sql", return_value=[]) as sql:
            result = get_baseline("Salama", weeks=6)
        query, params = sql.call_args.args
        self.assertEqual(params.get("start_date"), date(2026, 8, 21))
        self.assertEqual(params.get("end_date"), date(2026, 10, 2))
        self.assertNotIn("curdate", query.lower())
        self.assertEqual(params["weekday"], 4)
        self.assertEqual(params["hour_low"], 0)
        self.assertEqual(params["hour_high"], 1)
        self.cache.set_value.assert_called_once_with(
            "ury_dashboard_baseline:Salama:4:0", result, expires_in_sec=300,
        )

    def check_ticket_time(self, values, expected):
        def query_result(query, params, as_dict):
            if "tabPOS Invoice" in query:
                return [frappe._dict(invoice_count=1, sales=84000, covers=2)]
            if "TIMESTAMPDIFF" in query:
                # MariaDB coerces the Data serve time '02:03:23' to 2002-03-23.
                return [frappe._dict(avg_ticket_minutes=-12903002 if values else None)]
            return [frappe._dict(production_time=value) for value in values]

        with patch("ury.ury.api.ury_dashboard.frappe.db.sql", side_effect=query_result) as sql:
            result = get_shift_metrics("Salama")
        self.assertEqual(result["avg_ticket_minutes"], expected)
        invoice_query, invoice_params = sql.call_args_list[0].args
        ticket_query, ticket_params = sql.call_args_list[1].args
        self.assertNotIn("TIMESTAMPDIFF", ticket_query.upper())
        self.assertIn("production_time", ticket_query)
        self.assertIn("'Served'", ticket_query)
        self.assertNotIn("start_time_prep", ticket_query)
        self.assertEqual(ticket_params, {
            "start": datetime(2026, 10, 2), "end": datetime(2026, 10, 3), "branch": "Salama",
        })
        self.assertEqual(invoice_params, ticket_params)
        self.assertIn("< %(end)s", invoice_query)
        self.assertIn("< %(end)s", ticket_query)
        self.cache.set_value.assert_called_once_with(
            "ury_dashboard_shift_metrics:Salama", result, expires_in_sec=60,
        )

    def test_ticket_time_averages_only_numeric_nonnegative_samples(self):
        self.check_ticket_time(["10.5", "0", "19.5", "-9", "bad", "", None, "NaN", "inf"], 10.0)

    def test_ticket_time_without_valid_samples_is_none(self):
        self.check_ticket_time(["-9", "bad", "", None, "NaN", "-inf"], None)

    def test_ticket_time_without_served_tickets_is_none(self):
        self.check_ticket_time([], None)

    def test_zero_ticket_time_is_a_valid_sample(self):
        self.check_ticket_time(["0"], 0.0)

    def test_occupied_attention_uses_latest_open_invoice_creation(self):
        with patch("ury.ury.api.ury_dashboard.frappe.get_all", return_value=[]), patch(
            "ury.ury.api.ury_dashboard.frappe.db.sql", side_effect=[[], [{"name": "Table 1"}]],
        ) as sql:
            result = get_needs_attention("Salama")
        self.assertEqual([item["type"] for item in result], ["table_occupied_long"])
        query, params = sql.call_args_list[1].args
        self.assertIn("`tabPOS Invoice`", query)
        self.assertIn("docstatus` = 0", query)
        self.assertIn("MAX(i.`creation`)", query)
        self.assertNotIn("latest_invoice_time", query)
        self.assertEqual(params, {"threshold": datetime(2026, 10, 1, 23, 7), "branch": "Salama"})

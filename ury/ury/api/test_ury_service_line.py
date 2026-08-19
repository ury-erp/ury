import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
from ury.ury.api.ury_service_line import (
    get_service_line,
    get_running_low,
)


class TestGetServiceLine(FrappeTestCase):

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    def test_cache_hit_returns_immediately(self, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        cached_data = [{"table": "Table 1", "stage": "open", "minutes": None}]
        mock_cache_instance.get_value.return_value = cached_data

        result = get_service_line(branch="URY Branch")

        self.assertEqual(result, cached_data)
        mock_cache_instance.get_value.assert_called_once_with("ury_dashboard_service_line:URY Branch")

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    def test_unoccupied_table_stage_open(self, mock_get_all, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 1",
                "occupied": 0,
                "latest_invoice_time": None,
                "is_take_away": 0,
            })
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["table"], "Table 1")
        self.assertEqual(result[0]["stage"], "open")
        self.assertIsNone(result[0]["minutes"])

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_occupied_table_stage_fired_when_kot_not_served(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 14, 30, 0)
        # get_datetime() is called twice in source with different args: once
        # bare for "now", once with t.latest_invoice_time to normalize it.
        # A plain return_value would collapse both calls to the same value
        # and always yield a zero minute delta, so use side_effect to mimic
        # real get_datetime's passthrough-on-datetime-arg behavior.
        mock_get_datetime.side_effect = lambda *args: now if not args else args[0]

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 2",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.side_effect = [
            [frappe._dict({"name": "INV-001"})],
            [frappe._dict({"order_status": "Ready For Prepare"})],
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["stage"], "fired")
        self.assertEqual(result[0]["minutes"], 30)

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_occupied_table_stage_served_when_kot_served(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 14, 30, 0)
        mock_get_datetime.return_value = now

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 3",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.side_effect = [
            [frappe._dict({"name": "INV-002"})],
            [frappe._dict({"order_status": "Served"})],
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(result[0]["stage"], "served")

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_occupied_table_stage_seated_when_no_invoice(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 14, 30, 0)
        mock_get_datetime.return_value = now

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 4",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 15, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.return_value = []

        result = get_service_line(branch="URY Branch")

        self.assertEqual(result[0]["stage"], "seated")

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_take_away_table_is_skipped(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 14, 30, 0)
        mock_get_datetime.return_value = now

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Take Away Table",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 1,
            })
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(len(result), 0)
        mock_sql.assert_not_called()

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.frappe.get_all")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    def test_table_stage_over_when_minutes_exceed_75(self, mock_get_datetime, mock_get_all, mock_sql, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        now = datetime(2026, 8, 19, 15, 45, 0)
        mock_get_datetime.side_effect = lambda *args: now if not args else args[0]

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 5",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.side_effect = [
            [frappe._dict({"name": "INV-003"})],
            [frappe._dict({"order_status": "Served"})],
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(result[0]["stage"], "over")
        self.assertEqual(result[0]["minutes"], 105)


class TestGetRunningLow(FrappeTestCase):

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    def test_cache_hit_returns_immediately(self, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        cached_data = [
            {
                "item_code": "ITEM1",
                "item_name": "Item One",
                "remaining": 50,
                "qty_sold_today": 10,
                "eta_minutes": 300,
                "data_quality_issue": False,
            }
        ]
        mock_cache_instance.get_value.return_value = cached_data

        result = get_running_low(branch="URY Branch")

        self.assertEqual(result, cached_data)
        mock_cache_instance.get_value.assert_called_once()

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.get_value")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    @patch("ury.ury.api.ury_service_line.today")
    def test_running_low_with_items(self, mock_today, mock_get_datetime, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        shift_start = datetime(2026, 8, 19, 0, 0, 0)
        current_time = datetime(2026, 8, 19, 4, 0, 0)
        mock_get_datetime.side_effect = [shift_start, current_time]

        mock_sql.return_value = [
            frappe._dict({
                "item_code": "ITEM1",
                "item_name": "Item One",
                "qty_sold": 10,
            })
        ]

        mock_get_value.side_effect = ["Kitchen - U", 50]

        result = get_running_low(branch="URY Branch")

        self.assertGreater(len(result), 0)
        first_item = result[0]
        self.assertEqual(first_item["item_code"], "ITEM1")
        self.assertEqual(first_item["remaining"], 50)
        self.assertEqual(first_item["qty_sold_today"], 10)
        self.assertIsNotNone(first_item["eta_minutes"])
        self.assertGreater(first_item["eta_minutes"], 0)
        self.assertFalse(first_item["data_quality_issue"])

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.get_value")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    @patch("ury.ury.api.ury_service_line.today")
    def test_running_low_negative_stock_flags_data_quality(self, mock_today, mock_get_datetime, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        shift_start = datetime(2026, 8, 19, 0, 0, 0)
        current_time = datetime(2026, 8, 19, 2, 0, 0)
        mock_get_datetime.side_effect = [shift_start, current_time]

        mock_sql.return_value = [
            frappe._dict({
                "item_code": "ITEM2",
                "item_name": "Item Two",
                "qty_sold": 5,
            })
        ]

        mock_get_value.side_effect = ["Kitchen - U", -20]

        result = get_running_low(branch="URY Branch")

        first_item = result[0]
        self.assertTrue(first_item["data_quality_issue"])
        self.assertEqual(first_item["remaining"], 0)

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.get_value")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    @patch("ury.ury.api.ury_service_line.today")
    def test_running_low_no_items_sold(self, mock_today, mock_get_datetime, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        shift_start = datetime(2026, 8, 19, 0, 0, 0)
        current_time = datetime(2026, 8, 19, 2, 0, 0)
        mock_get_datetime.side_effect = [shift_start, current_time]

        mock_sql.return_value = []

        result = get_running_low(branch="URY Branch")

        self.assertEqual(result, [])
        # The POS Profile warehouse lookup is gated only on `branch` being
        # truthy, not on whether any items sold — it always fires once here
        # since branch="URY Branch". The per-item Bin lookup inside the sold
        # items loop is what's skipped when there's nothing sold.
        mock_get_value.assert_called_once_with("POS Profile", {"branch": "URY Branch"}, "warehouse")

    @patch("ury.ury.api.ury_service_line.frappe.cache")
    @patch("ury.ury.api.ury_service_line.frappe.db.get_value")
    @patch("ury.ury.api.ury_service_line.frappe.db.sql")
    @patch("ury.ury.api.ury_service_line.get_datetime")
    @patch("ury.ury.api.ury_service_line.today")
    def test_running_low_no_branch(self, mock_today, mock_get_datetime, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_today.return_value = "2026-08-19"
        shift_start = datetime(2026, 8, 19, 0, 0, 0)
        current_time = datetime(2026, 8, 19, 3, 0, 0)
        mock_get_datetime.side_effect = [shift_start, current_time]

        mock_sql.return_value = [
            frappe._dict({
                "item_code": "ITEM3",
                "item_name": "Item Three",
                "qty_sold": 20,
            })
        ]

        # branch=None skips the POS Profile warehouse lookup entirely (see
        # `if branch:` guard in get_running_low), so only the per-item Bin
        # lookup fires — a single call, not two.
        mock_get_value.side_effect = [100]

        result = get_running_low(branch=None)

        self.assertGreater(len(result), 0)
        first_item = result[0]
        self.assertEqual(first_item["item_code"], "ITEM3")
        self.assertEqual(first_item["remaining"], 100)

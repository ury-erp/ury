import frappe
import sqlite3
from unittest import TestCase, addModuleCleanup
from unittest.mock import patch, MagicMock
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from ury.ury.api.ury_service_line import (
    get_service_line,
    get_running_low,
)


def setUpModule():
    dashboard_frappe = MagicMock()
    dashboard_frappe.db.get_value.return_value = None
    for target, value in (
        ("ury.ury.api.ury_service_line.frappe", MagicMock()),
        ("ury.ury.api.ury_dashboard.frappe", dashboard_frappe),
        ("frappe.utils.data.get_system_timezone", lambda: "Africa/Kampala"),
    ):
        patcher = patch(target, value)
        patcher.start()
        addModuleCleanup(patcher.stop)


class TestGetServiceLine(TestCase):

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
        mock_get_datetime.side_effect = lambda *args: now if not args else frappe.utils.get_datetime(args[0])

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 2",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.side_effect = [
            [frappe._dict({"name": "INV-001", "creation": datetime(2026, 8, 19, 14)})],
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
            [frappe._dict({"name": "INV-002", "creation": datetime(2026, 8, 19, 14)})],
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
        mock_get_datetime.side_effect = lambda *args: now if not args else frappe.utils.get_datetime(args[0])

        mock_get_all.return_value = [
            frappe._dict({
                "name": "Table 5",
                "occupied": 1,
                "latest_invoice_time": datetime(2026, 8, 19, 14, 0, 0),
                "is_take_away": 0,
            })
        ]

        mock_sql.side_effect = [
            [frappe._dict({"name": "INV-003", "creation": datetime(2026, 8, 19, 14)})],
            [frappe._dict({"order_status": "Served"})],
        ]

        result = get_service_line(branch="URY Branch")

        self.assertEqual(result[0]["stage"], "over")
        self.assertEqual(result[0]["minutes"], 105)


class TestServiceLineInvoiceAge(TestCase):
    def check_age(self, creation, latest_time, expected_minutes, expected_stage):
        now = datetime(2026, 10, 2, 0, 7)

        def site_datetime(value=None):
            if value is None:
                return now
            if isinstance(value, str) and len(value) == 8:
                return datetime.combine(now.date(), time.fromisoformat(value))
            return frappe.utils.get_datetime(value)

        cache = MagicMock()
        cache.get_value.return_value = None
        invoices = [frappe._dict(name="INV-001", creation=creation)] if creation else []
        with patch("ury.ury.api.ury_service_line.frappe.cache", return_value=cache), patch(
            "ury.ury.api.ury_service_line.get_datetime", side_effect=site_datetime,
        ), patch("ury.ury.api.ury_service_line.frappe.get_all", return_value=[
            frappe._dict(name="Table 1", occupied=1, latest_invoice_time=latest_time, is_take_away=0),
        ]), patch("ury.ury.api.ury_service_line.frappe.db.sql", side_effect=[
            invoices, [frappe._dict(order_status="Served")],
        ]) as sql:
            result = get_service_line("Salama")
        self.assertEqual(result, [{"table": "Table 1", "stage": expected_stage, "minutes": expected_minutes}])
        query, params = sql.call_args_list[0].args
        self.assertIn("creation", query.split("FROM")[0])
        self.assertIn("docstatus = 0", query)
        self.assertIn("ORDER BY creation DESC LIMIT 1", query)
        self.assertEqual(params, {"table": "Table 1"})
        cache.set_value.assert_called_once_with("ury_dashboard_service_line:Salama", result, expires_in_sec=15)

    def test_overnight_age_uses_open_invoice_datetime_not_time_only_field(self):
        self.check_age("2026-10-01 23:50:00", timedelta(hours=23, minutes=50), 17, "served")

    def test_future_invoice_age_is_never_negative(self):
        self.check_age("2026-10-02 00:12:00", "00:12:00", 0, "served")

    def test_no_open_invoice_has_no_age_even_when_table_time_exists(self):
        self.check_age(None, "00:00:00", None, "seated")

    def test_open_invoice_has_age_when_table_time_is_missing(self):
        self.check_age("2026-10-01 23:50:00", None, 17, "served")

    def test_over_stage_uses_invoice_age_not_table_time(self):
        self.check_age("2026-10-01 22:22:00", "00:00:00", 105, "over")


class TestGetRunningLow(TestCase):

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
    @patch("frappe.utils.data.now_datetime")
    def test_running_low_with_items(self, mock_now, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_now.return_value = datetime(2026, 8, 19, 4)

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
    @patch("frappe.utils.data.now_datetime")
    def test_running_low_negative_stock_flags_data_quality(self, mock_now, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_now.return_value = datetime(2026, 8, 19, 2)

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
    @patch("frappe.utils.data.now_datetime")
    def test_running_low_no_items_sold(self, mock_now, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_now.return_value = datetime(2026, 8, 19, 2)

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
    @patch("frappe.utils.data.now_datetime")
    def test_running_low_no_branch(self, mock_now, mock_sql, mock_get_value, mock_cache_obj):
        mock_cache_instance = MagicMock()
        mock_cache_obj.return_value = mock_cache_instance
        mock_cache_instance.get_value.return_value = None

        mock_now.return_value = datetime(2026, 8, 19, 3)

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


class TestRunningLowSiteTime(TestCase):
    def setUp(self):
        self.utc_now = datetime(2026, 10, 1, 22, 59, tzinfo=timezone.utc)
        self.site_now = self.utc_now.astimezone(ZoneInfo("Africa/Kampala")).replace(tzinfo=None)
        self.cache = MagicMock()
        self.cache.get_value.return_value = None
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        # Evaluate the emitted sales SQL, with MariaDB's UTC CURDATE and
        # date/time TIMESTAMP functions, rather than returning canned rows.
        self.db.create_function("CURDATE", 0, lambda: self.utc_now.date().isoformat())
        self.db.create_function("TIMESTAMP", 2, lambda date, clock: f"{date} {clock}")
        self.db.executescript("""
            CREATE TABLE `tabPOS Invoice` (
                name TEXT, docstatus INTEGER, posting_date TEXT, posting_time TEXT, branch TEXT
            );
            CREATE TABLE `tabPOS Invoice Item` (
                parent TEXT, item_code TEXT, item_name TEXT, qty REAL
            );
            CREATE TABLE `tabItem` (name TEXT, is_stock_item INTEGER);
            INSERT INTO `tabItem` VALUES ('ITEM1', 1);
        """)
        for target, value in (
            ("frappe.utils.data.now_datetime", lambda: self.site_now),
            ("ury.ury.api.ury_service_line.frappe.cache", MagicMock(return_value=self.cache)),
        ):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def add_sale(self, name, posted_at, qty, branch="Salama", docstatus=1):
        date, clock = posted_at.split(" ")
        self.db.execute("INSERT INTO `tabPOS Invoice` VALUES (?, ?, ?, ?, ?)", (
            name, docstatus, date, clock, branch,
        ))
        self.db.execute("INSERT INTO `tabPOS Invoice Item` VALUES (?, ?, ?, ?)", (
            name, "ITEM1", "Item One", qty,
        ))

    def query_sales(self, query, params, as_dict):
        self.assertTrue(as_dict)
        bindings = {}
        for name, value in params.items():
            query = query.replace(f"%({name})s", f":{name}")
            bindings[name] = value.isoformat(sep=" ") if isinstance(value, datetime) else value
        return [frappe._dict(dict(row)) for row in self.db.execute(query, bindings)]

    def check_running_low(self, branch, hours, start, end, qty_sold, eta_minutes):
        def stock_value(doctype, filters, field):
            if doctype == "POS Profile":
                return "Kitchen - U"
            self.assertEqual(doctype, "Bin")
            self.assertEqual(field, "sum(actual_qty)")
            self.assertEqual(filters, {
                "item_code": "ITEM1", **({"warehouse": "Kitchen - U"} if branch else {}),
            })
            return 12

        with patch("ury.ury.api.ury_dashboard.frappe.db.get_value", return_value=hours), patch(
            "ury.ury.api.ury_service_line.frappe.db.get_value", side_effect=stock_value,
        ), patch("ury.ury.api.ury_service_line.frappe.db.sql", side_effect=self.query_sales) as sql:
            result = get_running_low(branch)
        self.assertEqual(result, [{
            "item_code": "ITEM1", "item_name": "Item One", "remaining": 12,
            "qty_sold_today": qty_sold, "eta_minutes": eta_minutes, "data_quality_issue": False,
        }])
        params = sql.call_args.args[1]
        self.assertEqual(params, {"start": start, "end": end, **({"branch": branch} if branch else {})})
        self.cache.get_value.assert_called_once_with(f"ury_dashboard_running_low:{branch}")
        self.cache.set_value.assert_called_once_with(
            f"ury_dashboard_running_low:{branch}", result, expires_in_sec=60,
        )

    def test_site_0159_finds_sales_when_utc_date_is_previous_day(self):
        self.assertEqual(self.site_now, datetime(2026, 10, 2, 1, 59))
        self.assertEqual(self.utc_now.date().isoformat(), "2026-10-01")
        self.add_sale("INV-SITE", "2026-10-02 00:30:00", 12)
        self.add_sale("INV-OTHER", "2026-10-02 00:30:00", 100, branch="Other")
        self.add_sale("INV-DRAFT", "2026-10-02 00:30:00", 100, docstatus=0)
        self.check_running_low("Salama", None, datetime(2026, 10, 2), datetime(2026, 10, 3), 12, 119)

    def test_before_report_cutoff_uses_previous_business_day_and_elapsed_hours(self):
        self.add_sale("INV-START", "2026-10-01 06:00:00", 6)
        self.add_sale("INV-SITE", "2026-10-02 00:30:00", 6)
        self.add_sale("INV-BEFORE", "2026-10-01 05:59:59", 100)
        self.add_sale("INV-END", "2026-10-02 06:00:00", 100)
        self.check_running_low("Salama", 6, datetime(2026, 10, 1, 6), datetime(2026, 10, 2, 6), 12, 1199)

    def test_after_report_cutoff_uses_current_business_day_and_elapsed_hours(self):
        self.utc_now = datetime(2026, 10, 2, 9, tzinfo=timezone.utc)
        self.site_now = datetime(2026, 10, 2, 12)
        self.add_sale("INV-START", "2026-10-02 06:00:00", 12)
        self.add_sale("INV-BEFORE", "2026-10-02 05:59:59", 100)
        self.add_sale("INV-END", "2026-10-03 06:00:00", 100)
        self.check_running_low("Salama", 6, datetime(2026, 10, 2, 6), datetime(2026, 10, 3, 6), 12, 360)

    def test_elapsed_hours_keeps_half_hour_floor_after_report_cutoff(self):
        self.utc_now = datetime(2026, 10, 2, 3, 10, tzinfo=timezone.utc)
        self.site_now = datetime(2026, 10, 2, 6, 10)
        self.add_sale("INV-START", "2026-10-02 06:00:00", 12)
        self.check_running_low("Salama", 6, datetime(2026, 10, 2, 6), datetime(2026, 10, 3, 6), 12, 30)

    def test_without_branch_uses_site_day_and_all_warehouses(self):
        self.add_sale("INV-SITE", "2026-10-02 00:30:00", 6)
        self.add_sale("INV-OTHER", "2026-10-02 00:30:00", 6, branch="Other")
        self.check_running_low(None, None, datetime(2026, 10, 2), datetime(2026, 10, 3), 12, 119)

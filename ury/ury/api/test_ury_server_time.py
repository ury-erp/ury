from datetime import datetime
from importlib import import_module, util
from unittest import TestCase
from unittest.mock import patch

import frappe


class TestFloorPlanServerTime(TestCase):
    def test_floor_plan_clock_endpoint_returns_authenticated_site_datetime(self):
        module_name = "ury.ury.api.ury_server_time"
        self.assertIsNotNone(
            util.find_spec(module_name),
            "The floor plan needs the existing URY site-clock endpoint",
        )
        module = import_module(module_name)
        self.assertIn(module.get_server_time, frappe.whitelisted)
        self.assertNotIn(module.get_server_time, frappe.guest_methods)
        with patch.object(module, "now_datetime", return_value=datetime(2026, 10, 3, 0, 10)):
            self.assertEqual(module.get_server_time(), "2026-10-03T00:10:00")

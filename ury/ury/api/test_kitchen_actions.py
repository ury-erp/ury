"""Kitchen action contracts, without a Frappe site or database."""

import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from ury.ury.api import ury_kot_display as kitchen


class TestKitchenActions(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 1, 0, 5)
        self.doc = MagicMock()
        self.doc.creation = datetime(2026, 9, 30, 23, 40)
        self.doc.branch = "Branch A"
        self.doc.order_status = "Served"
        self.doc.production_time = "15"
        self.doc.modified = self.now  # Later edits must not extend the recall window.
        self.permission = self.patch(frappe, "has_permission", return_value=True)
        self.patch(frappe, "get_doc", return_value=self.doc)
        self.patch(frappe, "request", SimpleNamespace(method="POST"))
        self.patch(frappe, "session", SimpleNamespace(user="cook@example.com"))
        self.patch(frappe, "get_roles", return_value=["URY Captain"])
        self.set_value = self.patch(frappe, "db", MagicMock()).set_value
        self.patch(kitchen, "getBranch", return_value="Branch A")
        self.patch(kitchen, "get_datetime", side_effect=lambda value=None: (
            self.now if value is None else datetime.fromisoformat(str(value))
        ))
        self.patch(kitchen, "_", side_effect=lambda text: text)
        self.patch(frappe, "throw", side_effect=lambda message, exc=frappe.ValidationError: (
            self.raise_error(message, exc)
        ))

    def patch(self, target, attribute, *args, **kwargs):
        patcher = patch.object(target, attribute, *args, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    @staticmethod
    def raise_error(message, exc):
        raise exc(message)

    def recall(self):
        action = getattr(kitchen, "recall_kot", None)
        self.assertTrue(callable(action), "Kitchen has no served-ticket recall action")
        action("KOT-001")

    def assert_no_write(self):
        self.doc.db_set.assert_not_called()
        self.doc.add_comment.assert_not_called()
        self.set_value.assert_not_called()

    def test_serve_uses_one_document_write_for_value_change_notifications(self):
        kitchen.serve_kot("KOT-001", time="12:00:00")
        self.doc.db_set.assert_called_once_with({
            "start_time_serv": "00:05:00",
            "production_time": 25.0,
            "order_status": "Served",
        })
        self.set_value.assert_not_called()

    def test_serve_still_requires_document_write_permission(self):
        self.permission.return_value = False
        with self.assertRaises(frappe.PermissionError):
            kitchen.serve_kot("KOT-001")
        self.assert_no_write()

    def test_serve_still_rejects_get(self):
        frappe.request.method = "GET"
        with self.assertRaises(frappe.PermissionError):
            kitchen.serve_kot("KOT-001")
        self.assert_no_write()

    def test_recall_resets_served_status_and_records_session_user(self):
        self.recall()
        self.permission.assert_called_once_with("URY KOT", "write", doc=self.doc)
        self.doc.db_set.assert_called_once_with("order_status", "Ready For Prepare")
        self.doc.add_comment.assert_called_once_with("Comment", "Recalled by cook@example.com")
        self.set_value.assert_not_called()

    def test_recall_allows_exactly_fifteen_minutes_after_serving_across_midnight(self):
        self.now += timedelta(minutes=5)
        self.recall()
        self.doc.db_set.assert_called_once_with("order_status", "Ready For Prepare")

    def test_recall_rejects_an_expired_window_despite_a_recent_edit(self):
        self.now += timedelta(minutes=5, seconds=1)
        with self.assertRaisesRegex(frappe.ValidationError, "15 minutes"):
            self.recall()
        self.assert_no_write()

    def test_recall_rejects_wrong_status(self):
        self.doc.order_status = "Ready For Prepare"
        with self.assertRaisesRegex(frappe.ValidationError, "Served"):
            self.recall()
        self.assert_no_write()

    def test_recall_rejects_missing_write_permission(self):
        self.permission.return_value = False
        with self.assertRaises(frappe.PermissionError):
            self.recall()
        self.assert_no_write()

    def test_recall_rejects_another_branch(self):
        self.doc.branch = "Branch B"
        with self.assertRaisesRegex(frappe.PermissionError, "other branches"):
            self.recall()
        self.assert_no_write()

    def test_recall_does_not_bypass_a_missing_branch_for_a_regular_user(self):
        kitchen.getBranch.side_effect = frappe.ValidationError("No branch")
        with self.assertRaisesRegex(frappe.ValidationError, "No branch"):
            self.recall()
        self.assert_no_write()

    def test_recall_retains_the_administrator_branch_fallback(self):
        frappe.session.user = "Administrator"
        kitchen.getBranch.side_effect = frappe.ValidationError("No branch")
        self.recall()
        self.doc.db_set.assert_called_once_with("order_status", "Ready For Prepare")

    def test_recall_rejects_missing_or_invalid_serving_time(self):
        for value in (None, "", "bad", "nan", "inf", "-1"):
            with self.subTest(value=value):
                self.doc.production_time = value
                with self.assertRaises(frappe.ValidationError):
                    self.recall()
                self.assert_no_write()

    def test_recall_rejects_get(self):
        frappe.request.method = "GET"
        with self.assertRaises(frappe.PermissionError):
            self.recall()
        self.assert_no_write()

    def test_active_list_includes_server_clock_for_the_recall_window(self):
        self.patch(frappe, "get_list", return_value=[])
        self.patch(frappe.utils, "now", return_value="2026-10-01 00:05:00")
        self.patch(frappe.utils, "add_to_date", return_value="2026-09-30 21:05:00")
        result = kitchen.kot_list()
        self.assertEqual(result.get("server_time"), "2026-10-01 00:05:00")


if __name__ == "__main__":
    unittest.main()

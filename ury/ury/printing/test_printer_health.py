"""Unit tests for printer health monitoring and failure notifications.

These tests verify that printer health transitions emit exactly one realtime
alert per change, that repeated states are deduplicated, and that print-failure
alerts are deduplicated by print job ID.
"""

from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.printing.notifications import notify_print_failure
from ury.ury.printing.printer_monitor import (
    CUPS_PRINTER_IDLE,
    CUPS_PRINTER_PROCESSING,
    CUPS_PRINTER_STOPPED,
    check_printer_health,
    evaluate_and_notify_printer_health,
)


class FakeCache:
    """Minimal in-memory stand-in for the Frappe Redis cache client."""

    def __init__(self):
        self.hashes = {}
        self.zsets = {}
        self.strings = {}
        self.ttls = {}

    def hset(self, name, key, value):
        self.hashes.setdefault(name, {})[key] = value

    def hget(self, name, key):
        return self.hashes.get(name, {}).get(key)

    def zadd(self, name, mapping):
        self.zsets.setdefault(name, {}).update(mapping)

    def set(self, name, value, nx=False, ex=None):
        if nx and name in self.strings:
            return None
        self.strings[name] = value
        self.ttls[name] = ex
        return True

    def get(self, name):
        return self.strings.get(name)

    def delete(self, *keys):
        for key in keys:
            self.hashes.pop(key, None)
            self.strings.pop(key, None)
            self.zsets.pop(key, None)
            self.ttls.pop(key, None)

    def delete_value(self, keys, make_keys=True):
        if not keys:
            return
        if isinstance(keys, str):
            keys = (keys,)
        self.delete(*keys)

    def make_key(self, key):
        return key

    def scan_iter(self, match=None):
        import fnmatch

        for key in list(self.hashes.keys()):
            if match is None or fnmatch.fnmatch(key, match):
                yield key

    def expire(self, name, time):
        if name in self.hashes or name in self.strings:
            self.ttls[name] = time
        return True


class TestPrinterHealth(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self.fake = FakeCache()
        self.monitor_redis_patch = patch(
            "ury.ury.printing.printer_monitor._redis",
            return_value=self.fake,
        )
        self.notifications_redis_patch = patch(
            "ury.ury.printing.notifications._redis",
            return_value=self.fake,
        )
        self.monitor_redis_patch.start()
        self.notifications_redis_patch.start()

    def tearDown(self):
        self.notifications_redis_patch.stop()
        self.monitor_redis_patch.stop()
        super().tearDown()

    def _set_previous_health_state(self, printer_name, state):
        """Seed a previous ONLINE/OFFLINE state in the fake Redis cache."""
        self.fake.strings[f"printer_health_state:{printer_name}"] = state

    @patch("ury.ury.printing.printer_monitor.cups")
    def test_check_printer_health_online_idle(self, mock_cups):
        """An idle CUPS printer with no blocking reasons is online."""
        mock_conn = MagicMock()
        mock_conn.getPrinters.return_value = {"TestPrinter": {}}
        mock_conn.getPrinterAttributes.return_value = {
            "printer-state": CUPS_PRINTER_IDLE,
            "printer-state-reasons": ["none"],
        }
        mock_cups.Connection.return_value = mock_conn

        result = check_printer_health("127.0.0.1", 631, "TestPrinter")

        self.assertEqual(result["printer_name"], "TestPrinter")
        self.assertTrue(result["is_online"])
        self.assertEqual(result["state"], CUPS_PRINTER_IDLE)
        self.assertEqual(result["reasons"], "none")

    @patch("ury.ury.printing.printer_monitor.cups")
    def test_check_printer_health_online_processing(self, mock_cups):
        """A processing CUPS printer is still considered online."""
        mock_conn = MagicMock()
        mock_conn.getPrinters.return_value = {"TestPrinter": {}}
        mock_conn.getPrinterAttributes.return_value = {
            "printer-state": CUPS_PRINTER_PROCESSING,
            "printer-state-reasons": ["none"],
        }
        mock_cups.Connection.return_value = mock_conn

        result = check_printer_health("127.0.0.1", 631, "TestPrinter")

        self.assertTrue(result["is_online"])
        self.assertEqual(result["state"], CUPS_PRINTER_PROCESSING)

    @patch("ury.ury.printing.printer_monitor.cups")
    def test_check_printer_health_offline_when_stopped(self, mock_cups):
        """A stopped CUPS printer with an error reason is offline."""
        mock_conn = MagicMock()
        mock_conn.getPrinters.return_value = {"TestPrinter": {}}
        mock_conn.getPrinterAttributes.return_value = {
            "printer-state": CUPS_PRINTER_STOPPED,
            "printer-state-reasons": ["media-empty-error"],
        }
        mock_cups.Connection.return_value = mock_conn

        result = check_printer_health("127.0.0.1", 631, "TestPrinter")

        self.assertFalse(result["is_online"])
        self.assertEqual(result["state"], CUPS_PRINTER_STOPPED)
        self.assertIn("media-empty-error", result["reasons"])

    @patch("ury.ury.printing.printer_monitor.cups")
    def test_check_printer_health_missing_printer(self, mock_cups):
        """A printer not present on the CUPS server is offline."""
        mock_conn = MagicMock()
        mock_conn.getPrinters.return_value = {"OtherPrinter": {}}
        mock_cups.Connection.return_value = mock_conn

        result = check_printer_health("127.0.0.1", 631, "TestPrinter")

        self.assertFalse(result["is_online"])
        self.assertIsNone(result["state"])
        self.assertIn("not found", result["reasons"])

    @patch("ury.ury.printing.printer_monitor.cups")
    def test_check_printer_health_cups_exception(self, mock_cups):
        """A CUPS connection exception surfaces as an offline result."""
        mock_cups.Connection.side_effect = Exception("connection refused")

        result = check_printer_health("127.0.0.1", 631, "TestPrinter")

        self.assertFalse(result["is_online"])
        self.assertIsNone(result["state"])
        self.assertIn("connection refused", result["reasons"])

    @patch("ury.ury.printing.printer_monitor.frappe.publish_realtime")
    def test_online_to_offline_transition_fires_notification(self, mock_publish):
        """A health transition ONLINE -> OFFLINE emits one printer_health_alert."""
        printer_name = "Printer-A"
        self._set_previous_health_state(printer_name, "ONLINE")

        result = evaluate_and_notify_printer_health(
            printer_name, is_online=False, reasons="media-empty-error"
        )

        self.assertEqual(result["status"], "notified")
        self.assertEqual(result["previous_state"], "ONLINE")
        self.assertEqual(result["current_state"], "OFFLINE")
        mock_publish.assert_called_once()
        event, payload = mock_publish.call_args.args
        self.assertEqual(event, "printer_health_alert")
        self.assertEqual(payload["printer_name"], printer_name)
        self.assertFalse(payload["is_online"])
        self.assertEqual(payload["reasons"], "media-empty-error")

    @patch("ury.ury.printing.printer_monitor.frappe.publish_realtime")
    def test_repeated_offline_does_not_fire_notification(self, mock_publish):
        """Repeated OFFLINE checks with no state change produce zero notifications."""
        printer_name = "Printer-A"
        self._set_previous_health_state(printer_name, "OFFLINE")

        for _ in range(3):
            result = evaluate_and_notify_printer_health(
                printer_name, is_online=False, reasons="media-empty-error"
            )
            self.assertEqual(result["status"], "unchanged")

        mock_publish.assert_not_called()

    @patch("ury.ury.printing.printer_monitor.frappe.publish_realtime")
    def test_offline_to_online_transition_fires_recovery_notification(self, mock_publish):
        """A health transition OFFLINE -> ONLINE emits one recovery alert."""
        printer_name = "Printer-A"
        self._set_previous_health_state(printer_name, "OFFLINE")

        result = evaluate_and_notify_printer_health(
            printer_name, is_online=True, reasons="none"
        )

        self.assertEqual(result["status"], "notified")
        self.assertEqual(result["previous_state"], "OFFLINE")
        self.assertEqual(result["current_state"], "ONLINE")
        mock_publish.assert_called_once()
        event, payload = mock_publish.call_args.args
        self.assertEqual(event, "printer_health_alert")
        self.assertTrue(payload["is_online"])

    @patch("ury.ury.printing.notifications.frappe.publish_realtime")
    def test_print_failure_deduplication(self, mock_publish):
        """Calling notify_print_failure twice for the same job emits one realtime event."""
        invoice = "INV-001"
        print_job_id = "PJ-fail-001"
        printer_name = "Printer-A"
        reason = "job-stopped"

        first = notify_print_failure(invoice, print_job_id, printer_name, reason)
        second = notify_print_failure(invoice, print_job_id, printer_name, reason)

        self.assertTrue(first)
        self.assertFalse(second)
        mock_publish.assert_called_once()

        event, payload = mock_publish.call_args.args
        self.assertEqual(event, "print_failure_alert")
        self.assertEqual(payload["invoice"], invoice)
        self.assertEqual(payload["print_job_id"], print_job_id)
        self.assertEqual(payload["printer_name"], printer_name)
        self.assertEqual(payload["reason"], reason)

        # Redis key is present with the expected TTL.
        self.assertIn(f"print_failure_notified:{print_job_id}", self.fake.strings)
        self.assertEqual(
            self.fake.ttls[f"print_failure_notified:{print_job_id}"], 86400
        )

"""Unit tests for print-job recovery from CUPS.

These tests verify that ``reconcile_active_print_jobs`` rebuilds the Redis
monitor index after a cache flush without marking jobs as failed and without
re-registering jobs that are already tracked.
"""

from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.printing.print_job_monitor import (
    MONITOR_ZSET,
    get_print_job,
    register_print_job,
)
from ury.ury.printing.recovery import reconcile_active_print_jobs
from ury.ury.printing.state_machine import SUBMITTED


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

    def zrange(self, name, start, stop):
        data = self.zsets.get(name, {})
        return list(data.keys())

    def zrangebyscore(self, name, min_score, max_score):
        data = self.zsets.get(name, {})
        return [member for member, score in data.items() if score <= max_score]

    def zrem(self, name, *members):
        data = self.zsets.get(name, {})
        removed = 0
        for member in members:
            if member in data:
                del data[member]
                removed += 1
        return removed

    def set(self, name, value, nx=False, ex=None):
        if nx and name in self.strings:
            return None
        self.strings[name] = value
        self.ttls[name] = ex
        return True

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


class TestPrintJobRecovery(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self._cleanup_print_job_files()
        self.fake = FakeCache()
        self.redis_patch = patch(
            "ury.ury.printing.print_job_monitor._redis",
            return_value=self.fake,
        )
        self.redis_patch.start()

    def tearDown(self):
        self.redis_patch.stop()
        self._cleanup_print_job_files()
        super().tearDown()

    def _cleanup_print_job_files(self):
        import os

        from ury.ury.printing.file_store import get_print_jobs_dir

        jobs_dir = get_print_jobs_dir()
        for fname in os.listdir(jobs_dir):
            if fname.endswith(".json"):
                try:
                    os.unlink(os.path.join(jobs_dir, fname))
                except Exception:
                    pass

    def _sample_printer_settings(self):
        return [
            {
                "name": "Printer-A-Setting",
                "server_ip": "127.0.0.1",
                "port": 631,
                "printer_name": "Printer-A",
            },
            {
                "name": "Printer-B-Setting",
                "server_ip": "192.168.1.10",
                "port": 631,
                "printer_name": "Printer-B",
            },
        ]

    def _active_cups_jobs(self):
        """Two active CUPS jobs with invoice names matching unprinted POS Invoices."""
        return {
            101: {"job-name": "INV-001"},
            102: {"job-name": "INV-002"},
        }

    def _mock_cups_connection(self, active_jobs):
        """Return a MagicMock CUPS connection that reports ``active_jobs``."""
        mock_conn = MagicMock()
        mock_conn.getJobs.return_value = active_jobs
        return mock_conn

    @patch("ury.ury.printing.recovery.cups")
    @patch("ury.ury.printing.recovery.frappe.get_all")
    def test_reconcile_recovers_active_cups_jobs_when_redis_empty(
        self,
        mock_get_all,
        mock_cups,
    ):
        """Redis empty + active CUPS jobs for unprinted invoices => jobs re-registered."""
        printer_settings = self._sample_printer_settings()

        def get_all_side_effect(doctype, **kwargs):
            if doctype == "Network Printer Settings":
                return printer_settings
            if doctype == "POS Invoice":
                filters = kwargs.get("filters", {})
                names = filters.get("name", [])
                if isinstance(names, list):
                    names = names[1] if len(names) > 1 else []
                return [
                    {"name": "INV-001", "restaurant_table": "T-01"},
                    {"name": "INV-002", "restaurant_table": "T-02"},
                ]
            return []

        mock_get_all.side_effect = get_all_side_effect

        mock_conn = MagicMock()
        mock_conn.getJobs.side_effect = [
            {101: {"job-name": "INV-001"}},
            {102: {"job-name": "INV-002"}},
        ]
        mock_cups.Connection.return_value = mock_conn

        with patch(
            "ury.ury.printing.recovery._make_print_job_id",
            side_effect=["PJ-RECOVER-001", "PJ-RECOVER-002"],
        ):
            result = reconcile_active_print_jobs()

        self.assertEqual(result["printers_checked"], 2)
        self.assertEqual(result["cups_jobs_inspected"], 2)
        self.assertEqual(result["jobs_recovered"], 2)
        self.assertEqual(result["errors"], [])

        # Both jobs must be present in Redis with SUBMITTED status and recovery metadata.
        meta_a = get_print_job("PJ-RECOVER-001")
        self.assertIsNotNone(meta_a)
        self.assertEqual(meta_a["status"], SUBMITTED)
        self.assertEqual(meta_a["cups_job_id"], 101)
        self.assertEqual(meta_a["invoice"], "INV-001")
        self.assertEqual(meta_a["printer_setting"], "Printer-A-Setting")
        self.assertEqual(meta_a["printer_name"], "Printer-A")
        self.assertEqual(meta_a["server_ip"], "127.0.0.1")
        self.assertEqual(meta_a["port"], 631)
        self.assertEqual(meta_a["restaurant_table"], "T-01")
        self.assertTrue(meta_a.get("recovered"))
        self.assertIn("PJ-RECOVER-001", self.fake.zsets.get(MONITOR_ZSET, {}))

        meta_b = get_print_job("PJ-RECOVER-002")
        self.assertIsNotNone(meta_b)
        self.assertEqual(meta_b["status"], SUBMITTED)
        self.assertEqual(meta_b["cups_job_id"], 102)
        self.assertEqual(meta_b["invoice"], "INV-002")
        self.assertEqual(meta_b["printer_setting"], "Printer-B-Setting")
        self.assertIn("PJ-RECOVER-002", self.fake.zsets.get(MONITOR_ZSET, {}))

    @patch("ury.ury.printing.recovery.cups")
    @patch("ury.ury.printing.recovery.frappe.get_all")
    def test_reconcile_skips_jobs_already_tracked_in_redis(
        self,
        mock_get_all,
        mock_cups,
    ):
        """A CUPS job already present in Redis must not be re-registered."""
        existing_metadata = {
            "print_job_id": "PJ-EXISTING",
            "cups_job_id": 101,
            "invoice": "INV-001",
            "printer_setting": "Printer-A-Setting",
            "printer_name": "Printer-A",
            "server_ip": "127.0.0.1",
            "port": 631,
            "status": SUBMITTED,
        }
        register_print_job(existing_metadata)

        def get_all_side_effect(doctype, **kwargs):
            if doctype == "Network Printer Settings":
                return self._sample_printer_settings()
            if doctype == "POS Invoice":
                return [{"name": "INV-001", "restaurant_table": "T-01"}]
            return []

        mock_get_all.side_effect = get_all_side_effect

        mock_conn = MagicMock()
        mock_conn.getJobs.side_effect = [
            {101: {"job-name": "INV-001"}},
            {},
        ]
        mock_cups.Connection.return_value = mock_conn

        result = reconcile_active_print_jobs()

        self.assertEqual(result["printers_checked"], 2)
        self.assertEqual(result["cups_jobs_inspected"], 1)
        self.assertEqual(result["jobs_recovered"], 0)

        # The original job metadata must remain unchanged.
        self.assertEqual(get_print_job("PJ-EXISTING")["invoice"], "INV-001")

    @patch("ury.ury.printing.recovery.cups")
    @patch("ury.ury.printing.recovery.frappe.get_all")
    def test_reconcile_does_not_mark_jobs_failed_on_redis_loss(
        self,
        mock_get_all,
        mock_cups,
    ):
        """Recovery must never mark invoices as failed when Redis is empty."""
        printer_settings = self._sample_printer_settings()

        def get_all_side_effect(doctype, **kwargs):
            if doctype == "Network Printer Settings":
                return printer_settings
            if doctype == "POS Invoice":
                return [{"name": "INV-001", "restaurant_table": "T-01"}]
            return []

        mock_get_all.side_effect = get_all_side_effect

        mock_conn = MagicMock()
        mock_conn.getJobs.return_value = {101: {"job-name": "INV-001"}}
        mock_cups.Connection.return_value = mock_conn

        with patch(
            "ury.ury.printing.recovery._make_print_job_id",
            return_value="PJ-RECOVER-001",
        ):
            result = reconcile_active_print_jobs()

        self.assertEqual(result["jobs_recovered"], 1)

        # No failure notifications, no invoice_printed changes, no terminal states.
        metadata = get_print_job("PJ-RECOVER-001")
        self.assertEqual(metadata["status"], SUBMITTED)
        self.assertNotIn(metadata["status"], {"FAILED", "CANCELED", "COMPLETED"})

    @patch("ury.ury.printing.recovery.cups")
    @patch("ury.ury.printing.recovery.frappe.get_all")
    def test_reconcile_skips_printed_invoices(
        self,
        mock_get_all,
        mock_cups,
    ):
        """Active CUPS jobs whose invoices are already printed must be ignored."""
        printer_settings = self._sample_printer_settings()

        def get_all_side_effect(doctype, **kwargs):
            if doctype == "Network Printer Settings":
                return printer_settings
            if doctype == "POS Invoice":
                # Return empty -> no unprinted invoices match.
                return []
            return []

        mock_get_all.side_effect = get_all_side_effect

        mock_conn = MagicMock()
        mock_conn.getJobs.return_value = {101: {"job-name": "INV-001"}}
        mock_cups.Connection.return_value = mock_conn

        result = reconcile_active_print_jobs()

        self.assertEqual(result["cups_jobs_inspected"], 2)
        self.assertEqual(result["jobs_recovered"], 0)
        self.assertEqual(len(self.fake.zsets.get(MONITOR_ZSET, {})), 0)

    @patch("ury.ury.printing.recovery.cups")
    @patch("ury.ury.printing.recovery.frappe.get_all")
    def test_reconcile_continues_after_cups_connection_failure(
        self,
        mock_get_all,
        mock_cups,
    ):
        """A CUPS connection failure for one printer must not abort the others."""
        printer_settings = self._sample_printer_settings()

        def get_all_side_effect(doctype, **kwargs):
            if doctype == "Network Printer Settings":
                return printer_settings
            if doctype == "POS Invoice":
                return [{"name": "INV-002", "restaurant_table": "T-02"}]
            return []

        mock_get_all.side_effect = get_all_side_effect

        mock_conn_ok = MagicMock()
        mock_conn_ok.getJobs.return_value = {102: {"job-name": "INV-002"}}

        mock_conn_fail = MagicMock()
        mock_conn_fail.getJobs.side_effect = Exception("connection refused")

        mock_cups.Connection.side_effect = [mock_conn_fail, mock_conn_ok]

        with patch(
            "ury.ury.printing.recovery._make_print_job_id",
            return_value="PJ-RECOVER-002",
        ):
            result = reconcile_active_print_jobs()

        self.assertEqual(result["printers_checked"], 2)
        self.assertEqual(result["cups_jobs_inspected"], 1)
        self.assertEqual(result["jobs_recovered"], 1)
        self.assertEqual(len(result["errors"]), 1)
        self.assertIn("connection refused", result["errors"][0])

        metadata = get_print_job("PJ-RECOVER-002")
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["invoice"], "INV-002")

    def test_reconcile_returns_early_when_pycups_unavailable(self):
        """If pycups is not installed the function returns without error."""
        with patch("ury.ury.printing.recovery.cups", None):
            result = reconcile_active_print_jobs()

        self.assertEqual(result["printers_checked"], 0)
        self.assertEqual(result["jobs_recovered"], 0)
        self.assertIn("pycups not available", result["errors"])

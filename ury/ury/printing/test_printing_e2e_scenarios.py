"""End-to-end scenario tests for the URY printing job feedback feature.

These tests exercise the complete print-job lifecycle (state machine, Redis
monitor, CUPS poller, finalizer, printer health, and recovery) for the 12
minimum required scenarios in Section 25 of the specification.

No live hardware, CUPS server, or Redis instance is required: all external
connections are mocked and a lightweight in-memory FakeCache stands in for
``frappe.cache()``.
"""

import time
from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.printing.file_store import delete_job
from ury.ury.printing.finalizer import finalize_print_job
from ury.ury.printing.print_job_monitor import (
    MONITOR_ZSET,
    get_active_print_job_ids,
    get_due_print_jobs,
    get_print_job,
    register_print_job,
)
from ury.ury.printing.print_job_poller import poll_active_print_jobs, poll_single_print_job
from ury.ury.printing.printer_monitor import (
    CUPS_PRINTER_IDLE,
    CUPS_PRINTER_PROCESSING,
    CUPS_PRINTER_STOPPED,
    check_printer_health,
    evaluate_and_notify_printer_health,
)
from ury.ury.printing.recovery import reconcile_active_print_jobs
from ury.ury.printing.state_machine import (
    CANCELED,
    COMPLETED,
    FAILED,
    IPP_JOB_ABORTED,
    IPP_JOB_COMPLETED,
    IPP_JOB_PENDING,
    IPP_JOB_PROCESSING,
    IPP_JOB_STOPPED,
    PENDING,
    PROCESSING,
    SUBMITTED,
    UNKNOWN,
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

    def hdel(self, name, key):
        self.hashes.get(name, {}).pop(key, None)

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

    def get(self, name):
        value = self.strings.get(name)
        if isinstance(value, bytes):
            return value.decode()
        return value

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


class TestPrintingE2EScenarios(FrappeTestCase):
    """Section 25 scenarios A through L."""

    def setUp(self):
        super().setUp()
        self.fake = FakeCache()
        self.redis_patches = [
            patch("ury.ury.printing.print_job_monitor._redis", return_value=self.fake),
            patch("ury.ury.printing.finalizer._redis", return_value=self.fake),
            patch("ury.ury.printing.printer_monitor._redis", return_value=self.fake),
            patch("ury.ury.printing.notifications._redis", return_value=self.fake),
        ]
        for p in self.redis_patches:
            p.start()
        for i in range(ord('A'), ord('M')):
            delete_job(f"PJ-SCENARIO-{chr(i)}")

    def tearDown(self):
        for i in range(ord('A'), ord('M')):
            delete_job(f"PJ-SCENARIO-{chr(i)}")
        for p in reversed(self.redis_patches):
            p.stop()
        super().tearDown()

    def _sample_metadata(
        self,
        print_job_id,
        status=SUBMITTED,
        retry_count=0,
        invoice="INV-E2E-001",
        table="T-E2E-01",
        cups_job_id=1001,
        printer_name="Printer-A",
        server_ip="127.0.0.1",
        port=631,
    ):
        return {
            "print_job_id": print_job_id,
            "cups_job_id": cups_job_id,
            "invoice": invoice,
            "printer_setting": f"{printer_name}-Setting",
            "printer_name": printer_name,
            "server_ip": server_ip,
            "port": port,
            "status": status,
            "retry_count": retry_count,
            "restaurant_table": table,
            "monitoring_deadline": time.time() + 300,
            "long_running_notification_sent": False,
        }

    def _register(self, **kwargs):
        metadata = self._sample_metadata(**kwargs)
        register_print_job(metadata)
        return metadata

    def _lock_key(self, print_job_id):
        return f"print_job_lock:{print_job_id}"

    def _finalized_key(self, print_job_id):
        return f"print_job_finalized:{print_job_id}"

    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_scenario_a_successful_print_lifecycle(
        self, mock_publish, mock_get_attrs, mock_db_set_value, mock_release_tables
    ):
        """Scenario A: SUBMITTED -> PENDING -> PROCESSING -> COMPLETED -> invoice_printed=1."""
        job_id = "PJ-SCENARIO-A"
        self._register(
            print_job_id=job_id,
            status=SUBMITTED,
            invoice="INV-SCENARIO-A",
            table="T-A-01",
        )

        mock_get_attrs.side_effect = [
            {
                "job_state": IPP_JOB_PENDING,
                "job_state_reasons": ["job-pending"],
                "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
                "time_at_completed": None,
            },
            {
                "job_state": IPP_JOB_PROCESSING,
                "job_state_reasons": ["job-printing"],
                "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
                "time_at_completed": None,
            },
            {
                "job_state": IPP_JOB_COMPLETED,
                "job_state_reasons": ["job-completed-successfully"],
                "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
                "time_at_completed": 1_234_567,
            },
        ]

        # SUBMITTED -> PENDING
        poll_single_print_job(job_id)
        self.assertEqual(get_print_job(job_id)["status"], PENDING)

        # PENDING -> PROCESSING
        poll_single_print_job(job_id)
        self.assertEqual(get_print_job(job_id)["status"], PROCESSING)

        # PROCESSING -> COMPLETED
        poll_single_print_job(job_id)
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertIsNotNone(get_print_job(job_id))
        self.assertEqual(get_print_job(job_id)["status"], COMPLETED)

        mock_db_set_value.assert_called_once_with(
            "POS Invoice", "INV-SCENARIO-A", "invoice_printed", 1
        )
        mock_release_tables.assert_called_once_with("T-A-01")

        status_events = [
            call
            for call in mock_publish.call_args_list
            if call.args[0] == "print_job_status_updated"
        ]
        self.assertEqual(len(status_events), 3)

    @patch("ury.ury.printing.finalizer.notify_print_failure")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_scenario_b_failed_print_aborted(
        self, mock_publish, mock_get_attrs, mock_db_set_value, mock_notify_failure
    ):
        """Scenario B: SUBMITTED -> PROCESSING -> ABORTED -> invoice_printed=0 + notification."""
        job_id = "PJ-SCENARIO-B"
        self._register(
            print_job_id=job_id,
            status=SUBMITTED,
            invoice="INV-SCENARIO-B",
            table="T-B-01",
        )

        mock_get_attrs.side_effect = [
            {
                "job_state": IPP_JOB_PROCESSING,
                "job_state_reasons": ["job-printing"],
                "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
                "time_at_completed": None,
            },
            {
                "job_state": IPP_JOB_ABORTED,
                "job_state_reasons": ["job-aborted"],
                "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
                "time_at_completed": None,
            },
        ]

        poll_single_print_job(job_id)
        self.assertEqual(get_print_job(job_id)["status"], PROCESSING)

        poll_single_print_job(job_id)
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertIsNotNone(get_print_job(job_id))
        self.assertEqual(get_print_job(job_id)["status"], FAILED)

        mock_db_set_value.assert_called_once_with(
            "POS Invoice", "INV-SCENARIO-B", "invoice_printed", 0
        )
        mock_notify_failure.assert_called_once()
        self.assertEqual(mock_notify_failure.call_args.kwargs["reason"], "job-aborted")

    @patch("ury.ury.printing.finalizer.notify_print_failure")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_scenario_c_printer_stopped_while_processing(
        self, mock_publish, mock_get_attrs, mock_db_set_value, mock_notify_failure
    ):
        """Scenario C: PROCESSING -> printer stopped -> FAILED -> printer alert + failure alert."""
        job_id = "PJ-SCENARIO-C"
        printer_name = "Printer-C"
        self._register(
            print_job_id=job_id,
            status=PROCESSING,
            invoice="INV-SCENARIO-C",
            table="T-C-01",
            printer_name=printer_name,
        )

        # First simulate the job still processing while printer health check reports stopped.
        mock_get_attrs.side_effect = [
            {
                "job_state": IPP_JOB_STOPPED,
                "job_state_reasons": ["job-stopped"],
                "printer_uri": "ipp://127.0.0.1:631/printers/Printer-C",
                "time_at_completed": None,
            },
        ]

        with patch("ury.ury.printing.printer_monitor.cups") as mock_cups:
            mock_conn = MagicMock()
            mock_conn.getPrinters.return_value = {printer_name: {}}
            mock_conn.getPrinterAttributes.return_value = {
                "printer-state": CUPS_PRINTER_STOPPED,
                "printer-state-reasons": ["media-empty-error"],
            }
            mock_cups.Connection.return_value = mock_conn

            # Seed previous ONLINE state so the transition fires an alert.
            self.fake.strings[f"printer_health_state:{printer_name}"] = "ONLINE"

            poll_single_print_job(job_id)

            health = check_printer_health("127.0.0.1", 631, printer_name)
            self.assertFalse(health["is_online"])

            notify_result = evaluate_and_notify_printer_health(
                printer_name, is_online=False, reasons="media-empty-error"
            )
            self.assertEqual(notify_result["status"], "notified")
            self.assertEqual(notify_result["previous_state"], "ONLINE")
            self.assertEqual(notify_result["current_state"], "OFFLINE")

        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertIsNotNone(get_print_job(job_id))
        self.assertEqual(get_print_job(job_id)["status"], FAILED)
        mock_db_set_value.assert_called_once_with(
            "POS Invoice", "INV-SCENARIO-C", "invoice_printed", 0
        )
        mock_notify_failure.assert_called_once()

    @patch("ury.ury.printing.printer_monitor.frappe.publish_realtime")
    def test_scenario_d_printer_recovery_one_alert(self, mock_publish):
        """Scenario D: OFFLINE -> ONLINE -> exactly 1 recovery alert."""
        printer_name = "Printer-D"
        self.fake.strings[f"printer_health_state:{printer_name}"] = "OFFLINE"

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

        # A second evaluation while still ONLINE must not alert again.
        mock_publish.reset_mock()
        result = evaluate_and_notify_printer_health(
            printer_name, is_online=True, reasons="none"
        )
        self.assertEqual(result["status"], "unchanged")
        mock_publish.assert_not_called()

    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_scenario_e_long_running_job_adaptive_backoff(
        self, mock_publish, mock_get_attrs, mock_db_set_value, mock_release_tables
    ):
        """Scenario E: long-running PROCESSING job backs off without blocking then COMPLETED."""
        job_id = "PJ-SCENARIO-E"
        self._register(
            print_job_id=job_id,
            status=PROCESSING,
            retry_count=0,
            invoice="INV-SCENARIO-E",
            table="T-E-01",
        )

        processing_response = {
            "job_state": IPP_JOB_PROCESSING,
            "job_state_reasons": ["job-printing"],
            "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
            "time_at_completed": None,
        }
        completed_response = {
            "job_state": IPP_JOB_COMPLETED,
            "job_state_reasons": ["job-completed-successfully"],
            "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
            "time_at_completed": 1_234_567,
        }

        # First two polls see the job actively processing.
        # Then CUPS misses the job repeatedly, raising retry_count and triggering backoff.
        # Finally CUPS sees the completed job.
        mock_get_attrs.side_effect = [
            processing_response,
            processing_response,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            completed_response,
        ]

        previous_score = self.fake.zsets[MONITOR_ZSET][job_id]
        intervals = []
        for _ in range(9):
            poll_single_print_job(job_id)
            metadata = get_print_job(job_id)
            self.assertEqual(metadata["status"], PROCESSING)
            current_score = self.fake.zsets[MONITOR_ZSET][job_id]
            intervals.append(current_score - previous_score)
            previous_score = current_score
            # The poller must return promptly (no blocking sleep in this thread).

        # After the threshold (retry_count > 5) intervals should grow.
        metadata = get_print_job(job_id)
        self.assertGreater(metadata["retry_count"], 5)
        self.assertGreater(intervals[-1], intervals[0])

        poll_single_print_job(job_id)
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertIsNotNone(get_print_job(job_id))
        self.assertEqual(get_print_job(job_id)["status"], COMPLETED)
        mock_db_set_value.assert_called_once_with(
            "POS Invoice", "INV-SCENARIO-E", "invoice_printed", 1
        )

    @patch("ury.ury.printing.recovery.cups")
    @patch("ury.ury.printing.recovery.frappe.get_all")
    def test_scenario_f_redis_restart_reconciles_without_false_failure(
        self, mock_get_all, mock_cups
    ):
        """Scenario F: Redis restart recovers active CUPS jobs without marking failure."""
        printer_settings = [
            {
                "name": "Printer-F-Setting",
                "server_ip": "127.0.0.1",
                "port": 631,
                "printer_name": "Printer-F",
            }
        ]

        def get_all_side_effect(doctype, **kwargs):
            if doctype == "Network Printer Settings":
                return printer_settings
            if doctype == "POS Invoice":
                return [{"name": "INV-SCENARIO-F", "restaurant_table": "T-F-01"}]
            return []

        mock_get_all.side_effect = get_all_side_effect

        mock_conn = MagicMock()
        mock_conn.getJobs.return_value = {2001: {"job-name": "INV-SCENARIO-F"}}
        mock_cups.Connection.return_value = mock_conn

        # Simulate Redis restart by ensuring the monitor zset is empty.
        self.assertEqual(get_active_print_job_ids(), [])

        with patch(
            "ury.ury.printing.recovery._make_print_job_id",
            return_value="PJ-SCENARIO-F",
        ):
            result = reconcile_active_print_jobs()

        self.assertEqual(result["jobs_recovered"], 1)

        metadata = get_print_job("PJ-SCENARIO-F")
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["status"], SUBMITTED)
        self.assertNotIn(metadata["status"], {FAILED, CANCELED, COMPLETED})
        self.assertEqual(metadata["invoice"], "INV-SCENARIO-F")
        self.assertTrue(metadata.get("recovered"))

    @patch("ury.ury.printing.recovery.cups")
    @patch("ury.ury.printing.recovery.frappe.get_all")
    def test_scenario_g_frappe_restart_monitoring_resumes_cleanly(
        self, mock_get_all, mock_cups
    ):
        """Scenario G: After Frappe restart, active jobs are re-registered and polled."""
        printer_settings = [
            {
                "name": "Printer-G-Setting",
                "server_ip": "127.0.0.1",
                "port": 631,
                "printer_name": "Printer-G",
            }
        ]

        def get_all_side_effect(doctype, **kwargs):
            if doctype == "Network Printer Settings":
                return printer_settings
            if doctype == "POS Invoice":
                return [{"name": "INV-SCENARIO-G", "restaurant_table": "T-G-01"}]
            return []

        mock_get_all.side_effect = get_all_side_effect

        mock_conn = MagicMock()
        mock_conn.getJobs.return_value = {2002: {"job-name": "INV-SCENARIO-G"}}
        mock_cups.Connection.return_value = mock_conn

        with patch(
            "ury.ury.printing.recovery._make_print_job_id",
            return_value="PJ-SCENARIO-G",
        ):
            reconcile_active_print_jobs()

        # Now poll the recovered job to completion.
        with patch(
            "ury.ury.printing.print_job_poller.get_cups_job_attributes",
            return_value={
                "job_state": IPP_JOB_COMPLETED,
                "job_state_reasons": ["job-completed-successfully"],
                "printer_uri": "ipp://127.0.0.1:631/printers/Printer-G",
                "time_at_completed": 1_234_567,
            },
        ):
            with patch("ury.ury.printing.finalizer.frappe.db.set_value") as mock_db_set_value:
                with patch(
                    "ury.ury.printing.finalizer.release_merge_cluster_tables"
                ) as mock_release_tables:
                    poll_single_print_job("PJ-SCENARIO-G")

        self.assertNotIn("PJ-SCENARIO-G", self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertIsNotNone(get_print_job("PJ-SCENARIO-G"))
        self.assertEqual(get_print_job("PJ-SCENARIO-G")["status"], COMPLETED)
        mock_db_set_value.assert_called_once_with(
            "POS Invoice", "INV-SCENARIO-G", "invoice_printed", 1
        )
        mock_release_tables.assert_called_once_with("T-G-01")

    @patch("ury.ury.printing.recovery.cups")
    @patch("ury.ury.printing.recovery.frappe.get_all")
    def test_scenario_h_cups_restart_jobs_reconcile_safely(
        self, mock_get_all, mock_cups
    ):
        """Scenario H: CUPS restart does not crash recovery or mark jobs failed."""
        printer_settings = [
            {
                "name": "Printer-H-Setting",
                "server_ip": "127.0.0.1",
                "port": 631,
                "printer_name": "Printer-H",
            }
        ]

        def get_all_side_effect(doctype, **kwargs):
            if doctype == "Network Printer Settings":
                return printer_settings
            if doctype == "POS Invoice":
                return [{"name": "INV-SCENARIO-H", "restaurant_table": "T-H-01"}]
            return []

        mock_get_all.side_effect = get_all_side_effect

        # First invocation simulates CUPS being unreachable (mid-restart).
        mock_conn_fail = MagicMock()
        mock_conn_fail.getJobs.side_effect = Exception("connection refused")

        # Second invocation succeeds.
        mock_conn_ok = MagicMock()
        mock_conn_ok.getJobs.return_value = {2003: {"job-name": "INV-SCENARIO-H"}}

        mock_cups.Connection.side_effect = [mock_conn_fail, mock_conn_ok]

        # First reconcile: CUPS down, should record error but not crash.
        result_fail = reconcile_active_print_jobs()
        self.assertEqual(len(result_fail["errors"]), 1)
        self.assertEqual(result_fail["jobs_recovered"], 0)

        with patch(
            "ury.ury.printing.recovery._make_print_job_id",
            return_value="PJ-SCENARIO-H",
        ):
            result_ok = reconcile_active_print_jobs()

        self.assertEqual(result_ok["jobs_recovered"], 1)
        metadata = get_print_job("PJ-SCENARIO-H")
        self.assertEqual(metadata["status"], SUBMITTED)
        self.assertEqual(metadata["cups_job_id"], 2003)

    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_scenario_i_duplicate_monitor_prevents_double_finalization(
        self, mock_publish, mock_get_attrs, mock_db_set_value, mock_release_tables
    ):
        """Scenario I: two workers polling the same job finalize only once."""
        job_id = "PJ-SCENARIO-I"
        self._register(
            print_job_id=job_id,
            status=PENDING,
            invoice="INV-SCENARIO-I",
            table="T-I-01",
        )

        mock_get_attrs.return_value = {
            "job_state": IPP_JOB_COMPLETED,
            "job_state_reasons": ["job-completed-successfully"],
            "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
            "time_at_completed": 1_234_567,
        }

        # Simulate the first worker holding the lock.
        self.fake.strings[self._lock_key(job_id)] = "1"

        poll_single_print_job(job_id)
        # No CUPS call, no finalization because the lock is held.
        mock_get_attrs.assert_not_called()
        self.assertIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))

        # First worker releases lock; second worker polls and finalizes.
        self.fake.strings.pop(self._lock_key(job_id), None)
        poll_single_print_job(job_id)

        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertIsNotNone(get_print_job(job_id))
        self.assertEqual(get_print_job(job_id)["status"], COMPLETED)
        mock_db_set_value.assert_called_once()
        mock_release_tables.assert_called_once()

    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_scenario_j_multiple_printers_aggregate_result(
        self, mock_publish, mock_get_attrs, mock_db_set_value, mock_release_tables
    ):
        """Scenario J: invoice printed to multiple CUPS jobs tracked independently."""
        invoice = "INV-SCENARIO-J"
        table = "T-J-01"

        job_a = "PJ-SCENARIO-J-A"
        job_b = "PJ-SCENARIO-J-B"
        meta_a = self._sample_metadata(
            print_job_id=job_a,
            status=PENDING,
            invoice=invoice,
            table=table,
            cups_job_id=3001,
            printer_name="Printer-J-A",
        )
        meta_b = self._sample_metadata(
            print_job_id=job_b,
            status=PENDING,
            invoice=invoice,
            table=table,
            cups_job_id=3002,
            printer_name="Printer-J-B",
        )
        register_print_job(meta_a)
        register_print_job(meta_b)

        def _side_effect(server_ip, port, cups_job_id):
            if cups_job_id == 3001:
                return {
                    "job_state": IPP_JOB_COMPLETED,
                    "job_state_reasons": ["job-completed-successfully"],
                    "printer_uri": "ipp://127.0.0.1:631/printers/Printer-J-A",
                    "time_at_completed": 1_234_567,
                }
            if cups_job_id == 3002:
                return {
                    "job_state": IPP_JOB_COMPLETED,
                    "job_state_reasons": ["job-completed-successfully"],
                    "printer_uri": "ipp://127.0.0.1:631/printers/Printer-J-B",
                    "time_at_completed": 1_234_568,
                }
            return None

        mock_get_attrs.side_effect = _side_effect

        # Force both jobs due.
        self.fake.zsets[MONITOR_ZSET][job_a] = 0
        self.fake.zsets[MONITOR_ZSET][job_b] = 0

        poll_active_print_jobs()

        self.assertNotIn(job_a, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertIsNotNone(get_print_job(job_a))
        self.assertEqual(get_print_job(job_a)["status"], COMPLETED)
        self.assertNotIn(job_b, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertIsNotNone(get_print_job(job_b))
        self.assertEqual(get_print_job(job_b)["status"], COMPLETED)
        # Both jobs independently finalized the same invoice.
        self.assertEqual(mock_db_set_value.call_count, 2)
        for call in mock_db_set_value.call_args_list:
            self.assertEqual(call.args, ("POS Invoice", invoice, "invoice_printed", 1))

    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_scenario_k_cups_job_unresolvable_stops_monitoring_keeps_invoice_unprinted(
        self, mock_publish, mock_get_attrs, mock_db_set_value
    ):
        """Scenario K: unresolvable CUPS job stops monitoring; invoice_printed stays 0."""
        job_id = "PJ-SCENARIO-K"
        self._register(
            print_job_id=job_id,
            status=PROCESSING,
            retry_count=10,
            invoice="INV-SCENARIO-K",
            table="T-K-01",
        )

        mock_get_attrs.return_value = None

        poll_single_print_job(job_id)

        metadata = get_print_job(job_id)
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["status"], FAILED)
        self.assertEqual(metadata["retry_count"], 10)
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertTrue(metadata.get("long_running_notification_sent"))
        self.assertTrue(metadata.get("observation_timed_out"))
        mock_db_set_value.assert_called_with(
            "POS Invoice", "INV-SCENARIO-K", "invoice_printed", 0
        )

    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    def test_scenario_l_duplicate_completed_event_finalized_once(
        self, mock_db_set_value, mock_release_tables
    ):
        """Scenario L: COMPLETED received twice -> finalized exactly once."""
        job_id = "PJ-SCENARIO-L"
        self._register(
            print_job_id=job_id,
            status=PROCESSING,
            invoice="INV-SCENARIO-L",
            table="T-L-01",
        )

        first = finalize_print_job(job_id, COMPLETED)
        second = finalize_print_job(job_id, COMPLETED)

        self.assertEqual(first["status"], "Finalized")
        self.assertEqual(second["status"], "Already Finalized")
        mock_db_set_value.assert_called_once_with(
            "POS Invoice", "INV-SCENARIO-L", "invoice_printed", 1
        )
        mock_release_tables.assert_called_once_with("T-L-01")

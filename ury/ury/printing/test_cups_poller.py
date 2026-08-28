"""Unit tests for the CUPS print job poller.

The tests mock CUPS responses and assert that state transitions, realtime
publications, and Redis cleanup behave as specified.
"""

import time
from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.printing.print_job_monitor import (
    MONITOR_ZSET,
    get_due_print_jobs,
    get_print_job,
    register_print_job,
)
from ury.ury.printing.print_job_poller import (
    MAX_RETRIES,
    poll_active_print_jobs,
    poll_single_print_job,
)
from ury.ury.printing.state_machine import (
    COMPLETED,
    FAILED,
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

    def zadd(self, name, mapping):
        self.zsets.setdefault(name, {}).update(mapping)

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


class TestCupsPoller(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self.fake = FakeCache()
        self.redis_patches = [
            patch(
                "ury.ury.printing.print_job_monitor._redis",
                return_value=self.fake,
            ),
            patch(
                "ury.ury.printing.notifications._redis",
                return_value=self.fake,
            ),
        ]
        for p in self.redis_patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.redis_patches):
            p.stop()
        super().tearDown()

    def _sample_metadata(self, print_job_id, status=SUBMITTED, retry_count=0):
        return {
            "print_job_id": print_job_id,
            "cups_job_id": 123,
            "invoice": "INV-001",
            "printer_setting": "Printer-A",
            "printer_name": "Kitchen Printer",
            "server_ip": "127.0.0.1",
            "port": 631,
            "status": status,
            "retry_count": retry_count,
            "monitoring_deadline": time.time() + 300,
            "long_running_notification_sent": False,
        }

    def _register(self, print_job_id, status=SUBMITTED, retry_count=0):
        metadata = self._sample_metadata(print_job_id, status, retry_count)
        register_print_job(metadata)
        return metadata

    def _lock_key(self, print_job_id):
        return f"print_job_lock:{print_job_id}"

    @patch("ury.ury.printing.print_job_poller.finalize_print_job")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    def test_pending_to_processing_to_completed(
        self, mock_get_attrs, mock_publish, mock_finalize
    ):
        """A job moves through PENDING -> PROCESSING -> COMPLETED and is cleaned up."""
        job_id = "PJ-pending-processing-completed"
        self._register(job_id, status=PENDING, retry_count=0)

        mock_get_attrs.side_effect = [
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

        # First poll: PENDING -> PROCESSING
        poll_single_print_job(job_id)

        metadata = get_print_job(job_id)
        self.assertEqual(metadata["status"], PROCESSING)
        self.assertEqual(metadata["retry_count"], 0)
        self.assertEqual(metadata["cups_state_reason"], "job-printing")
        self.assertIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))

        # Realtime event published after PROCESSING
        mock_publish.assert_called_once()
        event, payload = mock_publish.call_args.args
        self.assertEqual(event, "print_job_status_updated")
        self.assertEqual(payload["print_job_id"], job_id)
        self.assertEqual(payload["cups_job_id"], 123)
        self.assertEqual(payload["invoice"], "INV-001")
        self.assertEqual(payload["status"], PROCESSING)
        self.assertEqual(payload["cups_state_reason"], "job-printing")

        # Second poll: PROCESSING -> COMPLETED
        mock_publish.reset_mock()
        poll_single_print_job(job_id)

        metadata = get_print_job(job_id)
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["status"], COMPLETED)
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))

        mock_publish.assert_called_once()
        event, payload = mock_publish.call_args.args
        self.assertEqual(payload["status"], COMPLETED)
        self.assertEqual(payload["cups_state_reason"], "job-completed-successfully")

        mock_finalize.assert_called_once_with(
            job_id, COMPLETED, failure_reason="job-completed-successfully"
        )

        # Lock must be released after terminal cleanup.
        self.assertNotIn(self._lock_key(job_id), self.fake.strings)

    @patch("ury.ury.printing.print_job_poller.finalize_print_job")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    def test_processing_to_stopped_maps_to_failed(
        self, mock_get_attrs, mock_publish, mock_finalize
    ):
        """A CUPS STOPPED job maps to URY FAILED and is removed from Redis."""
        job_id = "PJ-processing-stopped"
        self._register(job_id, status=PROCESSING, retry_count=0)

        mock_get_attrs.return_value = {
            "job_state": IPP_JOB_STOPPED,
            "job_state_reasons": ["job-stopped"],
            "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
            "time_at_completed": None,
        }

        poll_single_print_job(job_id)

        metadata = get_print_job(job_id)
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["status"], FAILED)
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertNotIn(self._lock_key(job_id), self.fake.strings)

        mock_publish.assert_called_once()
        event, payload = mock_publish.call_args.args
        self.assertEqual(event, "print_job_status_updated")
        self.assertEqual(payload["status"], FAILED)
        self.assertEqual(payload["cups_state_reason"], "job-stopped")

        mock_finalize.assert_called_once_with(job_id, FAILED, failure_reason="job-stopped")

    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.finalize_print_job")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_disappearing_job_stops_monitoring_after_max_retries(
        self, mock_publish, mock_finalize, mock_get_attrs
    ):
        """A job that vanishes from CUPS marks FAILED and stops monitoring once retries are exhausted."""
        job_id = "PJ-disappeared"
        self._register(job_id, status=PROCESSING, retry_count=MAX_RETRIES)

        mock_get_attrs.return_value = None

        poll_single_print_job(job_id)

        metadata = get_print_job(job_id)
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["status"], FAILED)
        self.assertEqual(metadata["retry_count"], MAX_RETRIES)
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        self.assertTrue(metadata.get("long_running_notification_sent"))
        self.assertTrue(metadata.get("observation_timed_out"))
        self.assertNotIn(self._lock_key(job_id), self.fake.strings)

        mock_finalize.assert_called_once_with(
            job_id, FAILED, failure_reason="Max retries exceeded while querying printer"
        )
        self.assertEqual(mock_publish.call_count, 2)

    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    def test_retry_count_increments_while_job_missing(self, mock_get_attrs, mock_publish):
        """Retry count increments each time CUPS cannot find the job."""
        job_id = "PJ-retrying"
        self._register(job_id, status=SUBMITTED, retry_count=0)

        mock_get_attrs.return_value = None

        poll_single_print_job(job_id)

        metadata = get_print_job(job_id)
        self.assertEqual(metadata["status"], SUBMITTED)
        self.assertEqual(metadata["retry_count"], 1)
        self.assertIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))

        # Realtime should not fire when the state has not changed.
        mock_publish.assert_not_called()

    @patch("ury.ury.printing.print_job_poller.finalize_print_job")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    def test_poll_active_print_jobs_iterates_due_jobs(
        self, mock_get_attrs, mock_publish, mock_finalize
    ):
        """The whitelisted entry point polls every due job once."""
        job_a = "PJ-active-a"
        job_b = "PJ-active-b"

        meta_a = self._sample_metadata(job_a, status=PENDING, retry_count=0)
        meta_a["cups_job_id"] = 1
        register_print_job(meta_a)

        meta_b = self._sample_metadata(job_b, status=PENDING, retry_count=0)
        meta_b["cups_job_id"] = 2
        register_print_job(meta_b)

        # Force both jobs to be due.
        self.fake.zsets[MONITOR_ZSET][job_a] = 0
        self.fake.zsets[MONITOR_ZSET][job_b] = 0

        def _side_effect(server_ip, port, cups_job_id):
            if cups_job_id == 1:
                return {
                    "job_state": IPP_JOB_COMPLETED,
                    "job_state_reasons": ["job-completed-successfully"],
                    "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
                    "time_at_completed": 1_234_567,
                }
            if cups_job_id == 2:
                return {
                    "job_state": IPP_JOB_PROCESSING,
                    "job_state_reasons": ["job-printing"],
                    "printer_uri": "ipp://127.0.0.1:631/printers/Printer-B",
                    "time_at_completed": None,
                }
            return None

        mock_get_attrs.side_effect = _side_effect

        poll_active_print_jobs()

        metadata_a = get_print_job(job_a)
        self.assertIsNotNone(metadata_a)
        self.assertEqual(metadata_a["status"], COMPLETED)
        self.assertNotIn(job_a, self.fake.zsets.get(MONITOR_ZSET, {}))

        metadata_b = get_print_job(job_b)
        self.assertEqual(metadata_b["status"], PROCESSING)
        self.assertIn(job_b, self.fake.zsets.get(MONITOR_ZSET, {}))

        self.assertEqual(mock_publish.call_count, 2)
        self.assertNotIn(self._lock_key(job_a), self.fake.strings)
        self.assertNotIn(self._lock_key(job_b), self.fake.strings)

    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    def test_lock_already_held_skips_polling(self, mock_get_attrs, mock_publish):
        """If another worker holds the lock, polling is skipped for that job."""
        job_id = "PJ-locked"
        self._register(job_id, status=PENDING, retry_count=0)
        self.fake.strings[self._lock_key(job_id)] = "1"

        poll_single_print_job(job_id)

        mock_get_attrs.assert_not_called()
        mock_publish.assert_not_called()

    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_lock_released_even_when_polling_raises(self, mock_publish):
        """The Redis lock is released in a finally block even on exceptions."""
        job_id = "PJ-exception"
        self._register(job_id, status=PENDING, retry_count=0)

        with patch(
            "ury.ury.printing.print_job_poller.get_cups_job_attributes",
            side_effect=RuntimeError("boom"),
        ):
            poll_single_print_job(job_id)

        self.assertNotIn(self._lock_key(job_id), self.fake.strings)
        mock_publish.assert_not_called()

    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_orphaned_zset_entry_cleanup(self, mock_publish):
        """When get_print_job returns None, stop_monitoring_print_job should be called."""
        job_id = "PJ-orphan"
        self.fake.zsets[MONITOR_ZSET] = {job_id: 0}

        poll_single_print_job(job_id)

        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        mock_publish.assert_not_called()

    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.finalize_print_job")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_observation_timeout_stops_monitoring(self, mock_publish, mock_finalize, mock_get_attrs):
        """CUPS is queried first; only then does the expired deadline mark FAILED and stop monitoring."""
        job_id = "PJ-timeout"
        metadata = self._sample_metadata(job_id, status=PROCESSING, retry_count=0)
        metadata["monitoring_deadline"] = time.time() - 1
        register_print_job(metadata)

        mock_get_attrs.return_value = None

        poll_single_print_job(job_id)

        metadata = get_print_job(job_id)
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["status"], FAILED)
        self.assertEqual(metadata["failure_reason"], "Observation timeout exceeded")
        # retry_count incremented proves CUPS was queried before the deadline check.
        self.assertEqual(metadata["retry_count"], 1)
        self.assertTrue(metadata.get("long_running_notification_sent"))
        self.assertTrue(metadata.get("observation_timed_out"))
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))

        mock_get_attrs.assert_called_once_with("127.0.0.1", 631, 123)
        self.assertEqual(mock_publish.call_count, 2)
        mock_finalize.assert_called_once_with(
            job_id, FAILED, failure_reason="Observation timeout exceeded"
        )

    @patch("ury.ury.printing.print_job_poller.finalize_print_job")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    def test_completed_after_monitoring_deadline_finalizes(
        self, mock_get_attrs, mock_publish, mock_finalize
    ):
        """A CUPS COMPLETED response wins over an expired monitoring_deadline."""
        job_id = "PJ-completed-after-deadline"
        metadata = self._sample_metadata(job_id, status=PROCESSING, retry_count=0)
        metadata["monitoring_deadline"] = time.time() - 1
        register_print_job(metadata)

        mock_get_attrs.return_value = {
            "job_state": IPP_JOB_COMPLETED,
            "job_state_reasons": ["job-completed-successfully"],
            "printer_uri": "ipp://127.0.0.1:631/printers/Printer-A",
            "time_at_completed": 1_234_567,
        }

        poll_single_print_job(job_id)

        metadata = get_print_job(job_id)
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["status"], COMPLETED)
        self.assertFalse(metadata.get("long_running_notification_sent", False))
        self.assertFalse(metadata.get("observation_timed_out", False))
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))

        mock_get_attrs.assert_called_once_with("127.0.0.1", 631, 123)
        mock_publish.assert_called_once()
        event, payload = mock_publish.call_args.args
        self.assertEqual(event, "print_job_status_updated")
        self.assertEqual(payload["status"], COMPLETED)

        mock_finalize.assert_called_once_with(
            job_id, COMPLETED, failure_reason="job-completed-successfully"
        )

    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    @patch("ury.ury.printing.print_job_poller.finalize_print_job")
    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    def test_max_retries_stops_monitoring(self, mock_publish, mock_finalize, mock_get_attrs):
        """When MAX_RETRIES exceeded, marks FAILED and stops monitoring."""
        job_id = "PJ-max-retries"
        metadata = self._sample_metadata(job_id, status=PROCESSING, retry_count=MAX_RETRIES)
        register_print_job(metadata)

        mock_get_attrs.return_value = None

        poll_single_print_job(job_id)

        metadata = get_print_job(job_id)
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["status"], FAILED)
        self.assertTrue(metadata.get("long_running_notification_sent"))
        self.assertTrue(metadata.get("observation_timed_out"))
        self.assertEqual(metadata["retry_count"], MAX_RETRIES)
        self.assertNotIn(job_id, self.fake.zsets.get(MONITOR_ZSET, {}))
        mock_finalize.assert_called_once_with(
            job_id, FAILED, failure_reason="Max retries exceeded while querying printer"
        )
        self.assertEqual(mock_publish.call_count, 2)

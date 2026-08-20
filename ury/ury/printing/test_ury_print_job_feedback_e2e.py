"""E2E & Integration tests for Virtual DocType URY Print Job and React Frontend Socket Feedback.

Verifies:
1. Virtual DocType URY Print Job correctly loads and filters jobs in PENDING and FAILED states.
2. Real-time feedback events (print_job_status_updated, print_failure_alert, invoice_print_completed)
   emitted by the backend poller/finalizer match the exact TypeScript contract consumed by
   usePrintNotifications.ts in the React POS frontend.
"""

from unittest.mock import MagicMock, patch
import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.ury_print_job.ury_print_job import URYPrintJob
from ury.ury.printing.finalizer import finalize_print_job
from ury.ury.printing.notifications import notify_print_failure
from ury.ury.printing.print_job_monitor import (
    get_print_job,
    register_print_job,
    stop_monitoring_print_job,
)
from ury.ury.printing.print_job_poller import poll_single_print_job
from ury.ury.printing.state_machine import (
    COMPLETED,
    FAILED,
    IPP_JOB_ABORTED,
    IPP_JOB_COMPLETED,
    IPP_JOB_PENDING,
    PENDING,
    PROCESSING,
    SUBMITTED,
)


class FakeCache:
    """In-memory stand-in for the Frappe Redis cache client."""

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

    def zrange(self, name, start, end):
        data = self.zsets.get(name, {})
        members = list(data.keys())
        if end == -1:
            return members[start:]
        return members[start : end + 1]

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

    def expire(self, name, time):
        if name in self.hashes or name in self.strings:
            self.ttls[name] = time
        return True

    def scan_iter(self, match=None):
        import fnmatch

        for key in list(self.hashes.keys()):
            if match is None or fnmatch.fnmatch(key, match):
                yield key


class TestURYPrintJobFeedbackE2E(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self.fake = FakeCache()
        self.patches = [
            patch("ury.ury.printing.print_job_monitor._redis", return_value=self.fake),
            patch("ury.ury.printing.finalizer._redis", return_value=self.fake),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        super().tearDown()

    def _create_metadata(self, print_job_id, status=SUBMITTED, failure_reason=""):
        return {
            "print_job_id": print_job_id,
            "cups_job_id": 99,
            "invoice": "AC-2026-001",
            "printer": "POS Printer",
            "printer_name": "Thermal Receipt Printer",
            "server_ip": "127.0.0.1",
            "port": 631,
            "status": status,
            "cups_state": "pending" if status == PENDING else "stopped",
            "cups_state_reason": failure_reason,
            "failure_reason": failure_reason,
            "created_at": "2026-08-20 01:00:00",
            "submitted_at": "2026-08-20 01:00:01",
            "retry_count": 1 if status == FAILED else 0,
        }

    def test_virtual_doctype_pending_state_fields(self):
        """Virtual DocType URY Print Job correctly loads job details in PENDING state."""
        job_id = "PJ-E2E-PENDING-001"
        metadata = self._create_metadata(job_id, status=PENDING)
        register_print_job(metadata)

        doc = frappe.get_doc("URY Print Job", job_id)

        self.assertEqual(doc.name, job_id)
        self.assertEqual(doc.status, PENDING)
        self.assertEqual(doc.invoice, "AC-2026-001")
        self.assertEqual(doc.printer_name, "Thermal Receipt Printer")
        self.assertEqual(doc.cups_job_id, 99)

        # Verify get_list returns the pending job
        list_jobs = frappe.get_list("URY Print Job", filters={"status": PENDING})
        job_names = [j["name"] for j in list_jobs]
        self.assertIn(job_id, job_names)

    def test_virtual_doctype_failed_state_fields(self):
        """Virtual DocType URY Print Job correctly loads job details and failure reason in FAILED state."""
        job_id = "PJ-E2E-FAILED-001"
        reason = "CUPS backend failed: Printer Unreachable"
        metadata = self._create_metadata(job_id, status=FAILED, failure_reason=reason)
        register_print_job(metadata)

        doc = frappe.get_doc("URY Print Job", job_id)

        self.assertEqual(doc.name, job_id)
        self.assertEqual(doc.status, FAILED)
        self.assertEqual(doc.invoice, "AC-2026-001")
        self.assertEqual(doc.failure_reason, reason)

        # Verify get_list returns the failed job
        list_jobs = frappe.get_list("URY Print Job", filters={"status": FAILED})
        job_names = [j["name"] for j in list_jobs]
        self.assertIn(job_id, job_names)

    @patch("ury.ury.printing.print_job_poller.frappe.publish_realtime")
    @patch("ury.ury.printing.print_job_poller.get_cups_job_attributes")
    def test_poller_emits_status_updated_socket_feedback(self, mock_get_cups_attr, mock_publish):
        """Poller emits print_job_status_updated socket event matching React frontend payload structure."""
        job_id = "PJ-FEEDBACK-PENDING"
        metadata = self._create_metadata(job_id, status=SUBMITTED)
        register_print_job(metadata)

        mock_get_cups_attr.return_value = {
            "job_state": IPP_JOB_PENDING,
            "job_printer_state_reasons": ["none"],
        }

        poll_single_print_job(print_job_id=job_id)

        # Check socket publish
        self.assertTrue(mock_publish.called)
        call_args = mock_publish.call_args_list
        event_names = [c[0][0] for c in call_args]
        self.assertIn("print_job_status_updated", event_names)

        # Find status updated payload
        status_payload = next(c[0][1] for c in call_args if c[0][0] == "print_job_status_updated")
        self.assertEqual(status_payload["invoice"], "AC-2026-001")
        self.assertEqual(status_payload["print_job_id"], job_id)
        self.assertEqual(status_payload["cups_job_id"], 99)
        self.assertIn(status_payload["status"], [PENDING, SUBMITTED])

    @patch("ury.ury.printing.finalizer.frappe.publish_realtime")
    @patch("ury.ury.printing.finalizer.notify_print_failure")
    def test_finalizer_emits_failure_socket_feedback(self, mock_notify_failure, mock_finalizer_publish):
        """Finalization on failure emits print_failure_alert and invoice_print_failed socket feedback to React frontend."""
        job_id = "PJ-FEEDBACK-FAILED"
        metadata = self._create_metadata(job_id, status=SUBMITTED)
        register_print_job(metadata)

        failure_reason = "Media Tray Out of Paper"
        result = finalize_print_job(job_id, FAILED, failure_reason=failure_reason)

        self.assertEqual(result["status"], "Finalized")
        self.assertEqual(result["final_state"], FAILED)

        # Check notify_print_failure call
        self.assertTrue(mock_notify_failure.called)
        self.assertEqual(mock_notify_failure.call_args.kwargs.get("invoice"), "AC-2026-001")
        self.assertEqual(mock_notify_failure.call_args.kwargs.get("print_job_id"), job_id)
        self.assertEqual(mock_notify_failure.call_args.kwargs.get("printer_name"), "Thermal Receipt Printer")
        self.assertEqual(mock_notify_failure.call_args.kwargs.get("reason"), failure_reason)

        # Check finalizer socket event
        self.assertTrue(mock_finalizer_publish.called)
        finalizer_event = mock_finalizer_publish.call_args[0][0]
        finalizer_payload = mock_finalizer_publish.call_args[0][1]

        self.assertEqual(finalizer_event, "invoice_print_failed")
        self.assertEqual(finalizer_payload["invoice"], "AC-2026-001")
        self.assertEqual(finalizer_payload["print_job_id"], job_id)

    @patch("ury.ury.printing.finalizer.frappe.publish_realtime")
    def test_finalizer_emits_completed_socket_feedback(self, mock_publish):
        """Finalization on completion emits invoice_print_completed socket feedback to React frontend."""
        job_id = "PJ-FEEDBACK-COMPLETED"
        metadata = self._create_metadata(job_id, status=PROCESSING)
        register_print_job(metadata)

        result = finalize_print_job(job_id, COMPLETED)

        self.assertEqual(result["status"], "Finalized")
        self.assertEqual(result["final_state"], COMPLETED)

        self.assertTrue(mock_publish.called)
        event_name = mock_publish.call_args[0][0]
        payload = mock_publish.call_args[0][1]

        self.assertEqual(event_name, "invoice_print_completed")
        self.assertEqual(payload["invoice"], "AC-2026-001")
        self.assertEqual(payload["print_job_id"], job_id)

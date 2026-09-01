"""Unit tests for print-job finalization side effects.

These tests verify that ``finalize_print_job`` is idempotent, only flips
``POS Invoice.invoice_printed`` for ``COMPLETED`` jobs, and publishes the
expected realtime events.
"""

from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.printing.finalizer import finalize_print_job
from ury.ury.printing.print_job_monitor import get_print_job, register_print_job
from ury.ury.printing.state_machine import CANCELED, COMPLETED, FAILED, UNKNOWN


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


class TestPrintJobFinalizer(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self.fake = FakeCache()
        self.monitor_redis_patch = patch(
            "ury.ury.printing.print_job_monitor._redis",
            return_value=self.fake,
        )
        self.finalizer_redis_patch = patch(
            "ury.ury.printing.finalizer._redis",
            return_value=self.fake,
        )
        self.monitor_redis_patch.start()
        self.finalizer_redis_patch.start()

    def tearDown(self):
        self.finalizer_redis_patch.stop()
        self.monitor_redis_patch.stop()
        super().tearDown()

    def _register_job(self, print_job_id, invoice="INV-001", restaurant_table="T-01"):
        metadata = {
            "print_job_id": print_job_id,
            "cups_job_id": 123,
            "invoice": invoice,
            "printer_setting": "Printer-A",
            "printer_name": "Test Printer",
            "server_ip": "127.0.0.1",
            "port": 631,
            "status": "SUBMITTED",
            "restaurant_table": restaurant_table,
        }
        register_print_job(metadata)
        return metadata

    @patch("ury.ury.printing.finalizer.frappe.publish_realtime")
    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    def test_finalize_completed_sets_invoice_printed_and_releases_table(
        self,
        mock_db_set_value,
        mock_release_tables,
        mock_publish,
    ):
        """COMPLETED finalization flips invoice_printed and releases the cluster."""
        job_id = "PJ-completed"
        self._register_job(job_id, invoice="INV-001", restaurant_table="T-01")

        result = finalize_print_job(job_id, COMPLETED)

        self.assertEqual(result["status"], "Finalized")
        self.assertEqual(result["final_state"], COMPLETED)
        self.assertEqual(result["invoice_printed"], 1)
        self.assertEqual(result["restaurant_table"], "T-01")

        mock_db_set_value.assert_called_once_with(
            "POS Invoice", "INV-001", "invoice_printed", 1
        )
        mock_release_tables.assert_called_once_with("T-01")

        mock_publish.assert_called_once()
        event, payload = mock_publish.call_args.args
        self.assertEqual(event, "invoice_print_completed")
        self.assertEqual(payload["invoice"], "INV-001")
        self.assertEqual(payload["print_job_id"], job_id)

    @patch("ury.ury.printing.finalizer.frappe.publish_realtime")
    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    def test_finalize_completed_without_table_does_not_release(
        self,
        mock_db_set_value,
        mock_release_tables,
        mock_publish,
    ):
        """A COMPLETED counter/parcel invoice finalizes without table release."""
        job_id = "PJ-completed-counter"
        self._register_job(job_id, invoice="INV-002", restaurant_table=None)

        result = finalize_print_job(job_id, COMPLETED)

        self.assertEqual(result["invoice_printed"], 1)
        mock_db_set_value.assert_called_once_with(
            "POS Invoice", "INV-002", "invoice_printed", 1
        )
        mock_release_tables.assert_not_called()

        event, payload = mock_publish.call_args.args
        self.assertEqual(event, "invoice_print_completed")

    @patch("ury.ury.printing.finalizer.frappe.publish_realtime")
    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    def test_finalize_is_idempotent(
        self,
        mock_db_set_value,
        mock_release_tables,
        mock_publish,
    ):
        """Repeated finalization runs side effects exactly once."""
        job_id = "PJ-idempotent"
        self._register_job(job_id, invoice="INV-003", restaurant_table="T-03")

        first = finalize_print_job(job_id, COMPLETED)
        second = finalize_print_job(job_id, COMPLETED)

        self.assertEqual(first["status"], "Finalized")
        self.assertEqual(second["status"], "Already Finalized")
        self.assertEqual(second["print_job_id"], job_id)

        mock_db_set_value.assert_called_once()
        mock_release_tables.assert_called_once()
        # Only the first call publishes the realtime event.
        mock_publish.assert_called_once()

    @patch("ury.ury.printing.finalizer.notify_print_failure")
    @patch("ury.ury.printing.finalizer.frappe.publish_realtime")
    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    def test_finalize_failed_keeps_invoice_unprinted_and_table_occupied(
        self,
        mock_db_set_value,
        mock_release_tables,
        mock_publish,
        mock_notify_print_failure,
    ):
        """FAILED finalization explicitly sets invoice_printed=0 and tables occupied."""
        job_id = "PJ-failed"
        self._register_job(job_id, invoice="INV-004", restaurant_table="T-04")

        result = finalize_print_job(job_id, FAILED, failure_reason="job-stopped")

        self.assertEqual(result["status"], "Finalized")
        self.assertEqual(result["final_state"], FAILED)
        self.assertEqual(result["invoice_printed"], 0)
        self.assertEqual(result["reason"], "job-stopped")

        mock_db_set_value.assert_called_once_with(
            "POS Invoice", "INV-004", "invoice_printed", 0
        )
        mock_release_tables.assert_not_called()

        mock_notify_print_failure.assert_called_once_with(
            invoice="INV-004",
            print_job_id=job_id,
            printer_name="Test Printer",
            reason="job-stopped",
            job_type="BILL",
            job_owner="Administrator",
        )

        mock_publish.assert_called_once()
        event, payload = mock_publish.call_args.args
        self.assertEqual(event, "invoice_print_failed")
        self.assertEqual(payload["invoice"], "INV-004")
        self.assertEqual(payload["print_job_id"], job_id)
        self.assertEqual(payload["reason"], "job-stopped")
        self.assertEqual(payload["job_owner"], "Administrator")
        self.assertEqual(mock_publish.call_args.kwargs.get("user"), "Administrator")

    @patch("ury.ury.printing.finalizer.frappe.publish_realtime")
    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    def test_finalize_canceled_and_unknown_keep_invoice_unprinted(
        self,
        mock_db_set_value,
        mock_release_tables,
        mock_publish,
    ):
        """CANCELED and UNKNOWN terminal outcomes explicitly set invoice_printed=0."""
        for state in (CANCELED, UNKNOWN):
            mock_db_set_value.reset_mock()
            mock_release_tables.reset_mock()
            mock_publish.reset_mock()

            job_id = f"PJ-{state.lower()}"
            self._register_job(job_id, invoice=f"INV-{state}", restaurant_table="T-05")

            result = finalize_print_job(job_id, state, failure_reason="vanished")

            self.assertEqual(result["invoice_printed"], 0)
            mock_db_set_value.assert_called_once_with(
                "POS Invoice", f"INV-{state}", "invoice_printed", 0
            )
            mock_release_tables.assert_not_called()

            event, payload = mock_publish.call_args.args
            self.assertEqual(event, "invoice_print_failed")
            self.assertEqual(payload["reason"], "vanished")

    @patch("ury.ury.printing.finalizer.frappe.publish_realtime")
    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer.frappe.db.set_value")
    def test_finalize_completed_without_metadata_is_safe(
        self,
        mock_db_set_value,
        mock_release_tables,
        mock_publish,
    ):
        """If metadata is missing, COMPLETED finalization does not crash."""
        job_id = "PJ-missing"

        result = finalize_print_job(job_id, COMPLETED)

        # No invoice means no DB write and no table release.
        self.assertEqual(result["status"], "Finalized")
        self.assertEqual(result["invoice"], None)
        mock_db_set_value.assert_not_called()
        mock_release_tables.assert_not_called()
        mock_publish.assert_called_once()

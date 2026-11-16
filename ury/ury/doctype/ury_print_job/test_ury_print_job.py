# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and Contributors
# See license.txt

import os
import shutil
import tempfile
import time
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_print import get_print_job_status
from ury.ury.doctype.ury_print_job.ury_print_job import URYPrintJob
from ury.ury.printing.file_store import get_job
from ury.ury.printing.print_job_monitor import (
    get_due_print_jobs,
    register_print_job,
    stop_monitoring_print_job,
)
from ury.ury.printing.state_machine import COMPLETED, SUBMITTED


class FakeCache:
    """Minimal in-memory stand-in for the Frappe Redis cache client.

    Only the sorted-set / string operations used by the monitor scheduler are
    implemented; authoritative job metadata lives in the JSON file store.
    """

    def __init__(self):
        self.zsets = {}
        self.strings = {}

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
        return True

    def delete_value(self, keys, make_keys=True):
        if not keys:
            return
        if isinstance(keys, str):
            keys = (keys,)
        for key in keys:
            self.strings.pop(key, None)

    def make_key(self, key):
        return key


class TestURYPrintJob(FrappeTestCase):
    def setUp(self):
        super().setUp()
        self.jobs_dir = tempfile.mkdtemp(prefix="ury-print-jobs-")
        self.dir_patch = patch(
            "ury.ury.printing.file_store.get_print_jobs_dir",
            return_value=self.jobs_dir,
        )
        self.dir_patch.start()

        self.fake = FakeCache()
        self.redis_patch = patch(
            "ury.ury.printing.print_job_monitor._redis",
            return_value=self.fake,
        )
        self.redis_patch.start()

    def tearDown(self):
        self.redis_patch.stop()
        self.dir_patch.stop()
        shutil.rmtree(self.jobs_dir, ignore_errors=True)
        super().tearDown()

    def _sample_metadata(self, print_job_id):
        return {
            "print_job_id": print_job_id,
            "cups_job_id": 42,
            "invoice": "INV-TEST-001",
            "printer": "Printer-A",
            "printer_name": "Kitchen Printer",
            "status": SUBMITTED,
            "cups_state": "pending",
            "cups_state_reason": "none",
            "created_at": "2026-08-16 10:00:00",
            "submitted_at": "2026-08-16 10:00:01",
            "retry_count": 0,
            "failure_reason": "",
        }

    def test_load_doc_from_file_matches_metadata(self):
        """frappe.get_doc loads a virtual doc backed by the JSON file store."""
        job_id = "PJ-LOAD-001"
        register_print_job(self._sample_metadata(job_id))

        doc = frappe.get_doc("URY Print Job", job_id)

        self.assertEqual(doc.name, job_id)
        self.assertEqual(doc.doctype, "URY Print Job")
        self.assertEqual(doc.cups_job_id, 42)
        self.assertEqual(doc.invoice, "INV-TEST-001")
        self.assertEqual(doc.printer, "Printer-A")
        self.assertEqual(doc.printer_name, "Kitchen Printer")
        self.assertEqual(doc.status, SUBMITTED)

    def test_load_missing_doc_raises_does_not_exist(self):
        """Loading a non-existent job raises DoesNotExistError."""
        with self.assertRaises(frappe.DoesNotExistError):
            frappe.get_doc("URY Print Job", "PJ-MISSING")

    def test_get_list_returns_active_jobs(self):
        """frappe.get_list returns jobs currently backed by JSON files."""
        for job_id in ("PJ-LIST-001", "PJ-LIST-002"):
            register_print_job(self._sample_metadata(job_id))

        results = frappe.get_list("URY Print Job")
        names = {r["name"] for r in results}

        self.assertIn("PJ-LIST-001", names)
        self.assertIn("PJ-LIST-002", names)

    def test_get_count_matches_active_jobs(self):
        """URYPrintJob.get_count reflects the number of active job files."""
        register_print_job(self._sample_metadata("PJ-COUNT-001"))
        register_print_job(self._sample_metadata("PJ-COUNT-002"))

        count = URYPrintJob.get_count()

        self.assertEqual(count, 2)

    def test_get_stats_returns_status_breakdown(self):
        """URYPrintJob.get_stats aggregates active jobs by status."""
        meta1 = self._sample_metadata("PJ-STATS-001")
        meta2 = self._sample_metadata("PJ-STATS-002")
        register_print_job(meta1)
        register_print_job(meta2)

        stats = URYPrintJob.get_stats()

        self.assertEqual(stats["total_jobs"], 2)
        self.assertEqual(stats["status_breakdown"].get(SUBMITTED), 2)

    def test_delete_removes_job_file(self):
        """Deleting a virtual doc removes its JSON file."""
        job_id = "PJ-DELETE-001"
        register_print_job(self._sample_metadata(job_id))

        doc = frappe.get_doc("URY Print Job", job_id)
        doc.delete()

        self.assertIsNone(get_job(job_id))
        self.assertFalse(
            os.path.exists(os.path.join(self.jobs_dir, f"{job_id}.json"))
        )

    def test_db_insert_and_db_update_persist_to_file_store(self):
        """Virtual DocType db_insert/db_update write to the file store, not MariaDB."""
        doc = URYPrintJob({"doctype": "URY Print Job", "name": "PJ-NOOP-001"})
        doc.status = SUBMITTED
        doc.db_insert()

        stored = get_job("PJ-NOOP-001")
        self.assertIsNotNone(stored)
        self.assertEqual(stored.get("status"), SUBMITTED)

        with patch("frappe.publish_realtime"):
            doc.status = COMPLETED
            doc.db_update()

        stored = get_job("PJ-NOOP-001")
        self.assertEqual(stored.get("status"), COMPLETED)

    def test_get_print_job_status_api_returns_metadata(self):
        """Whitelisted API returns the current print job metadata."""
        job_id = "PJ-API-001"
        register_print_job(self._sample_metadata(job_id))

        result = get_print_job_status(job_id)

        self.assertEqual(result["status"], "Success")
        self.assertEqual(result["print_job"]["name"], job_id)
        self.assertEqual(result["print_job"]["cups_job_id"], 42)
        self.assertEqual(result["print_job"]["invoice"], "INV-TEST-001")

    def test_get_print_job_status_api_missing_job(self):
        """Whitelisted API returns a structured failure for missing jobs."""
        result = get_print_job_status("PJ-MISSING")

        self.assertEqual(result["status"], "Failure")
        self.assertIn("not found", result["message"])

    def test_retained_jobs_are_listed_alongside_monitor_jobs(self):
        """Jobs whose file outlives monitor-zset membership are still listed."""
        job_id = "PJ-MONITOR-001"
        register_print_job(self._sample_metadata(job_id))
        # Simulate terminal state: leave the monitor zset but keep the JSON file.
        stop_monitoring_print_job(job_id)

        results = frappe.get_list("URY Print Job")
        names = {r["name"] for r in results}

        self.assertIn(job_id, names)

    def test_get_count_includes_completed_jobs(self):
        """get_count includes jobs that left the monitor zset but still have a file."""
        active_id = "PJ-COUNT-ACTIVE-001"
        completed_id = "PJ-COUNT-COMPLETED-001"
        register_print_job(self._sample_metadata(active_id))
        register_print_job(self._sample_metadata(completed_id))

        stop_monitoring_print_job(completed_id)

        count = URYPrintJob.get_count()

        self.assertEqual(count, 2)

    def test_get_list_includes_completed_jobs(self):
        """get_list returns valid completed jobs even after removal from MONITOR_ZSET."""
        active_id = "PJ-LIST-ACTIVE-001"
        completed_id = "PJ-LIST-COMPLETED-001"
        register_print_job(self._sample_metadata(active_id))
        register_print_job(self._sample_metadata(completed_id))

        stop_monitoring_print_job(completed_id)

        results = frappe.get_list("URY Print Job")
        names = {r["name"] for r in results}

        self.assertIn(active_id, names)
        self.assertIn(completed_id, names)

    def test_pagination_ignores_dead_zset_entries(self):
        """Jobs present in the zset but without a backing file are never listed."""
        for job_id in ("PJ-PAGE-001", "PJ-PAGE-002", "PJ-PAGE-003"):
            register_print_job(self._sample_metadata(job_id))
        # Orphaned zset member with no backing JSON file.
        self.fake.zsets["print_jobs:monitor"]["PJ-DEAD-001"] = 0

        results = URYPrintJob.get_list({"start": 0, "page_length": 2})
        names = [r["name"] for r in results]

        self.assertEqual(len(results), 2)
        self.assertNotIn("PJ-DEAD-001", names)
        for name in names:
            self.assertTrue(name.startswith("PJ-PAGE-"))

    def test_get_list_with_json_string_fields_parameter(self):
        """get_list parses fields properly when passed as a JSON-encoded string from HTTP form_dict."""
        job_id = "PJ-JSON-FIELDS-001"
        register_print_job(self._sample_metadata(job_id))

        # Simulate HTTP form_dict fields parameter (JSON string)
        json_fields = '["`tabURY Print Job`.`name`", "`tabURY Print Job`.`status`", "`tabURY Print Job`.`cups_job_id`", "`tabURY Print Job`.`invoice`"]'
        results = URYPrintJob.get_list({"fields": json_fields})

        self.assertGreaterEqual(len(results), 1)
        job = next(r for r in results if r["name"] == job_id)
        self.assertEqual(job["status"], "SUBMITTED")
        self.assertEqual(job["cups_job_id"], 42)
        self.assertEqual(job["invoice"], "INV-TEST-001")

    def test_get_due_print_jobs_reads_monitor_zset(self):
        """Due-job scheduling still uses the Redis monitor zset."""
        register_print_job(self._sample_metadata("PJ-DUE-001"))

        self.assertIn("PJ-DUE-001", get_due_print_jobs(now_ts=time.time() + 10))

        stop_monitoring_print_job("PJ-DUE-001")

        self.assertNotIn("PJ-DUE-001", get_due_print_jobs(now_ts=time.time() + 10))

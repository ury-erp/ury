# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import os
import time
import unittest
import frappe
from ury.ury.printing.file_store import (
    get_print_jobs_dir,
    save_job,
    get_job,
    delete_job,
    list_all_jobs,
    prune_expired_jobs,
)


class TestFileStore(unittest.TestCase):
    def setUp(self):
        frappe.flags.in_test = True
        self.test_job_id = f"test-job-{int(time.time() * 1000)}"
        self.data = {
            "print_job_id": self.test_job_id,
            "status": "SUBMITTED",
            "printer": "Kitchen_Printer",
            "job_type": "KOT",
        }

    def tearDown(self):
        delete_job(self.test_job_id)

    def test_save_and_get_job(self):
        save_job(self.test_job_id, self.data)
        loaded = get_job(self.test_job_id)
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.get("print_job_id"), self.test_job_id)
        self.assertEqual(loaded.get("job_type"), "KOT")

    def test_delete_job(self):
        save_job(self.test_job_id, self.data)
        self.assertTrue(delete_job(self.test_job_id))
        self.assertIsNone(get_job(self.test_job_id))

    def test_list_all_jobs(self):
        save_job(self.test_job_id, self.data)
        jobs = list_all_jobs(max_age_seconds=7200)
        found = any(j.get("print_job_id") == self.test_job_id for j in jobs)
        self.assertTrue(found)

    def test_prune_expired_jobs(self):
        save_job(self.test_job_id, self.data)
        # Prune with 0 max_age should delete immediately
        deleted_count = prune_expired_jobs(max_age_seconds=0)
        self.assertGreaterEqual(deleted_count, 1)
        self.assertIsNone(get_job(self.test_job_id))

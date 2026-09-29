# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import unittest
from unittest.mock import MagicMock, patch
import frappe
from ury.ury.printing.finalizer import finalize_print_job
from ury.ury.printing.file_store import save_job, delete_job


class TestPrintFinalizer(unittest.TestCase):
    def setUp(self):
        frappe.flags.in_test = True

    @patch("frappe.db.set_value")
    @patch("frappe.publish_realtime")
    @patch("ury.ury.printing.finalizer._set_finalized_idempotency_key", return_value=True)
    def test_kot_finalizer_does_not_alter_invoice_or_tables(
        self, mock_idemp, mock_realtime, mock_set_value
    ):
        job_id = "test-kot-finalizer-job"
        job_data = {
            "print_job_id": job_id,
            "job_type": "KOT",
            "invoice": "ACC-SINV-2026-0001",
            "restaurant_table": "Table 1",
            "docname": "KOT-0001",
            "status": "SUBMITTED",
        }
        save_job(job_id, job_data)

        try:
            res = finalize_print_job(job_id, "COMPLETED")
            self.assertEqual(res["status"], "Finalized")
            self.assertEqual(res["job_type"], "KOT")

            # Must NEVER call set_value on POS Invoice for KOT jobs
            mock_set_value.assert_not_called()
        finally:
            delete_job(job_id)

    @patch("frappe.db.set_value")
    @patch("frappe.publish_realtime")
    @patch("ury.ury.printing.finalizer.release_merge_cluster_tables")
    @patch("ury.ury.printing.finalizer._set_finalized_idempotency_key", return_value=True)
    def test_bill_finalizer_sets_invoice_printed_and_releases_table(
        self, mock_idemp, mock_release_tables, mock_realtime, mock_set_value
    ):
        job_id = "test-bill-finalizer-job"
        job_data = {
            "print_job_id": job_id,
            "job_type": "BILL",
            "invoice": "ACC-SINV-2026-0002",
            "restaurant_table": "Table 1",
            "status": "SUBMITTED",
        }
        save_job(job_id, job_data)

        try:
            res = finalize_print_job(job_id, "COMPLETED")
            self.assertEqual(res["status"], "Finalized")
            self.assertEqual(res["invoice_printed"], 1)

            mock_set_value.assert_called_with("POS Invoice", "ACC-SINV-2026-0002", "invoice_printed", 1)
            mock_release_tables.assert_called_with("Table 1")
        finally:
            delete_job(job_id)

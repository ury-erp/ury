"""Unit tests verifying the frontend-facing print feedback and failed jobs API contract."""

import unittest
from unittest.mock import MagicMock, patch

from ury.ury.api.ury_print import get_failed_print_jobs, get_print_job_status
from ury.ury.printing.state_machine import (
    CANCELED,
    COMPLETED,
    FAILED,
    PENDING,
    PROCESSING,
    SUBMITTED,
    UNKNOWN,
)


class TestPrintAPIContract(unittest.TestCase):
    """Test suite covering the frontend API contract for print status and failures."""

    @classmethod
    def setUpClass(cls):
        import frappe
        if not hasattr(frappe.local, "flags"):
            frappe.local.flags = frappe._dict(in_test=True)
        else:
            frappe.local.flags.in_test = True

    def test_get_print_job_status_validation(self):
        """get_print_job_status requires print_job_id."""
        res = get_print_job_status("")
        self.assertEqual(res["status"], "Failure")
        self.assertIn("required", res["message"])

        res_none = get_print_job_status(None)
        self.assertEqual(res_none["status"], "Failure")

    @patch("frappe.get_doc")
    def test_get_print_job_status_success(self, mock_get_doc):
        """get_print_job_status returns formatted print job metadata."""
        mock_doc = MagicMock()
        mock_doc.as_dict.return_value = {
            "name": "PJ-20260824-001",
            "print_job_id": "PJ-20260824-001",
            "cups_job_id": 42,
            "invoice": "ACC-SINV-001",
            "printer": "Tr KOT",
            "printer_name": "KOT",
            "server_ip": "192.168.1.74",
            "port": 631,
            "status": "PROCESSING",
            "cups_state_reason": "processing-to-stop-point",
            "retry_count": 1,
            "observation_timed_out": False,
            "created_at": "2026-08-24 16:30:00",
            "last_checked_at": "2026-08-24 16:30:05",
        }
        mock_get_doc.return_value = mock_doc

        res = get_print_job_status("PJ-20260824-001")
        self.assertEqual(res["status"], "Success")
        self.assertIn("print_job", res)
        job = res["print_job"]
        self.assertEqual(job["print_job_id"], "PJ-20260824-001")
        self.assertEqual(job["cups_job_id"], 42)
        self.assertEqual(job["status"], "PROCESSING")
        self.assertFalse(job["observation_timed_out"])

    @patch("frappe.get_doc")
    def test_get_print_job_status_not_found(self, mock_get_doc):
        """get_print_job_status returns structured Failure for non-existent job."""
        import frappe

        mock_get_doc.side_effect = frappe.DoesNotExistError
        res = get_print_job_status("PJ-NONEXISTENT")
        self.assertEqual(res["status"], "Failure")
        self.assertIn("not found", res["message"])

    @patch("ury.ury.api.ury_print.get_print_job")
    @patch("ury.ury.api.ury_print.get_all_tracked_print_job_ids")
    def test_get_failed_print_jobs_filtering_and_pagination(
        self, mock_get_ids, mock_get_job
    ):
        """get_failed_print_jobs filters out non-failed jobs and applies pagination and filters."""
        mock_get_ids.return_value = ["PJ-1", "PJ-2", "PJ-3", "PJ-4", "PJ-5"]

        sample_jobs = {
            "PJ-1": {
                "print_job_id": "PJ-1",
                "cups_job_id": 101,
                "invoice": "INV-001",
                "printer_setting": "Tr KOT",
                "printer_name": "KOT",
                "status": "COMPLETED",
            },
            "PJ-2": {
                "print_job_id": "PJ-2",
                "cups_job_id": 102,
                "invoice": "INV-002",
                "printer_setting": "Tr KOT",
                "printer_name": "KOT",
                "status": "FAILED",
                "cups_state_reason": "media-empty-error",
                "created_at": "2026-08-24 16:00:00",
                "last_checked_at": "2026-08-24 16:00:10",
            },
            "PJ-3": {
                "print_job_id": "PJ-3",
                "cups_job_id": 103,
                "invoice": "INV-003",
                "printer_setting": "Tr Cashier",
                "printer_name": "Cashier",
                "status": "FAILED",
                "cups_state_reason": "server-unreachable",
                "created_at": "2026-08-24 16:05:00",
                "last_checked_at": "2026-08-24 16:05:10",
            },
            "PJ-4": {
                "print_job_id": "PJ-4",
                "cups_job_id": 104,
                "invoice": "INV-004",
                "printer_setting": "Tr KOT",
                "printer_name": "KOT",
                "status": "CANCELED",
                "created_at": "2026-08-24 16:10:00",
                "last_checked_at": "2026-08-24 16:10:10",
            },
            "PJ-5": {
                "print_job_id": "PJ-5",
                "cups_job_id": 105,
                "invoice": "INV-005",
                "printer_setting": "Tr Cashier",
                "printer_name": "Cashier",
                "status": "PROCESSING",
            },
        }

        mock_get_job.side_effect = lambda jid: sample_jobs.get(jid)

        # 1. Fetch all failed jobs (PJ-4 CANCELED, PJ-3 FAILED, PJ-2 FAILED)
        res = get_failed_print_jobs(limit=10, start=0)
        self.assertEqual(res["status"], "Success")
        self.assertEqual(res["total_count"], 3)
        self.assertEqual(len(res["data"]), 3)
        self.assertFalse(res["has_more"])

        # 2. Filter by printer="KOT" (PJ-4 CANCELED and PJ-2 FAILED)
        res_kot = get_failed_print_jobs(printer="KOT")
        self.assertEqual(res_kot["total_count"], 2)
        pjs = [j["print_job_id"] for j in res_kot["data"]]
        self.assertIn("PJ-2", pjs)
        self.assertIn("PJ-4", pjs)

        # 3. Filter by invoice="INV-003" (PJ-3 only)
        res_inv = get_failed_print_jobs(invoice="INV-003")
        self.assertEqual(res_inv["total_count"], 1)
        self.assertEqual(res_inv["data"][0]["print_job_id"], "PJ-3")
        self.assertEqual(res_inv["data"][0]["failure_reason"], "server-unreachable")

        # 4. Pagination
        res_page = get_failed_print_jobs(limit=1, start=0)
        self.assertEqual(len(res_page["data"]), 1)
        self.assertTrue(res_page["has_more"])
        self.assertEqual(res_page["total_count"], 3)


if __name__ == "__main__":
    unittest.main()

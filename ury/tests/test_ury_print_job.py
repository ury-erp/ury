# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import unittest
import frappe
from ury.ury.printing.file_store import save_job, delete_job


class TestURYPrintJobDocType(unittest.TestCase):
    def setUp(self):
        frappe.flags.in_test = True
        self.job_id = "test-doc-controller-job"
        self.job_data = {
            "print_job_id": self.job_id,
            "status": "SUBMITTED",
            "printer": "Kitchen_Printer",
            "job_type": "KOT",
            "reference_doctype": "URY KOT",
            "reference_name": "KOT-0001",
        }
        save_job(self.job_id, self.job_data)

    def tearDown(self):
        delete_job(self.job_id)

    def test_get_doc_loads_from_file_store(self):
        doc = frappe.get_doc("URY Print Job", self.job_id)
        self.assertEqual(doc.name, self.job_id)
        self.assertEqual(doc.status, "SUBMITTED")
        self.assertEqual(doc.printer, "Kitchen_Printer")
        self.assertEqual(doc.job_type, "KOT")

    def test_get_list_filters_correctly(self):
        job_list = frappe.get_list(
            "URY Print Job",
            filters={"job_type": "KOT"},
            fields=["name", "status", "job_type"],
        )
        found = any(j.get("name") == self.job_id for j in job_list)
        self.assertTrue(found)

    def test_get_list_with_printer_filter(self):
        job_list = frappe.get_list(
            "URY Print Job",
            filters={"printer": "Kitchen_Printer"},
            fields=["name", "printer"],
        )
        found = any(j.get("name") == self.job_id for j in job_list)
        self.assertTrue(found)

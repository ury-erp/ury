# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import os
import unittest
from unittest.mock import MagicMock, patch
import frappe
from ury.ury.printing.custom_network_printer_settings import CustomNetworkPrinterSettings
from ury.ury.printing.api import retry_print_job
from ury.ury.printing.file_store import save_job, get_job


class TestPrinterFeedbackEnhancement(unittest.TestCase):
    def setUp(self):
        frappe.flags.in_test = True

    def test_custom_network_printer_settings_inheritance(self):
        doc = frappe.new_doc("Network Printer Settings")
        doc.printer_name = "Test_Printer"
        doc.server_ip = "127.0.0.1"
        doc.port = 631
        self.assertIsInstance(doc, CustomNetworkPrinterSettings)
        self.assertTrue(hasattr(doc, "print_doc"))
        self.assertTrue(hasattr(doc, "print_file"))
        self.assertTrue(hasattr(doc, "test_printer_connection"))

    @patch("frappe.db.exists", return_value=True)
    @patch("ury.ury.printing.service.frappe.get_print", return_value=b"%PDF-1.4 test")
    @patch("ury.ury.printing.service.register_print_job")
    @patch("ury.ury.printing.service.frappe.enqueue")
    def test_printer_settings_print_doc_dispatch(self, mock_enqueue, mock_register, mock_get_print, mock_exists):
        printer_doc = CustomNetworkPrinterSettings({
            "doctype": "Network Printer Settings",
            "name": "Kitchen_Printer",
            "printer_name": "Kitchen_Printer",
            "server_ip": "127.0.0.1",
            "port": 631,
        })

        mock_invoice = frappe._dict({
            "name": "ACC-SINV-2026-0001",
            "doctype": "POS Invoice",
        })

        def get_doc_side_effect(*args, **kwargs):
            first_arg = args[0] if args else kwargs.get("doctype")
            if first_arg == "Network Printer Settings":
                return printer_doc
            return mock_invoice

        with patch("frappe.get_doc", side_effect=get_doc_side_effect):
            with patch("cups.Connection") as mock_cups_conn:
                mock_conn = MagicMock()
                mock_conn.printFile.return_value = 999
                mock_cups_conn.return_value = mock_conn

                with patch("frappe.www.printview.validate_print_permission"):
                    res = printer_doc.print_doc(
                        doctype="POS Invoice",
                        name="ACC-SINV-2026-0001",
                        job_type="BILL",
                    )

                    self.assertIsInstance(res, dict)
                    self.assertEqual(res.get("status"), "Success", f"Failed with message: {res.get('message')}")
                    self.assertEqual(res["print_job_id"], "Kitchen_Printer-999")
                    self.assertTrue(os.path.exists(res["file_path"]))

                    # Verify file_path was registered in metadata
                    registered_metadata = mock_register.call_args[0][0]
                    self.assertEqual(registered_metadata.get("file_path"), res["file_path"])

    @patch("frappe.get_doc")
    def test_retry_print_job_api(self, mock_get_doc):
        mock_printer = MagicMock()
        mock_printer.print_file.return_value = {"status": "Success", "print_job_id": "Kitchen_Printer-1001"}
        mock_get_doc.return_value = mock_printer

        # Create temporary dummy file
        tmp_file = "/tmp/test-retry-print.pdf"
        with open(tmp_file, "wb") as f:
            f.write(b"%PDF-1.4 dummy")

        job_data = {
            "print_job_id": "Kitchen_Printer-999",
            "printer": "Kitchen_Printer",
            "file_path": tmp_file,
            "status": "FAILED",
            "reference_name": "ACC-SINV-2026-0001",
            "job_type": "BILL",
        }
        save_job("Kitchen_Printer-999", job_data)

        with patch("frappe.db.exists", return_value=True):
            res = retry_print_job("Kitchen_Printer-999")
            self.assertEqual(res["status"], "Success")
            self.assertEqual(res["print_job_id"], "Kitchen_Printer-1001")

            updated_job = get_job("Kitchen_Printer-999")
            self.assertEqual(updated_job.get("retry_count"), 1)
            self.assertEqual(updated_job.get("last_retry_job_id"), "Kitchen_Printer-1001")

        if os.path.exists(tmp_file):
            os.remove(tmp_file)

from datetime import datetime
from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase
from pypdf import PdfWriter

from ury.ury.api.ury_print import network_printing, select_network_printer


class TestURYPrint(FrappeTestCase):
    @patch("ury.ury.api.ury_print.frappe.db.set_value")
    @patch("ury.ury.api.ury_print.frappe.db.get_value")
    @patch("ury.ury.api.ury_print.frappe.get_doc")
    def test_network_printing_delegates_to_printer_doc_without_flipping_invoice_printed(
        self,
        mock_get_doc,
        mock_db_get_value,
        mock_set_value,
    ):
        """network_printing delegates to printer_doc.print_doc and does not finalize lifecycle side effects."""
        printer_doc = MagicMock()
        printer_doc.name = "Test Printer Setting"
        printer_doc.print_doc.return_value = {
            "status": "Success",
            "cups_job_id": 123,
            "print_job_id": "PJ-TestPrinterSetting-123",
            "printer": "Test Printer Setting",
            "invoice": "INV-001",
        }

        pos_invoice = MagicMock()

        def get_doc_side_effect(doctype, name=None, *args, **kwargs):
            if doctype == "Network Printer Settings":
                return printer_doc
            if doctype == "POS Invoice":
                return pos_invoice
            return MagicMock()

        mock_get_doc.side_effect = get_doc_side_effect

        mock_db_get_value.return_value = "T-01"

        result = network_printing(
            "POS Invoice",
            "INV-001",
            "Test Printer Setting",
            print_format="Test Format",
        )

        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("status"), "Success")
        self.assertEqual(result.get("cups_job_id"), 123)
        self.assertEqual(result.get("printer"), "Test Printer Setting")
        self.assertEqual(result.get("invoice"), "INV-001")

        printer_doc.print_doc.assert_called_once_with(
            doctype="POS Invoice",
            name="INV-001",
            print_format="Test Format",
            doc=None,
            no_letterhead=0,
            job_type="BILL",
            extra_metadata={
                "invoice": "INV-001",
                "restaurant_table": "T-01",
            },
        )

        # invoice_printed and table release must only happen later when the
        # poller reaches a terminal state.
        mock_set_value.assert_not_called()

        mock_db_get_value.assert_called_once_with(
            "POS Invoice", "INV-001", "restaurant_table"
        )

    @patch("ury.ury.api.ury_print.network_printing")
    @patch("ury.ury.api.ury_print.frappe.has_permission")
    @patch("ury.ury.api.ury_print.frappe.get_doc")
    @patch("ury.ury.api.ury_print.frappe.db.get_value")
    def test_select_network_printer_aggregates_print_jobs(
        self,
        mock_db_get_value,
        mock_get_doc,
        mock_has_permission,
        mock_network_printing,
    ):
        """select_network_printer should return a list of per-printer results."""
        invoice_doc = MagicMock()
        mock_get_doc.return_value = invoice_doc
        mock_has_permission.return_value = True

        def db_get_value_side_effect(doctype, name, fieldname=None, *args, **kwargs):
            if doctype == "POS Invoice" and fieldname == "restaurant_table":
                return None
            if doctype == "POS Profile" and fieldname == "print_format":
                return "Standard POS Invoice"
            return None

        mock_db_get_value.side_effect = db_get_value_side_effect

        with patch(
            "ury.ury.api.ury_print.frappe.get_all"
        ) as mock_get_all:
            mock_get_all.return_value = ["Printer-A", "Printer-B"]
            mock_network_printing.side_effect = [
                {
                    "status": "Success",
                    "cups_job_id": 1,
                    "print_job_id": "PJ-1",
                    "printer": "Printer-A",
                    "invoice": "INV-002",
                },
                {
                    "status": "Failure",
                    "message": "Offline",
                },
            ]

            result = select_network_printer("POS-1", "INV-002")

        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("status"), "Success")
        self.assertEqual(result.get("invoice"), "INV-002")
        self.assertEqual(len(result.get("print_jobs", [])), 2)
        self.assertEqual(result["print_jobs"][0].get("printer"), "Printer-A")
        self.assertEqual(result["print_jobs"][1].get("status"), "Failure")

    @patch("ury.ury.api.ury_print.network_printing")
    @patch("ury.ury.api.ury_print.frappe.has_permission")
    @patch("ury.ury.api.ury_print.frappe.get_doc")
    @patch("ury.ury.api.ury_print.frappe.db.get_value")
    def test_select_network_printer_returns_failure_when_all_fail(
        self,
        mock_db_get_value,
        mock_get_doc,
        mock_has_permission,
        mock_network_printing,
    ):
        """select_network_printer should report Failure when no printer succeeds."""
        invoice_doc = MagicMock()
        mock_get_doc.return_value = invoice_doc
        mock_has_permission.return_value = True

        def db_get_value_side_effect(doctype, name, fieldname=None, *args, **kwargs):
            if doctype == "POS Invoice" and fieldname == "restaurant_table":
                return "T-01"
            if doctype == "URY Table" and fieldname == "restaurant_room":
                return "Room-1"
            if doctype == "POS Profile" and fieldname == "print_format":
                return "Standard POS Invoice"
            return None

        mock_db_get_value.side_effect = db_get_value_side_effect

        with patch(
            "ury.ury.api.ury_print.frappe.get_all"
        ) as mock_get_all:
            mock_get_all.return_value = ["Printer-C"]
            mock_network_printing.return_value = {
                "status": "Failure",
                "message": "Offline",
            }

            result = select_network_printer("POS-1", "INV-003")

        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("status"), "Failure")
        self.assertEqual(len(result.get("print_jobs", [])), 1)

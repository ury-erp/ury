from datetime import datetime
from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase
from pypdf import PdfWriter

from ury.ury.api.ury_print import network_printing, select_network_printer


class TestURYPrint(FrappeTestCase):
    @patch("ury.ury.api.ury_print.frappe.enqueue")
    @patch("ury.ury.api.ury_print.register_print_job")
    @patch("ury.ury.api.ury_print.now_datetime")
    @patch("ury.ury.api.ury_print.frappe.db.get_value")
    @patch("ury.ury.api.ury_print.frappe.get_print")
    @patch("ury.ury.api.ury_print.validate_print_permission")
    @patch("ury.ury.api.ury_print.frappe.get_doc")
    @patch("ury.ury.api.ury_print.cups")
    def test_network_printing_captures_cups_job_id_without_flipping_invoice_printed(
        self,
        mock_cups,
        mock_get_doc,
        mock_validate_print_permission,
        mock_get_print,
        mock_db_get_value,
        mock_now_datetime,
        mock_register_print_job,
        mock_enqueue,
    ):
        """network_printing registers the CUPS job but does not finalize lifecycle side effects."""
        network_printer = MagicMock()
        network_printer.printer_name = "Test Printer"
        network_printer.server_ip = "127.0.0.1"
        network_printer.port = 631

        pos_invoice = MagicMock()

        def get_doc_side_effect(doctype, name=None, *args, **kwargs):
            if doctype == "Network Printer Settings":
                return network_printer
            if doctype == "POS Invoice":
                return pos_invoice
            return MagicMock()

        mock_get_doc.side_effect = get_doc_side_effect

        mock_conn = MagicMock()
        mock_conn.printFile.return_value = 123
        mock_cups.Connection.return_value = mock_conn

        mock_get_print.return_value = PdfWriter()
        mock_now_datetime.return_value = datetime(2026, 8, 16, 12, 0, 0)

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
        self.assertTrue(
            isinstance(result.get("print_job_id"), str)
            and result.get("print_job_id", "").startswith("PJ-")
        )

        self.assertEqual(mock_conn.printFile.call_count, 1)
        args = mock_conn.printFile.call_args[0]
        self.assertEqual(args[0], "Test Printer")
        self.assertEqual(args[2], "INV-001")
        self.assertEqual(args[3], {})

        # The job is registered in Redis as SUBMITTED; invoice_printed and table
        # release must only happen later when the poller reaches a terminal state.
        mock_register_print_job.assert_called_once()
        registered_metadata = mock_register_print_job.call_args.args[0]
        self.assertEqual(registered_metadata["status"], "SUBMITTED")
        self.assertEqual(registered_metadata["invoice"], "INV-001")
        self.assertEqual(registered_metadata["restaurant_table"], "T-01")

        # An immediate poll is enqueued after registration.
        mock_enqueue.assert_called_once()
        enqueue_args = mock_enqueue.call_args.args
        enqueue_kwargs = mock_enqueue.call_args.kwargs
        self.assertEqual(
            enqueue_args[0],
            "ury.ury.printing.print_job_poller.poll_single_print_job",
        )
        self.assertEqual(enqueue_kwargs["queue"], "default")
        self.assertEqual(enqueue_kwargs["timeout"], 60)

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

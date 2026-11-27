from unittest.mock import MagicMock, mock_open, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.printing.api import retry_print_job
from ury.ury.printing.service import submit_and_monitor_print_job


class TestSubmitAndMonitorPrintJob(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.printer = frappe._dict(
			name="Takeaway",
			server_ip="localhost",
			port=631,
			printer_name="Tr-Cashier",
		)
		self.kot = frappe._dict(
			name="KOT-TEST-0001",
			doctype="URY KOT",
			owner="Administrator",
			production="Bar",
			pos_profile="URY",
			restaurant_table=None,
		)
		self.metadata = {
			"invoice": "POS-INV-TEST-0001",
			"production": "Bar",
			"pos_profile": "URY",
			"job_owner": "Administrator",
		}

	def call_service(self, cups, get_doc, get_print, register, enqueue, finalize=None, stop=None):
		get_doc.side_effect = [self.printer, self.kot]
		cups.Connection.return_value.printFile.return_value = 273
		with (
			patch.dict("sys.modules", {"cups": cups}),
			patch("ury.ury.printing.service.frappe.get_doc", get_doc),
			patch("ury.ury.printing.service.validate_print_permission"),
			patch("ury.ury.printing.service.frappe.get_print", get_print),
			patch("ury.ury.printing.service.register_print_job", register),
			patch("ury.ury.printing.service.frappe.enqueue", enqueue),
			patch("ury.ury.printing.service.finalize_print_job", finalize or MagicMock()),
			patch("ury.ury.printing.service.stop_monitoring_print_job", stop or MagicMock()),
			patch("ury.ury.printing.service.is_print_status_tracking_disabled", return_value=False),
			patch("ury.ury.printing.service.frappe.logger", return_value=MagicMock()),
			patch("builtins.open", mock_open()),
		):
			return submit_and_monitor_print_job(
				doctype="URY KOT",
				name=self.kot.name,
				printer_setting="Takeaway",
				print_format="URY Waiter Order Slip",
				job_type="KOT",
				extra_metadata=self.metadata,
			)

	@patch("ury.ury.printing.service.frappe.enqueue")
	@patch("ury.ury.printing.service.register_print_job")
	@patch("ury.ury.printing.service.frappe.get_print", return_value=b"%PDF")
	@patch("ury.ury.printing.service.frappe.get_doc")
	def test_success_creates_submitted_job_with_format(
		self, get_doc, get_print, register, enqueue
	):
		result = self.call_service(MagicMock(), get_doc, get_print, register, enqueue)

		self.assertEqual(result["status"], "Success")
		self.assertEqual(result["cups_job_id"], 273)
		self.assertEqual(result["print_job_id"], "Tr-Cashier-273")
		metadata = register.call_args.args[0]
		self.assertEqual(metadata["status"], "SUBMITTED")
		self.assertEqual(metadata["print_format"], "URY Waiter Order Slip")
		self.assertEqual(metadata["production"], "Bar")
		self.assertEqual(metadata["pos_profile"], "URY")
		enqueue.assert_called_once()

	@patch("ury.ury.printing.service.stop_monitoring_print_job")
	@patch("ury.ury.printing.service.finalize_print_job")
	@patch("ury.ury.printing.service.frappe.enqueue")
	@patch("ury.ury.printing.service.register_print_job")
	@patch("ury.ury.printing.service.frappe.get_print")
	@patch("ury.ury.printing.service.frappe.get_doc")
	def test_pdf_failure_creates_failed_job_without_poller(
		self, get_doc, get_print, register, enqueue, finalize, stop
	):
		get_print.side_effect = frappe.ValidationError("ContentNotFoundError")
		cups = MagicMock()

		result = self.call_service(cups, get_doc, get_print, register, enqueue, finalize, stop)

		self.assertEqual(result["status"], "Failure")
		self.assertEqual(result["failure_stage"], "PDF_RENDER")
		metadata = register.call_args.args[0]
		self.assertEqual(metadata["status"], "FAILED")
		self.assertIsNone(metadata["cups_job_id"])
		self.assertIn("ContentNotFoundError", metadata["failure_reason"])
		finalize.assert_called_once()
		stop.assert_called_once_with(result["print_job_id"])
		enqueue.assert_not_called()

	@patch("ury.ury.printing.service.stop_monitoring_print_job")
	@patch("ury.ury.printing.service.finalize_print_job")
	@patch("ury.ury.printing.service.frappe.enqueue")
	@patch("ury.ury.printing.service.register_print_job")
	@patch("ury.ury.printing.service.frappe.get_print", return_value=b"%PDF")
	@patch("ury.ury.printing.service.frappe.get_doc")
	def test_cups_connection_failure_creates_failed_job(
		self, get_doc, get_print, register, enqueue, finalize, stop
	):
		cups = MagicMock()
		cups.Connection.side_effect = Exception("CUPS offline")

		result = self.call_service(cups, get_doc, get_print, register, enqueue, finalize, stop)

		self.assertEqual(result["status"], "Failure")
		self.assertEqual(result["failure_stage"], "CUPS_CONNECT")
		self.assertIsNone(register.call_args.args[0]["cups_job_id"])
		get_print.assert_not_called()
		enqueue.assert_not_called()

	@patch("ury.ury.printing.service.stop_monitoring_print_job")
	@patch("ury.ury.printing.service.finalize_print_job")
	@patch("ury.ury.printing.service.frappe.enqueue")
	@patch("ury.ury.printing.service.register_print_job")
	@patch("ury.ury.printing.service.frappe.get_print", return_value=b"%PDF")
	@patch("ury.ury.printing.service.frappe.get_doc")
	def test_print_file_failure_creates_failed_job(
		self, get_doc, get_print, register, enqueue, finalize, stop
	):
		cups = MagicMock()
		cups.Connection.return_value.printFile.side_effect = Exception("Queue rejected")

		result = self.call_service(cups, get_doc, get_print, register, enqueue, finalize, stop)

		self.assertEqual(result["status"], "Failure")
		self.assertEqual(result["failure_stage"], "CUPS_SUBMIT")
		self.assertIn("Queue rejected", register.call_args.args[0]["failure_reason"])
		enqueue.assert_not_called()


class TestRetryPrintJob(FrappeTestCase):
	@patch("ury.ury.printing.api.os.path.exists", return_value=True)
	@patch("ury.ury.printing.api.save_job")
	@patch("ury.ury.printing.api.frappe.get_print", return_value=b"%PDF")
	@patch("ury.ury.printing.api.frappe.db.exists", return_value=True)
	@patch("ury.ury.printing.api.frappe.get_doc")
	@patch("ury.ury.printing.api.get_job")
	def test_retry_preserves_source_metadata(
		self, get_job, get_doc, _db_exists, _get_print, _save_job, _exists
	):
		get_job.return_value = {
			"print_job_id": "Tr-Cashier-273",
			"reference_doctype": "URY KOT",
			"reference_name": "KOT-TEST-0001",
			"invoice": "POS-INV-TEST-0001",
			"production": "Bar",
			"pos_profile": "URY",
			"job_owner": "Administrator",
			"restaurant_table": "T1",
			"print_format": "URY Waiter Order Slip",
			"job_type": "KOT",
			"printer": "Takeaway",
		}
		printer_doc = MagicMock()
		printer_doc.print_file.return_value = {
			"status": "Success",
			"print_job_id": "Tr-Cashier-274",
		}
		get_doc.return_value = printer_doc

		with patch("builtins.open", mock_open()):
			result = retry_print_job("Tr-Cashier-273")

		self.assertEqual(result["status"], "Success")
		metadata = printer_doc.print_file.call_args.kwargs["extra_metadata"]
		self.assertEqual(metadata["reference_doctype"], "URY KOT")
		self.assertEqual(metadata["reference_name"], "KOT-TEST-0001")
		self.assertEqual(metadata["production"], "Bar")
		self.assertEqual(metadata["pos_profile"], "URY")
		self.assertEqual(metadata["job_owner"], "Administrator")
		self.assertEqual(metadata["restaurant_table"], "T1")
		self.assertEqual(metadata["print_format"], "URY Waiter Order Slip")
		self.assertEqual(metadata["retry_of"], "Tr-Cashier-273")

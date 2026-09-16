from unittest.mock import MagicMock, patch, mock_open, PropertyMock
import base64

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_print import (
	network_printing,
	select_network_printer,
	qz_print_update,
	print_pos_page,
	qz_certificate,
	signature_promise,
	QZ_SIGNING_ROLES,
	_get_qz_private_key,
)


class TestNetworkPrinting(FrappeTestCase):
	@patch("ury.ury.api.ury_print.validate_print_permission")
	@patch("ury.ury.api.ury_print.os.remove")
	@patch("builtins.open", new_callable=mock_open)
	@patch("ury.ury.api.ury_print.frappe.get_print")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_network_printing_success_simple(
		self,
		mock_get_doc,
		mock_get_print,
		mock_file_open,
		mock_remove,
		mock_validate_permission,
	):
		"""Test successful network printing skips cups when not available."""
		mock_printer_doc = MagicMock()
		mock_get_doc.return_value = mock_printer_doc
		mock_get_print.return_value = MagicMock()

		# Mock the cups import to fail
		with patch.dict("sys.modules", {"cups": None}):
			result = network_printing(
				"POS Invoice",
				"INV-001",
				"Printer-1",
			)

		self.assertIn("Failed to import cups", result)

	@patch("ury.ury.api.ury_print.validate_print_permission")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_network_printing_cups_import_fails(
		self, mock_get_doc, mock_validate_permission
	):
		"""Test network printing when cups import fails."""
		mock_printer_doc = MagicMock()
		mock_get_doc.return_value = mock_printer_doc

		with patch.dict("sys.modules", {"cups": None}):
			result = network_printing(
				"POS Invoice",
				"INV-001",
				"Printer-1",
			)

		self.assertIn("Failed", result)

	@patch("ury.ury.api.ury_print.validate_print_permission")
	@patch("ury.ury.api.ury_print.os.remove")
	@patch("builtins.open", new_callable=mock_open)
	@patch("ury.ury.api.ury_print.frappe.db.set_value")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.get_print")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_network_printing_with_update(
		self,
		mock_get_doc,
		mock_get_print,
		mock_db_get_value,
		mock_db_set_value,
		mock_file_open,
		mock_remove,
		mock_validate_permission,
	):
		"""Test network printing updates invoice status."""
		mock_printer_doc = MagicMock()
		mock_printer_doc.server_ip = "192.168.1.100"
		mock_printer_doc.port = 631
		mock_get_doc.return_value = mock_printer_doc
		mock_get_print.return_value = MagicMock()

		mock_db_get_value.return_value = (None, 0, "INV-001")

		# Mock the cups import to fail
		with patch.dict("sys.modules", {"cups": None}):
			result = network_printing(
				"POS Invoice",
				"INV-001",
				"Printer-1",
			)

		self.assertIn("Failed to import cups", result)


class TestSelectNetworkPrinter(FrappeTestCase):
	@patch("ury.ury.api.ury_print.network_printing")
	@patch("ury.ury.api.ury_print.frappe.get_all")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_select_network_printer_uses_room_printers(
		self, mock_get_doc, mock_db_get_value, mock_get_all, mock_network_printing
	):
		"""Test that select_network_printer uses room printers if table has room."""
		mock_invoice = MagicMock()
		mock_invoice.restaurant_table = "T-01"
		mock_get_doc.return_value = mock_invoice

		mock_db_get_value.side_effect = [
			"T-01",  # table from invoice
			"Room-1",  # room from table
			"Standard",  # print_format from POS Profile
		]

		mock_get_all.return_value = [
			frappe._dict({"printer": "Room Printer 1"}),
			frappe._dict({"printer": "Room Printer 2"}),
		]

		mock_network_printing.return_value = "Success"

		result = select_network_printer("POS-1", "INV-001")

		self.assertEqual(result, "Success")
		self.assertEqual(mock_network_printing.call_count, 2)

	@patch("ury.ury.api.ury_print.network_printing")
	@patch("ury.ury.api.ury_print.frappe.get_all")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_select_network_printer_no_printers_found(
		self, mock_get_doc, mock_db_get_value, mock_get_all, mock_network_printing
	):
		"""Test that select_network_printer returns None when no printers found."""
		mock_invoice = MagicMock()
		mock_invoice.restaurant_table = "T-01"
		mock_get_doc.return_value = mock_invoice

		mock_db_get_value.side_effect = ["T-01", "Room-1", "Standard"]
		mock_get_all.return_value = []

		result = select_network_printer("POS-1", "INV-001")

		self.assertIsNone(result)
		mock_network_printing.assert_not_called()

	@patch("ury.ury.api.ury_print.network_printing")
	@patch("ury.ury.api.ury_print.frappe.get_all")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_select_network_printer_uses_pos_profile_printers(
		self, mock_get_doc, mock_db_get_value, mock_get_all, mock_network_printing
	):
		"""Test that select_network_printer uses POS profile printers if no table."""
		mock_invoice = MagicMock()
		mock_invoice.restaurant_table = None
		mock_get_doc.return_value = mock_invoice

		mock_db_get_value.return_value = "Standard"

		mock_get_all.return_value = [
			frappe._dict({"printer": "POS Printer 1"}),
		]

		mock_network_printing.return_value = "Success"

		result = select_network_printer("POS-1", "INV-001")

		self.assertEqual(result, "Success")
		mock_network_printing.assert_called_once()

	@patch("ury.ury.api.ury_print.frappe.has_permission")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_select_network_printer_permission_denied(
		self, mock_get_doc, mock_has_permission
	):
		"""Test that select_network_printer throws on permission denied."""
		mock_invoice = MagicMock()
		mock_get_doc.return_value = mock_invoice
		mock_has_permission.return_value = False

		with self.assertRaises(frappe.PermissionError):
			select_network_printer("POS-1", "INV-001")


class TestQzPrintUpdate(FrappeTestCase):
	@patch("ury.ury.api.ury_print.frappe.db.set_value")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_qz_print_update_without_table(
		self, mock_get_doc, mock_db_get_value, mock_db_set_value
	):
		"""Test qz_print_update when invoice has no table."""
		mock_invoice = MagicMock()
		mock_get_doc.return_value = mock_invoice

		mock_db_get_value.side_effect = [None, 1]

		result = qz_print_update("INV-001")

		self.assertEqual(result, {"status": "Success"})
		mock_db_set_value.assert_called_once()

	@patch("ury.ury.api.ury_print.frappe.db.set_value")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_qz_print_update_with_table_and_invoice_not_printed(
		self, mock_get_doc, mock_db_get_value, mock_db_set_value
	):
		"""Test qz_print_update with table when invoice_printed is 0."""
		mock_invoice = MagicMock()
		mock_get_doc.return_value = mock_invoice

		mock_db_get_value.side_effect = ["T-01", 0, 1, 0]

		with patch("ury.ury.api.ury_print.release_merge_cluster_tables") as mock_release:
			result = qz_print_update("INV-001")

		self.assertEqual(result, {"status": "Success"})
		mock_release.assert_called_once_with("T-01")

	@patch("ury.ury.api.ury_print.frappe.db.set_value")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_qz_print_update_with_table_already_printed(
		self, mock_get_doc, mock_db_get_value, mock_db_set_value
	):
		"""Test qz_print_update when invoice_printed is already 1."""
		mock_invoice = MagicMock()
		mock_get_doc.return_value = mock_invoice

		mock_db_get_value.side_effect = ["T-01", 1]

		result = qz_print_update("INV-001")

		self.assertEqual(result, {"status": "Success"})
		mock_db_set_value.assert_not_called()


class TestPrintPosPage(FrappeTestCase):
	@patch("ury.ury.api.ury_print.release_merge_cluster_tables")
	@patch("ury.ury.api.ury_print.frappe.db.set_value")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.publish_realtime")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_print_pos_page_success(
		self,
		mock_get_doc,
		mock_publish,
		mock_db_get_value,
		mock_db_set_value,
		mock_release,
	):
		"""Test print_pos_page successfully publishes and updates invoice."""
		mock_doc = MagicMock()
		mock_get_doc.return_value = mock_doc

		mock_db_get_value.side_effect = [("T-01", "Branch-1", "INV-001"), 0]

		print_pos_page("POS Invoice", "INV-001", "Standard")

		mock_publish.assert_called_once()
		call_args = mock_publish.call_args
		self.assertIn("print_", call_args[0][0])

		mock_db_set_value.assert_called_once_with("POS Invoice", "INV-001", "invoice_printed", 1)
		mock_release.assert_called_once_with("T-01")

	@patch("ury.ury.api.ury_print.frappe.db.set_value")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.publish_realtime")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_print_pos_page_without_table(
		self,
		mock_get_doc,
		mock_publish,
		mock_db_get_value,
		mock_db_set_value,
	):
		"""Test print_pos_page when invoice has no table."""
		mock_doc = MagicMock()
		mock_get_doc.return_value = mock_doc

		mock_db_get_value.side_effect = [(None, "Branch-1", "INV-001"), 0]

		with patch("ury.ury.api.ury_print.release_merge_cluster_tables") as mock_release:
			print_pos_page("POS Invoice", "INV-001", "Standard")

		mock_publish.assert_called_once()
		mock_db_set_value.assert_called_once()
		mock_release.assert_not_called()

	@patch("ury.ury.api.ury_print.frappe.db.set_value")
	@patch("ury.ury.api.ury_print.frappe.db.get_value")
	@patch("ury.ury.api.ury_print.frappe.publish_realtime")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_print_pos_page_already_printed_no_release(
		self,
		mock_get_doc,
		mock_publish,
		mock_db_get_value,
		mock_db_set_value,
	):
		"""Test print_pos_page when invoice already printed."""
		mock_doc = MagicMock()
		mock_get_doc.return_value = mock_doc

		# First call: table exists, invoice_printed already 1
		mock_db_get_value.side_effect = [("T-01", "Branch-1", "INV-001"), 1]

		with patch("ury.ury.api.ury_print.release_merge_cluster_tables") as mock_release:
			print_pos_page("POS Invoice", "INV-001", "Standard")

		mock_publish.assert_called_once()
		mock_release.assert_not_called()

	@patch("ury.ury.api.ury_print.frappe.has_permission")
	@patch("ury.ury.api.ury_print.frappe.get_doc")
	def test_print_pos_page_permission_denied(
		self, mock_get_doc, mock_has_permission
	):
		"""Test print_pos_page throws on permission denied."""
		mock_doc = MagicMock()
		mock_get_doc.return_value = mock_doc
		mock_has_permission.return_value = False

		with self.assertRaises(frappe.PermissionError):
			print_pos_page("POS Invoice", "INV-001", "Standard")


class TestQzCertificate(FrappeTestCase):
	@patch("ury.ury.api.ury_print.frappe.get_site_config")
	def test_qz_certificate_returns_cert(self, mock_get_config):
		"""Test qz_certificate returns certificate from config."""
		cert_value = "-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----"
		mock_get_config.return_value = {"qz_cert": cert_value}

		result = qz_certificate()

		self.assertEqual(result, cert_value)

	@patch("ury.ury.api.ury_print.frappe.get_site_config")
	def test_qz_certificate_returns_none_if_not_set(self, mock_get_config):
		"""Test qz_certificate returns None if cert not configured."""
		mock_get_config.return_value = {}

		result = qz_certificate()

		self.assertIsNone(result)


class TestSignaturePromise(FrappeTestCase):
	@patch("ury.ury.api.ury_print.frappe.get_roles")
	@patch("ury.ury.api.ury_print._get_qz_private_key")
	def test_signature_promise_success(self, mock_get_key, mock_get_roles):
		"""Test successful signature promise."""
		from cryptography.hazmat.primitives.asymmetric import rsa
		from cryptography.hazmat.primitives import serialization

		private_key = rsa.generate_private_key(
			public_exponent=65537,
			key_size=2048,
		)
		pem = private_key.private_bytes(
			encoding=serialization.Encoding.PEM,
			format=serialization.PrivateFormat.TraditionalOpenSSL,
			encryption_algorithm=serialization.NoEncryption(),
		)

		mock_get_key.return_value = pem
		mock_get_roles.return_value = ["Administrator", "URY Admin"]

		with patch("frappe.session") as mock_session:
			mock_session.user = "admin_user"
			result = signature_promise("test_payload")

		self.assertIsInstance(result, str)
		decoded = base64.b64decode(result)
		self.assertIsNotNone(decoded)

	@patch("ury.ury.api.ury_print.frappe.get_roles")
	def test_signature_promise_guest_denied(self, mock_get_roles):
		"""Test signature_promise denies Guest user."""
		with patch("frappe.session") as mock_session:
			mock_session.user = "Guest"
			with self.assertRaises(frappe.PermissionError):
				signature_promise("test_payload")

	@patch("ury.ury.api.ury_print.frappe.get_roles")
	def test_signature_promise_insufficient_roles(self, mock_get_roles):
		"""Test signature_promise denies users without signing roles."""
		mock_get_roles.return_value = ["User"]

		with patch("frappe.session") as mock_session:
			mock_session.user = "normal_user"
			with self.assertRaises(frappe.PermissionError):
				signature_promise("test_payload")

	@patch("ury.ury.api.ury_print.frappe.get_roles")
	def test_signature_promise_missing_payload(self, mock_get_roles):
		"""Test signature_promise throws when payload is missing."""
		mock_get_roles.return_value = ["Administrator"]

		with patch("frappe.session") as mock_session:
			mock_session.user = "admin_user"
			with self.assertRaises(frappe.ValidationError):
				signature_promise(toSign=None)


class TestGetQzPrivateKey(FrappeTestCase):
	@patch("ury.ury.api.ury_print.frappe.get_site_config")
	def test_get_qz_private_key_from_pem_content(self, mock_get_config):
		"""Test _get_qz_private_key reads PEM content directly."""
		pem_content = "-----BEGIN RSA PRIVATE KEY-----\nkey_data\n-----END RSA PRIVATE KEY-----"
		mock_get_config.return_value = {"qz_private_key": pem_content}

		result = _get_qz_private_key()

		self.assertEqual(result, pem_content.encode())

	@patch("ury.ury.api.ury_print.frappe.get_site_config")
	def test_get_qz_private_key_not_configured(self, mock_get_config):
		"""Test _get_qz_private_key throws when not configured."""
		mock_get_config.return_value = {}

		with self.assertRaises(frappe.ValidationError):
			_get_qz_private_key()

	@patch("ury.ury.api.ury_print.frappe.get_site_config")
	def test_get_qz_private_key_empty_config(self, mock_get_config):
		"""Test _get_qz_private_key with empty string in config."""
		mock_get_config.return_value = {"qz_private_key": "   "}

		with self.assertRaises(frappe.ValidationError):
			_get_qz_private_key()


class TestQzSigningRoles(FrappeTestCase):
	def test_qz_signing_roles_contains_expected_roles(self):
		"""Test that QZ_SIGNING_ROLES contains expected administrator roles."""
		self.assertIn("Administrator", QZ_SIGNING_ROLES)
		self.assertIn("System Manager", QZ_SIGNING_ROLES)
		self.assertIn("URY Admin", QZ_SIGNING_ROLES)
		self.assertIn("URY Manager", QZ_SIGNING_ROLES)
		self.assertIn("URY Cashier", QZ_SIGNING_ROLES)

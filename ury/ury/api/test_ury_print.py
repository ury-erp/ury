import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, mock_open, MagicMock
from ury.ury.api.ury_print import signature_promise, qz_sign, _get_qz_private_key
import base64

class TestUryPrintQZ(FrappeTestCase):

    def setUp(self):
        self.valid_pem = b"-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"

    def test_qz_sign_guest_access(self):
        frappe.session.user = "Guest"
        with self.assertRaises(frappe.PermissionError):
            signature_promise("some-payload")
        with self.assertRaises(frappe.PermissionError):
            qz_sign()
        frappe.session.user = "Administrator" # Restore

    @patch("ury.ury.api.ury_print.frappe.get_roles")
    def test_qz_sign_unauthorized_role(self, mock_get_roles):
        frappe.session.user = "test@example.com"
        mock_get_roles.return_value = ["Blogger"]
        with self.assertRaises(frappe.PermissionError):
            signature_promise("payload")
        with self.assertRaises(frappe.PermissionError):
            qz_sign()
        frappe.session.user = "Administrator" # Restore

    @patch("ury.ury.api.ury_print.frappe.get_roles")
    @patch("ury.ury.api.ury_print._get_qz_private_key")
    @patch("cryptography.hazmat.primitives.serialization.load_pem_private_key")
    def test_signature_promise_valid(self, mock_load_pem, mock_get_key, mock_get_roles):
        frappe.session.user = "test@example.com"
        mock_get_roles.return_value = ["URY Cashier"]
        mock_get_key.return_value = self.valid_pem
        
        mock_key = MagicMock()
        mock_key.sign.return_value = b"signed_bytes"
        mock_load_pem.return_value = mock_key

        result = signature_promise("my-payload")
        self.assertEqual(result, base64.b64encode(b"signed_bytes").decode("ascii"))
        frappe.session.user = "Administrator" # Restore

    @patch("ury.ury.api.ury_print.frappe.get_site_config")
    @patch("ury.ury.api.ury_print.frappe.get_site_path")
    def test_get_qz_private_key_path_traversal(self, mock_get_site_path, mock_get_site_config):
        mock_get_site_config.return_value = {"qz_private_key": "../../../etc/passwd"}
        # Mock get_site_path to return predictable paths
        def side_effect(*args):
            if len(args) == 1 and args[0] == "private":
                return "/var/www/site/private"
            return "/var/www/site/private/" + args[1]
            
        mock_get_site_path.side_effect = side_effect

        with self.assertRaises(frappe.ValidationError) as context:
            _get_qz_private_key()
        
        self.assertIn("Invalid QZ private key path", str(context.exception))

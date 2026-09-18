"""Tests for per-table self-ordering QR codes.

What matters here is which of the "no code for this table" cases are reported
and which are raised. The form calls `get_table_qr` on every load, so a branch
that simply does not use self-ordering must come back as a message, not as an
exception the user meets as a red dialog.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch

from ury.ury.api import self_ordering_qr as qr


def _table(name="T1", branch="Branch A", takeaway=0):
    return frappe._dict(name=name, branch=branch, is_take_away=takeaway)


class TestTableQR(FrappeTestCase):

    @patch("ury.ury.api.self_ordering_qr.frappe.has_permission", return_value=False)
    def test_unreadable_table_is_refused(self, mock_perm):
        """Minting a code grants ordering access, so it is not a public read."""
        with self.assertRaises(frappe.PermissionError):
            qr.get_table_qr("T1")

    @patch("ury.ury.api.self_ordering_qr.frappe.get_doc")
    @patch("ury.ury.api.self_ordering_qr.frappe.has_permission", return_value=True)
    def test_table_without_a_branch_reports_rather_than_throws(
        self, mock_perm, mock_get_doc
    ):
        mock_get_doc.return_value = _table(branch=None)

        result = qr.get_table_qr("T1")

        self.assertFalse(result["available"])
        self.assertIsNone(result["svg"])
        self.assertIn("branch", result["reason"].lower())

    @patch("ury.ury.api.self_ordering_qr.frappe.get_all", return_value=[])
    @patch("ury.ury.api.self_ordering_qr.frappe.get_doc")
    @patch("ury.ury.api.self_ordering_qr.frappe.has_permission", return_value=True)
    def test_branch_without_a_profile_reports_rather_than_throws(
        self, mock_perm, mock_get_doc, mock_get_all
    ):
        """A branch that does not use self-ordering is not an error state.

        This runs on every form load for every table in the system, so the
        common case of "not configured" must not surface as an exception.
        """
        mock_get_doc.return_value = _table()

        result = qr.get_table_qr("T1")

        self.assertFalse(result["available"])
        self.assertIn("Branch A", result["reason"])

    @patch("ury.ury.api.self_ordering_qr.generate_qr_token", return_value="TOKEN123")
    @patch("ury.ury.api.self_ordering_qr.frappe.get_all", return_value=["Profile A"])
    @patch("ury.ury.api.self_ordering_qr.frappe.get_doc")
    @patch("ury.ury.api.self_ordering_qr.frappe.has_permission", return_value=True)
    def test_configured_table_renders_a_scannable_svg(
        self, mock_perm, mock_get_doc, mock_get_all, mock_token
    ):
        mock_get_doc.return_value = _table()

        result = qr.get_table_qr("T1")

        self.assertTrue(result["available"])
        self.assertEqual(result["profile"], "Profile A")
        self.assertIn("TOKEN123", result["url"])
        self.assertTrue(result["svg"].startswith("<svg"))

    @patch("ury.ury.api.self_ordering_qr.generate_qr_token", return_value="TOKEN123")
    @patch("ury.ury.api.self_ordering_qr.frappe.get_all")
    @patch("ury.ury.api.self_ordering_qr.frappe.get_doc")
    @patch("ury.ury.api.self_ordering_qr.frappe.has_permission", return_value=True)
    def test_oldest_profile_wins_when_a_branch_has_several(
        self, mock_perm, mock_get_doc, mock_get_all, mock_token
    ):
        """The same table must not change its code between two calls.

        A code that changes is a code that has to be reprinted, so the choice
        is ordered rather than left to whatever the database returns first.
        """
        mock_get_doc.return_value = _table()
        mock_get_all.return_value = ["Oldest"]

        qr.get_table_qr("T1")

        self.assertEqual(mock_get_all.call_args.kwargs["order_by"], "creation asc")
        self.assertEqual(mock_get_all.call_args.kwargs["limit"], 1)

    @patch("ury.ury.api.self_ordering_qr.frappe.get_all", return_value=[])
    @patch("ury.ury.api.self_ordering_qr.frappe.get_doc")
    @patch("ury.ury.api.self_ordering_qr.frappe.has_permission", return_value=True)
    def test_download_throws_where_the_panel_only_reports(
        self, mock_perm, mock_get_doc, mock_get_all
    ):
        """A download is an explicit click, so it answers with an error."""
        mock_get_doc.return_value = _table()

        with self.assertRaises(frappe.ValidationError):
            qr.download_table_qr("T1")

    def test_unsupported_download_format_is_refused(self):
        with self.assertRaisesRegex(frappe.ValidationError, "Unsupported format"):
            qr.download_table_qr("T1", fmt="pdf")

    @patch("ury.ury.api.self_ordering_qr.generate_qr_token", return_value="TOKEN123")
    @patch("ury.ury.api.self_ordering_qr.frappe.get_all", return_value=["Profile A"])
    @patch("ury.ury.api.self_ordering_qr.frappe.get_doc")
    @patch("ury.ury.api.self_ordering_qr.frappe.has_permission", return_value=True)
    def test_png_download_is_a_png(
        self, mock_perm, mock_get_doc, mock_get_all, mock_token
    ):
        mock_get_doc.return_value = _table()
        frappe.local.response = frappe._dict()

        qr.download_table_qr("T1", fmt="png")

        self.assertEqual(frappe.local.response.type, "download")
        self.assertTrue(frappe.local.response.filename.endswith(".png"))
        # PNG magic number — proves a real image was written, not a stub.
        self.assertTrue(frappe.local.response.filecontent.startswith(b"\x89PNG"))

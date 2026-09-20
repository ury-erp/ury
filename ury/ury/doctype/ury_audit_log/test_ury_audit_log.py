"""Tests for the record of what staff did to money.

The properties that matter here are not "does it store a row". They are that
it never breaks a sale, that it attributes to the session user rather than to
whoever the caller names, and that what lands in it cannot be quietly removed.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch

from ury.ury.doctype.ury_audit_log.ury_audit_log import EVENTS, record_event

MOD = "ury.ury.doctype.ury_audit_log.ury_audit_log"


class TestRecordEvent(FrappeTestCase):

    @patch(f"{MOD}.frappe.log_error")
    @patch(f"{MOD}.frappe.get_doc")
    def test_an_unknown_event_is_refused_not_stored(self, mock_get_doc, mock_log):
        """A typo at a call site must not create a row no filter will find."""
        self.assertIsNone(record_event("Free Lunch Given"))

        mock_get_doc.assert_not_called()
        mock_log.assert_called_once()

    @patch(f"{MOD}.frappe.log_error")
    @patch(f"{MOD}.frappe.get_doc", side_effect=Exception("db gone"))
    def test_a_broken_audit_write_never_breaks_the_sale(self, mock_get_doc, mock_log):
        """An audit trail that can fail a payment is one that gets removed the
        first time it does — and the entry describes something that already
        happened, so refusing afterwards would be useless as well as
        destructive."""
        self.assertIsNone(
            record_event("Discount Applied", reference_doctype="POS Invoice", reference_name="INV-1")
        )
        mock_log.assert_called_once()

    @patch(f"{MOD}.frappe.db.get_value", return_value=None)
    @patch(f"{MOD}.frappe.get_doc")
    def test_attribution_is_the_session_user(self, mock_get_doc, mock_get_value):
        """Never a caller-supplied name: the whole point is an author the
        operator cannot choose."""
        record_event("Discount Applied", reference_doctype="POS Invoice", reference_name="INV-1")

        payload = mock_get_doc.call_args[0][0]
        self.assertEqual(payload["performed_by"], frappe.session.user)

    @patch(f"{MOD}.frappe.db.get_value", return_value=None)
    @patch(f"{MOD}.frappe.get_doc")
    def test_long_values_are_truncated_rather_than_rejected(self, mock_get_doc, mock_get_value):
        """`old_value`/`new_value` are Data columns. An over-long value must
        cost detail, not the whole entry."""
        record_event("Price Overridden", old_value="x" * 500, new_value="y" * 500)

        payload = mock_get_doc.call_args[0][0]
        self.assertEqual(len(payload["old_value"]), 140)
        self.assertEqual(len(payload["new_value"]), 140)

    @patch(f"{MOD}.frappe.db.get_value", return_value=None)
    @patch(f"{MOD}.frappe.get_doc")
    def test_details_are_stored_as_json(self, mock_get_doc, mock_get_value):
        record_event("Bill Split", details={"items_moved": 3})

        payload = mock_get_doc.call_args[0][0]
        self.assertIn('"items_moved": 3', payload["details"])

    def test_every_event_used_in_the_codebase_is_declared(self):
        """The call sites pass literals; this is what turns a typo into a
        failing test rather than an unfindable row.

        Scanned in python rather than with grep because the literal sits on
        the line after `record_event(` at every call site, and a line-based
        tool reports a clean sweep by simply not seeing any of them.
        """
        import os
        import re

        app_root = frappe.get_app_path("ury")
        pattern = re.compile(r'record_event\(\s*"([^"]+)"')
        used = set()
        for dirpath, _dirnames, filenames in os.walk(app_root):
            for filename in filenames:
                # This file passes a deliberately invalid event to prove one
                # is refused; it is not a call site.
                if not filename.endswith(".py") or filename.startswith("test_"):
                    continue
                path = os.path.join(dirpath, filename)
                with open(path, encoding="utf-8") as handle:
                    used.update(pattern.findall(handle.read()))

        self.assertTrue(used, "no record_event call sites found — has the pattern rotted?")
        self.assertEqual(used - set(EVENTS), set())


class TestAppendOnly(FrappeTestCase):

    def test_no_role_may_create_write_or_delete(self):
        """Append-only by construction: the only way in is the server."""
        meta = frappe.get_meta("URY Audit Log")
        for perm in meta.permissions:
            self.assertFalse(perm.create, f"{perm.role} can create audit entries")
            self.assertFalse(perm.write, f"{perm.role} can edit audit entries")
            self.assertFalse(perm.delete, f"{perm.role} can delete audit entries")

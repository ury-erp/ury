"""Tests that a retried order reaches the kitchen once.

A POS that loses its connection mid-request cannot tell a request that never
arrived from one that arrived and whose reply was lost. Retrying is the only
move it has. These cover what the second attempt must do, because the
alternative to answering it correctly is the same dishes cooked twice and a
table charged for both.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury.doctype.ury_order.ury_order import (
    _already_applied_sync,
    _record_sync_request,
    sync_order,
)

MOD = "ury.ury.doctype.ury_order.ury_order"


class TestAlreadyAppliedSync(FrappeTestCase):

    @patch(f"{MOD}.frappe.db.get_value", return_value=None)
    def test_an_unseen_key_is_not_a_replay(self, mock_get_value):
        self.assertIsNone(_already_applied_sync("key-never-seen"))

    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.frappe.db.exists", return_value=True)
    @patch(f"{MOD}.frappe.db.get_value", return_value="POS-INV-100")
    def test_a_replay_returns_the_original_invoice(
        self, mock_get_value, mock_exists, mock_get_doc
    ):
        """Same shape as a fresh call, so the caller cannot tell the
        difference and does not have to handle one."""
        doc = MagicMock()
        doc.as_dict.return_value = {"name": "POS-INV-100"}
        mock_get_doc.return_value = doc

        result = _already_applied_sync("key-1")

        self.assertEqual(result, {"name": "POS-INV-100"})
        mock_get_value.assert_called_once_with(
            "URY Sync Request", {"idempotency_key": "key-1"}, "invoice"
        )

    @patch(f"{MOD}.frappe.db.exists", return_value=False)
    @patch(f"{MOD}.frappe.db.get_value", return_value="POS-INV-GONE")
    def test_a_replay_of_a_deleted_order_is_still_refused(self, mock_get_value, mock_exists):
        """Re-creating a deleted order out of a stale queue is the opposite
        of what the cashier did when they deleted it."""
        result = _already_applied_sync("key-2")

        self.assertEqual(result["status"], "Already Applied")


class TestRecordSyncRequest(FrappeTestCase):

    @patch(f"{MOD}.frappe.get_doc")
    def test_the_key_is_stored_against_the_invoice(self, mock_get_doc):
        _record_sync_request("key-3", "POS-INV-100", "Profile A")

        payload = mock_get_doc.call_args[0][0]
        self.assertEqual(payload["doctype"], "URY Sync Request")
        self.assertEqual(payload["idempotency_key"], "key-3")
        self.assertEqual(payload["invoice"], "POS-INV-100")

    @patch(f"{MOD}.frappe.get_doc")
    def test_two_racing_retries_do_not_both_fail(self, mock_get_doc):
        mock_get_doc.return_value.insert.side_effect = frappe.DuplicateEntryError
        # The first one won; there is nothing to add and nothing to report.
        _record_sync_request("key-4", "POS-INV-100", "Profile A")

    @patch(f"{MOD}.frappe.log_error")
    @patch(f"{MOD}.frappe.get_doc")
    def test_a_failed_record_never_fails_the_order(self, mock_get_doc, mock_log):
        """The food is already going to the kitchen. Throwing away an order
        that succeeded is far worse than a retry that will almost certainly
        never come."""
        mock_get_doc.return_value.insert.side_effect = Exception("db gone")

        _record_sync_request("key-5", "POS-INV-100", "Profile A")

        mock_log.assert_called_once()


class TestSyncOrderGate(FrappeTestCase):

    @patch(f"{MOD}.frappe.get_roles")
    @patch(f"{MOD}._already_applied_sync")
    def test_a_replay_short_circuits_before_any_work(self, mock_applied, mock_get_roles):
        """The gate sits above everything: no profile load, no permission
        check, no invoice touched."""
        mock_applied.return_value = {"name": "POS-INV-100"}

        result = sync_order(
            items="[]", cashier="c", owner="o", mode_of_payment="Cash",
            customer="Walk In", no_of_pax=2, last_invoice=None, waiter="w",
            pos_profile="Profile A", request_id="key-6",
        )

        self.assertEqual(result, {"name": "POS-INV-100"})
        mock_get_roles.assert_not_called()

    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.frappe.get_roles", return_value=[])
    @patch(f"{MOD}._already_applied_sync")
    def test_without_a_key_the_gate_is_not_consulted(
        self, mock_applied, mock_get_roles, mock_get_doc
    ):
        """Callers that do not send one keep the old behaviour exactly."""
        try:
            sync_order(
                items="[]", cashier="c", owner="o", mode_of_payment="Cash",
                customer="Walk In", no_of_pax=2, last_invoice=None, waiter="w",
                pos_profile="Profile A",
            )
        except Exception:
            pass

        mock_applied.assert_not_called()

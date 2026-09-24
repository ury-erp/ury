"""Tests for closing a table without printing the bill.

The guards are the point of these, not the happy path. This endpoint is the
one way to take an open bill off the floor without a receipt, so what it
refuses matters more than what it allows.
"""

import datetime

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

# Patching `<module>.frappe.get_doc` patches the frappe module globally, so
# anything the code under test reaches through frappe gets a MagicMock too.
# `now_datetime()` does exactly that: it loads System Settings for the
# timezone, and Frappe then tries to pickle that mock into the Redis document
# cache. The test therefore passed or failed depending on whether the cache
# happened to be warm — green in a normal run, red right after a cache clear.
# Pinning the clock removes the dependency and makes the recorded timestamp
# deterministic besides.
FROZEN_NOW = datetime.datetime(2026, 9, 19, 3, 30, 0)

from ury.ury.doctype.ury_order.ury_order import close_table, get_table_close_state


def _invoice(
    branch="Branch A",
    table="T1",
    printed=0,
    docstatus=0,
    items=("one",),
    pos_profile="Profile A",
    merged_tables=None,
):
    doc = MagicMock()
    doc.branch = branch
    doc.restaurant_table = table
    doc.custom_merged_tables = merged_tables
    doc.invoice_printed = printed
    doc.docstatus = docstatus
    doc.items = list(items)
    doc.pos_profile = pos_profile
    return doc


class TestCloseTable(FrappeTestCase):

    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    def test_requires_a_table_or_an_invoice(self, mock_branch):
        with self.assertRaisesRegex(frappe.ValidationError, "table or an invoice"):
            close_table()

    @patch("ury.ury.doctype.ury_order.ury_order.release_merge_cluster_tables")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.set_value")
    @patch("ury.ury.doctype.ury_order.ury_order._may_close_table", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_open_bill_needs_a_reason(
        self, mock_session, mock_branch, mock_get_doc, mock_perm, mock_may,
        mock_set_value, mock_release,
    ):
        """A bill with food on it does not leave the floor anonymously."""
        mock_session.user = "cashier@test.com"
        mock_get_doc.return_value = _invoice(items=("burger",))

        with self.assertRaisesRegex(frappe.ValidationError, "reason is required"):
            close_table(invoice="INV-1")

        mock_set_value.assert_not_called()
        mock_release.assert_not_called()

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.utils.now_datetime", return_value=FROZEN_NOW)
    @patch("ury.ury.doctype.ury_order.ury_order.release_merge_cluster_tables")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.set_value")
    @patch("ury.ury.doctype.ury_order.ury_order._may_close_table", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_empty_bill_needs_no_reason(
        self, mock_session, mock_branch, mock_get_doc, mock_perm, mock_may,
        mock_set_value, mock_release, mock_now,
    ):
        """Nothing was sold, so there is nothing to account for."""
        mock_session.user = "cashier@test.com"
        mock_get_doc.return_value = _invoice(items=())

        result = close_table(invoice="INV-1")

        self.assertEqual(result["status"], "Success")
        self.assertFalse(result["had_items"])
        mock_release.assert_called_once()

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.utils.now_datetime", return_value=FROZEN_NOW)
    @patch("ury.ury.doctype.ury_order.ury_order.release_merge_cluster_tables")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.set_value")
    @patch("ury.ury.doctype.ury_order.ury_order._may_close_table", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_closing_settles_the_bill_and_records_no_receipt(
        self, mock_session, mock_branch, mock_get_doc, mock_perm, mock_may,
        mock_set_value, mock_release, mock_now,
    ):
        """The table is never freed while its bill stays open.

        Freeing the table alone would leave a draft invoice attached to
        nothing — revenue off the floor and out of every list a waiter reads.
        """
        mock_session.user = "cashier@test.com"
        mock_get_doc.return_value = _invoice(items=("burger",))

        close_table(invoice="INV-1", reason="paid cash, no receipt wanted")

        values = mock_set_value.call_args[0][2]
        self.assertEqual(values["invoice_printed"], 1)
        self.assertEqual(values["custom_closed_without_print"], 1)
        self.assertEqual(values["custom_close_reason"], "paid cash, no receipt wanted")
        self.assertEqual(values["custom_closed_by"], "cashier@test.com")
        self.assertEqual(values["custom_closed_at"], FROZEN_NOW)
        mock_release.assert_called_once()

    @patch("ury.ury.doctype.ury_order.ury_order.release_merge_cluster_tables")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.set_value")
    @patch("ury.ury.doctype.ury_order.ury_order._may_close_table", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_whitespace_only_reason_is_not_a_reason(
        self, mock_session, mock_branch, mock_get_doc, mock_perm, mock_may,
        mock_set_value, mock_release,
    ):
        mock_session.user = "cashier@test.com"
        mock_get_doc.return_value = _invoice(items=("burger",))

        with self.assertRaisesRegex(frappe.ValidationError, "reason is required"):
            close_table(invoice="INV-1", reason="   ")

    @patch("ury.ury.doctype.ury_order.ury_order.release_merge_cluster_tables")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.set_value")
    @patch("ury.ury.doctype.ury_order.ury_order._may_close_table", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_already_billed_only_releases_the_table(
        self, mock_session, mock_branch, mock_get_doc, mock_perm, mock_may,
        mock_set_value, mock_release,
    ):
        """A second close must not re-stamp the audit fields.

        Otherwise the recorded reason and closer would be whatever the last
        person typed, not the person who actually closed it.
        """
        mock_session.user = "cashier@test.com"
        mock_get_doc.return_value = _invoice(printed=1, items=("burger",))

        close_table(invoice="INV-1", reason="second attempt")

        mock_set_value.assert_not_called()
        mock_release.assert_called_once()

    @patch("ury.ury.doctype.ury_order.ury_order._may_close_table", return_value=False)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_role_gate(self, mock_session, mock_branch, mock_get_doc, mock_perm, mock_may):
        mock_session.user = "runner@test.com"
        mock_get_doc.return_value = _invoice()

        with self.assertRaises(frappe.PermissionError):
            close_table(invoice="INV-1", reason="because")

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_other_branch_is_refused(
        self, mock_session, mock_branch, mock_get_doc, mock_perm
    ):
        mock_session.user = "cashier@test.com"
        mock_get_doc.return_value = _invoice(branch="Branch B")

        with self.assertRaises(frappe.PermissionError):
            close_table(invoice="INV-1", reason="because")

    @patch("ury.ury.doctype.ury_order.ury_order._may_close_table", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_cancelled_order_cannot_be_closed(
        self, mock_session, mock_branch, mock_get_doc, mock_perm, mock_may
    ):
        mock_session.user = "cashier@test.com"
        mock_get_doc.return_value = _invoice(docstatus=2)

        with self.assertRaisesRegex(frappe.ValidationError, "cancelled"):
            close_table(invoice="INV-1", reason="because")


class TestTableCloseState(FrappeTestCase):
    """What the order screen is allowed to offer a "Close Table" button for.

    `can_close` is the only field that gates an action, so each case below is
    really about one question: can releasing this table strand an open bill?
    """

    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    def test_an_order_with_no_table_has_nothing_to_close(self, mock_branch):
        """Takeaway and delivery hold no table, and asking is not an error."""
        with patch(
            "ury.ury.doctype.ury_order.ury_order.frappe.db.get_value",
            return_value=frappe._dict(
                restaurant_table=None, custom_merged_tables=None, branch="Branch A"
            ),
        ):
            state = get_table_close_state(invoice="INV-1")

        self.assertIsNone(state["table"])
        self.assertFalse(state["can_close"])

    @patch("ury.ury.doctype.ury_order.ury_order._has_open_pos_invoices_for_cluster")
    @patch("ury.ury.doctype.ury_order.ury_order._get_table_group", return_value=["T1"])
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    def test_held_table_with_nothing_open_can_be_closed(
        self, mock_branch, mock_session, mock_get_value, mock_group, mock_open
    ):
        mock_session.user = "cashier@test.com"
        mock_get_value.side_effect = [
            frappe._dict(
                restaurant_table="T1", custom_merged_tables=None, branch="Branch A"
            ),
            "T1",  # the occupied lookup found a member still flagged
        ]
        mock_open.return_value = False

        state = get_table_close_state(invoice="INV-1")

        self.assertTrue(state["occupied"])
        self.assertFalse(state["has_open_invoices"])
        self.assertTrue(state["can_close"])

    @patch("ury.ury.doctype.ury_order.ury_order._has_open_pos_invoices_for_cluster")
    @patch("ury.ury.doctype.ury_order.ury_order._get_table_group", return_value=["T1", "T2"])
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    def test_a_sibling_still_open_blocks_the_close(
        self, mock_branch, mock_session, mock_get_value, mock_group, mock_open
    ):
        """The bill on screen is settled; the one on its merge partner is not.

        This is the case the button must never appear for — releasing here
        takes a live bill off the floor with the table.
        """
        mock_session.user = "cashier@test.com"
        mock_get_value.side_effect = [
            frappe._dict(
                restaurant_table="T1", custom_merged_tables="T2", branch="Branch A"
            ),
            "T1",
        ]
        mock_open.return_value = True

        state = get_table_close_state(invoice="INV-1")

        self.assertTrue(state["has_open_invoices"])
        self.assertFalse(state["can_close"])

    @patch("ury.ury.doctype.ury_order.ury_order._has_open_pos_invoices_for_cluster")
    @patch("ury.ury.doctype.ury_order.ury_order._get_table_group", return_value=["T1"])
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    def test_a_free_table_offers_nothing(
        self, mock_branch, mock_session, mock_get_value, mock_group, mock_open
    ):
        mock_session.user = "cashier@test.com"
        mock_get_value.side_effect = [
            frappe._dict(
                restaurant_table="T1", custom_merged_tables=None, branch="Branch A"
            ),
            None,  # nothing in the cluster is flagged occupied
        ]
        mock_open.return_value = False

        state = get_table_close_state(invoice="INV-1")

        self.assertFalse(state["occupied"])
        self.assertFalse(state["can_close"])

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch", return_value="Branch A")
    def test_another_branch_reports_nothing_rather_than_throwing(
        self, mock_branch, mock_session, mock_get_value
    ):
        """This runs behind a screen on every selection, not on a click.

        Throwing would turn browsing an order that happens to sit on another
        branch into an error toast the cashier never asked for.
        """
        mock_session.user = "cashier@test.com"
        mock_get_value.return_value = frappe._dict(
            restaurant_table="T1", custom_merged_tables=None, branch="Branch B"
        )

        state = get_table_close_state(invoice="INV-1")

        self.assertFalse(state["can_close"])
        self.assertEqual(state["tables"], [])

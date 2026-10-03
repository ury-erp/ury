"""Tests that settling a bill twice collects once.

A POS dismissed mid-request, a slow network, two cashiers on one table — all
produce a second `make_invoice` call for a bill that may already be settled.
These cover what that second call must do, because the alternative to
answering it correctly is a guest paying twice.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch

from ury.ury.doctype.ury_order.ury_order import make_invoice


ARGS = dict(
    customer="Walk In",
    payments=[{"mode_of_payment": "Cash", "amount": 100}],
    cashier="cashier@test.com",
    pos_profile="Profile A",
    owner="cashier@test.com",
)


class TestMakeInvoiceIdempotency(FrappeTestCase):

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_value", return_value="Dine In")
    @patch("ury.ury.doctype.ury_order.ury_order._validate_additional_discount", return_value=None)
    def test_already_settled_bill_is_not_settled_again(
        self, mock_discount, mock_get_value, mock_db_get_value, mock_resolve
    ):
        """The second caller gets the first settlement, not a second one."""
        mock_db_get_value.return_value = 1  # docstatus: submitted

        result = make_invoice(invoice="INV-1", **ARGS)

        self.assertEqual(result["status"], "Success")
        self.assertTrue(result["already_settled"])
        # The decisive assertion: nothing downstream ran, so no second set of
        # payments was appended and nothing was submitted again.
        mock_resolve.assert_not_called()

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_value", return_value="Dine In")
    @patch("ury.ury.doctype.ury_order.ury_order._validate_additional_discount", return_value=None)
    def test_the_docstatus_read_takes_a_row_lock(
        self, mock_discount, mock_get_value, mock_db_get_value, mock_resolve
    ):
        """Without the lock, two callers both read 0 and both settle.

        The guard above only helps if the read that feeds it is serialised
        against a concurrent settle of the same row.
        """
        mock_db_get_value.return_value = 1

        make_invoice(invoice="INV-1", **ARGS)

        self.assertTrue(mock_db_get_value.call_args.kwargs.get("for_update"))

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_value", return_value="Dine In")
    @patch("ury.ury.doctype.ury_order.ury_order._validate_additional_discount", return_value=None)
    def test_cancelled_bill_is_refused(
        self, mock_discount, mock_get_value, mock_db_get_value, mock_resolve
    ):
        """A cancelled bill is neither settled nor reported as settled."""
        mock_db_get_value.return_value = 2  # docstatus: cancelled

        with self.assertRaisesRegex(frappe.ValidationError, "cancelled"):
            make_invoice(invoice="INV-1", **ARGS)

        mock_resolve.assert_not_called()

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_value", return_value="Dine In")
    @patch("ury.ury.doctype.ury_order.ury_order._validate_additional_discount", return_value=None)
    def test_table_path_is_guarded_after_resolution(
        self, mock_discount, mock_get_value, mock_db_get_value, mock_resolve
    ):
        """Settling by table resolves the invoice by table, not by name.

        The name-based guard cannot see that case, so the same rule is
        applied again once the invoice is known — otherwise a repeat settle
        from the table screen slips past.
        """
        mock_db_get_value.return_value = 0
        resolved = frappe._dict(name="INV-9", docstatus=1)
        mock_resolve.return_value = resolved

        result = make_invoice(table="T1", **ARGS)

        self.assertTrue(result["already_settled"])
        self.assertEqual(result["invoice"], "INV-9")

"""A table bill needs printing before payment only where the restaurant asks.

The rule used to be unconditional on the server while the POS had stopped
asking for a print, so the cashier took the money and the submit failed with
"Printing the invoice is mandatory before submitting".
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.hooks.ury_pos_invoice import validate_invoice_print

MOD = "ury.ury.hooks.ury_pos_invoice"


def _invoice(table="T-1"):
    return frappe._dict(name="POS-INV-1", restaurant_table=table, pos_profile="Main POS")


class TestValidateInvoicePrint(FrappeTestCase):

    @patch(f"{MOD}.frappe.db.get_value", return_value=0)
    @patch(f"{MOD}.requires_bill_print", return_value=False)
    def test_an_unprinted_table_bill_settles_by_default(self, _requires, _printed):
        validate_invoice_print(_invoice(), "before_submit")

    @patch(f"{MOD}.frappe.db.get_value", return_value=0)
    @patch(f"{MOD}.requires_bill_print", return_value=True)
    def test_the_setting_refuses_an_unprinted_table_bill(self, _requires, _printed):
        with self.assertRaises(frappe.ValidationError):
            validate_invoice_print(_invoice(), "before_submit")

    @patch(f"{MOD}.frappe.db.get_value", return_value=1)
    @patch(f"{MOD}.requires_bill_print", return_value=True)
    def test_the_setting_lets_a_printed_bill_through(self, _requires, _printed):
        validate_invoice_print(_invoice(), "before_submit")

    @patch(f"{MOD}.requires_bill_print", return_value=True)
    def test_takeaway_never_needs_a_print(self, _requires):
        validate_invoice_print(_invoice(table=None), "before_submit")

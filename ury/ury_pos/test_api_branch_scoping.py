# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import unittest
from unittest.mock import patch, MagicMock

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury_pos.api import getPosInvoiceItems


class TestGetPosInvoiceItemsBranchScoping(FrappeTestCase):
    """Regression tests for the branch guard in getPosInvoiceItems (ury/ury_pos/api.py).

    getPosInvoiceItems must:
      1. raise frappe.PermissionError when the caller lacks read permission
         on the POS Invoice document, and
      2. raise frappe.PermissionError when the invoice's branch differs from
         the caller's active branch (getBranch()), even if they hold read
         permission on the doctype in general, and
      3. return the item/tax shape unchanged when the invoice belongs to the
         caller's own branch.

    If the branch guard (the `if orderdItems.branch and user_branch and
    orderdItems.branch != user_branch: frappe.throw(...)` block) were removed,
    test_cross_branch_invoice_raises_permission_error would fail because no
    exception would be raised and getPosInvoiceItems would happily return the
    other branch's item/tax data instead.
    """

    def _make_invoice(self, branch, items=None, taxes=None):
        mock_invoice = MagicMock()
        mock_invoice.branch = branch
        mock_invoice.items = items or []
        mock_invoice.taxes = taxes or []
        return mock_invoice

    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.get_doc")
    def test_cross_branch_invoice_raises_permission_error(
        self, mock_get_doc, mock_has_permission, mock_getBranch
    ):
        # Caller has doctype-level read permission but the invoice belongs to
        # a different branch than the caller's active branch.
        mock_get_doc.return_value = self._make_invoice("Branch B")
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Branch A"

        with self.assertRaises(frappe.PermissionError) as context:
            getPosInvoiceItems("POS-INV-CROSS-BRANCH")

        self.assertIn("outside your active branch", str(context.exception))
        # Without the guard, no exception is raised here at all -- this
        # assertion (and the exception itself) is what the removed guard
        # was responsible for producing.

    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.get_doc")
    def test_same_branch_invoice_returns_item_and_tax_shape(
        self, mock_get_doc, mock_has_permission, mock_getBranch
    ):
        item = MagicMock()
        item.name = "ITEM-ROW-1"
        item.item_name = "Cheese Burger"
        item.qty = 2
        item.rate = 150.0
        item.amount = 300.0
        item.is_disposable = 0

        tax = MagicMock()
        tax.description = "VAT 5%"
        tax.tax_amount = 15.0

        mock_get_doc.return_value = self._make_invoice(
            "Branch A", items=[item], taxes=[tax]
        )
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Branch A"

        item_details, tax_details = getPosInvoiceItems("POS-INV-SAME-BRANCH")

        self.assertEqual(
            item_details,
            [
                {
                    "name": "ITEM-ROW-1",
                    "item_name": "Cheese Burger",
                    "qty": 2,
                    "rate": 150.0,
                    "amount": 300.0,
                    "is_disposable": 0,
                }
            ],
        )
        self.assertEqual(
            tax_details,
            [
                {
                    "description": "VAT 5%",
                    "rate": 15.0,
                }
            ],
        )

    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.get_doc")
    def test_no_read_permission_raises_permission_error(
        self, mock_get_doc, mock_has_permission, mock_getBranch
    ):
        # Even for an invoice in the caller's own branch, missing doctype
        # read permission must raise before the branch check is ever reached.
        mock_get_doc.return_value = self._make_invoice("Branch A")
        mock_has_permission.return_value = False
        mock_getBranch.return_value = "Branch A"

        with self.assertRaises(frappe.PermissionError) as context:
            getPosInvoiceItems("POS-INV-NO-PERMISSION")

        self.assertIn("Not permitted to view this order", str(context.exception))


if __name__ == "__main__":
    unittest.main()

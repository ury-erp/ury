from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury_pos import api
from ury.ury.doctype.ury_order import ury_order


class InvoiceDoc(SimpleNamespace):
    def get(self, key, default=None):
        return getattr(self, key, default)


class TestPOSInvoiceReadGuards(FrappeTestCase):
    def test_get_pos_invoice_items_requires_invoice_read_permission(self):
        invoice = InvoiceDoc(branch="B1", items=[], taxes=[])

        with (
            patch.object(api.frappe, "get_doc", return_value=invoice),
            patch.object(api.frappe, "has_permission", return_value=False),
            patch.object(api, "getBranch", return_value="B1"),
        ):
            self.assertRaises(frappe.PermissionError, api.getPosInvoiceItems, "PINV-1")

    def test_get_pos_invoice_items_allows_same_branch_read(self):
        invoice = InvoiceDoc(
            branch="B1",
            items=[
                InvoiceDoc(
                    name="ROW-1",
                    item_name="Coffee",
                    qty=1,
                    rate=100,
                    amount=100,
                )
            ],
            taxes=[InvoiceDoc(description="VAT", tax_amount=5)],
        )

        with (
            patch.object(api.frappe, "get_doc", return_value=invoice),
            patch.object(api.frappe, "has_permission", return_value=True),
            patch.object(api, "getBranch", return_value="B1"),
        ):
            items, taxes = api.getPosInvoiceItems("PINV-1")

        self.assertEqual(items[0]["item_name"], "Coffee")
        self.assertEqual(taxes[0]["description"], "VAT")

    def test_get_split_group_denies_cross_branch_current_invoice(self):
        invoice = InvoiceDoc(
            branch="B2",
            custom_split_group="GROUP-1",
            custom_split_from=None,
        )

        with (
            patch.object(api.frappe, "get_doc", return_value=invoice),
            patch.object(api.frappe, "has_permission", return_value=True),
            patch.object(api, "getBranch", return_value="B1"),
        ):
            self.assertRaises(frappe.PermissionError, api.get_split_group, "PINV-1")

    def test_get_split_group_filters_inaccessible_group_members(self):
        docs = {
            "PINV-1": InvoiceDoc(
                branch="B1",
                custom_split_group="GROUP-1",
                custom_split_from=None,
            ),
            "PINV-2": InvoiceDoc(branch="B2"),
        }

        def get_doc(doctype, name):
            self.assertEqual(doctype, "POS Invoice")
            return docs[name]

        with (
            patch.object(api.frappe, "get_doc", side_effect=get_doc),
            patch.object(api.frappe, "has_permission", return_value=True),
            patch.object(api, "getBranch", return_value="B1"),
            patch.object(
                api.frappe,
                "get_all",
                side_effect=[
                    [
                        frappe._dict(name="PINV-1", custom_split_group="GROUP-1"),
                        frappe._dict(name="PINV-2", custom_split_group="GROUP-1"),
                    ],
                    [],
                ],
            ),
        ):
            result = api.get_split_group("PINV-1")

        self.assertEqual([row.name for row in result["invoices"]], ["PINV-1"])

    def test_get_order_invoice_denies_cross_branch_table(self):
        with (
            patch.object(
                ury_order,
                "get_restaurant_and_menu_name",
                return_value=("B2", "MENU", "REST"),
            ),
            patch.object(
                ury_order,
                "assert_branch_access",
                side_effect=frappe.PermissionError,
            ),
            patch.object(ury_order.frappe, "get_all", return_value=[]),
        ):
            self.assertRaises(
                frappe.PermissionError,
                ury_order.get_order_invoice,
                table="T1",
                order_type="Dine In",
            )

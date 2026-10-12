"""The dashboard's bill list, bill page and the activity written on each bill."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import invoice_browser
from ury.ury.doctype.ury_order.ury_order import _log_order_activity

MOD = "ury.ury.api.invoice_browser"


class TestTransactionsList(FrappeTestCase):

    def _call(self, **kwargs):
        with patch(f"{MOD}.frappe.has_permission", return_value=True), \
             patch(f"{MOD}.frappe.get_list") as get_list:
            get_list.side_effect = [[frappe._dict(count=0, amount=0)], []]
            result = invoice_browser.get_transactions(**kwargs)
        totals_call, rows_call = get_list.call_args_list
        return result, totals_call.kwargs, rows_call.kwargs

    def test_an_unknown_page_size_falls_back_to_twenty(self):
        result, _, rows = self._call(page_size=5000)
        self.assertEqual(result["page_size"], 20)
        self.assertEqual(rows["page_length"], 20)

    def test_pages_are_offset_by_page_size(self):
        _, _, rows = self._call(page=3, page_size=50)
        self.assertEqual(rows["start"], 100)

    def test_cancelled_bills_are_hidden_unless_asked_for(self):
        _, totals, _ = self._call()
        self.assertIn(["POS Invoice", "docstatus", "!=", 2], totals["filters"])
        _, totals, _ = self._call(status="Cancelled")
        self.assertIn(["POS Invoice", "docstatus", "=", 2], totals["filters"])

    def test_search_looks_in_bill_customer_table_and_order_number(self):
        _, totals, _ = self._call(search=" 12 ")
        fields = {f[1] for f in totals["or_filters"]}
        self.assertEqual(fields, {"name", "customer_name", "restaurant_table", "custom_ury_order_number"})
        self.assertTrue(all(f[3] == "%12%" for f in totals["or_filters"]))

    def test_branch_all_is_not_a_filter(self):
        _, totals, _ = self._call(branch="all")
        self.assertFalse(any(f[1] == "branch" for f in totals["filters"]))


class TestPrintInvoice(FrappeTestCase):

    def _doc(self, **values):
        doc = MagicMock()
        doc.docstatus = values.get("docstatus", 1)
        doc.name = "INV-T"
        doc.pos_profile = "P"
        doc.get.side_effect = lambda key, default=None: values.get(key, default)
        doc.has_permission.return_value = values.get("can_print", True)
        return doc

    def test_a_cancelled_bill_is_not_printed(self):
        with patch(f"{MOD}.frappe.get_doc", return_value=self._doc(docstatus=2)):
            with self.assertRaises(frappe.ValidationError):
                invoice_browser.print_invoice("INV-T")

    def test_printer_channel_needs_a_bill_printer(self):
        with patch(f"{MOD}.frappe.get_doc", return_value=self._doc()), \
             patch(f"{MOD}._bill_printers", return_value=[]):
            with self.assertRaises(frappe.ValidationError):
                invoice_browser.print_invoice("INV-T", channel="printer")

    def test_a_reprint_is_logged_as_a_reprint(self):
        with patch(f"{MOD}.frappe.get_doc", return_value=self._doc(invoice_printed=1)), \
             patch(f"{MOD}.frappe.db.set_value") as set_value, \
             patch(f"{MOD}.log_activity") as log:
            invoice_browser.print_invoice("INV-T")
        set_value.assert_not_called()
        self.assertIn("reprinted", log.call_args.args[1].lower())

    def test_a_first_print_marks_the_bill_printed(self):
        with patch(f"{MOD}.frappe.get_doc", return_value=self._doc(invoice_printed=0)), \
             patch(f"{MOD}.frappe.db.set_value") as set_value, \
             patch(f"{MOD}.log_activity"):
            invoice_browser.print_invoice("INV-T")
        set_value.assert_called_once()


class TestOrderActivity(FrappeTestCase):

    def _invoice(self, items, new=False):
        # A plain object: on a frappe._dict, `.items` is the dict method.
        return SimpleNamespace(
            name="INV-T",
            restaurant_table="T1",
            order_type="Dine In",
            items=[frappe._dict(item_code=c, item_name=n, qty=q) for c, n, q in items],
        )

    @patch("ury.ury.api.invoice_activity.log_activity")
    def test_a_new_order_lists_what_was_ordered(self, log):
        _log_order_activity(self._invoice([("TK", "Tikka", 2)]), [], True)
        self.assertIn("Tikka ×2", log.call_args.args[1])

    @patch("ury.ury.api.invoice_activity.log_activity")
    def test_an_update_logs_only_the_difference(self, log):
        past = [{"item_code": "TK", "item_name": "Tikka", "qty": 2}]
        _log_order_activity(self._invoice([("TK", "Tikka", 3), ("TEA", "Tea", 1)]), past, False)
        text = log.call_args.args[1]
        self.assertIn("Tikka ×1", text)
        self.assertIn("Tea ×1", text)

    @patch("ury.ury.api.invoice_activity.log_activity")
    def test_an_unchanged_order_logs_nothing(self, log):
        past = [{"item_code": "TK", "item_name": "Tikka", "qty": 2}]
        _log_order_activity(self._invoice([("TK", "Tikka", 2)]), past, False)
        log.assert_not_called()

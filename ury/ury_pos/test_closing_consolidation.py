"""Whole-till POS consolidation regressions; no site or database is required."""

import importlib
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import frappe

from ury import hooks
from ury.ury.hooks import ury_pos_closing_entry as closing
from ury.ury_pos import api


class ClosingDocument(frappe._dict):
    def set(self, field, value):
        self[field] = [frappe._dict(row) for row in value]

    def append(self, field, value):
        row = frappe._dict(value)
        self[field].append(row)
        return row


class TestClosingConsolidation(unittest.TestCase):
    def setUp(self):
        self.frappe = self.enterContext(patch.object(closing, "frappe"))
        self.enterContext(patch.object(api, "frappe", self.frappe))
        self.frappe.session.user = "cashier"
        self.frappe.utils.get_datetime.side_effect = frappe.utils.get_datetime
        self.frappe.utils.get_time.side_effect = frappe.utils.get_time
        self.frappe.throw.side_effect = self._throw
        self.invoice_type = "POS Invoice"
        self.frappe.db.get_single_value.side_effect = self._get_setting
        self.frappe.db.get_value.side_effect = self._get_opening_value
        self.frappe.get_all.side_effect = self._get_all
        self.frappe.get_list.side_effect = self._get_list
        self.invoices = []
        self.hidden_invoices = set()
        self.start = "2026-10-01 08:00:00"
        self.end = "2026-10-01 18:00:00"
        self.doc = ClosingDocument(
            pos_profile="Till", user="cashier", owner="cashier",
            pos_opening_entry="OPEN-1", period_start_date=self.start,
            period_end_date=self.end, pos_invoices=[], taxes=[],
            grand_total=999, net_total=999, total_quantity=999,
            total_taxes_and_charges=999, invoice_type="POS Invoice",
        )
        self.get_taxes = self.enterContext(patch(
            "erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_taxes",
            return_value=[frappe._dict(account_head="VAT", tax_amount=2700)],
        ))
        self.consolidate = self.enterContext(patch(
            "erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log.consolidate_pos_invoices"
        ))
        self.native_consolidate = self.enterContext(patch(
            "erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.consolidate_pos_invoices"
        ))

    @staticmethod
    def _throw(message, exception=frappe.ValidationError, **kwargs):
        raise exception(message)

    def _get_setting(self, doctype, field):
        self.assertEqual((doctype, field), ("POS Settings", "invoice_type"))
        return self.invoice_type

    def _get_opening_value(self, doctype, name, field):
        self.assertEqual((doctype, name, field),
                         ("POS Opening Entry", "OPEN-1", "period_start_date"))
        return self.start

    @staticmethod
    def _matches(row, field, condition):
        value = row.get(field)
        if isinstance(condition, (list, tuple)):
            operator, operand = condition
            if operator == "between":
                return operand[0] <= value <= operand[1]
            if operator == "is":
                assert operand == "not set", operand
                return not value
            assert operator == "=", operator
            return value == operand
        return value == condition

    def _rows(self, doctype, *, filters, fields, order_by="", limit_page_length=20):
        self.assertEqual(doctype, "POS Invoice")
        rows = [row for row in self.invoices if all(
            self._matches(row, field, condition) for field, condition in filters.items()
        )]
        for clause in reversed(order_by.split(",") if order_by else []):
            field, direction = clause.split()
            rows.sort(key=lambda row: row[field], reverse=direction == "desc")
        if limit_page_length:
            rows = rows[:limit_page_length]
        return [frappe._dict({field: row[field] for field in fields}) for row in rows]

    def _get_all(self, doctype, **kwargs):
        return self._rows(doctype, **kwargs)

    def _get_list(self, doctype, **kwargs):
        return [row for row in self._rows(doctype, **kwargs)
                if row.name not in self.hidden_invoices]

    def _invoice(self, name, *, stamp="2026-10-01 12:00:00", **values):
        timestamp = datetime.fromisoformat(stamp)
        row = frappe._dict(
            name=name, pos_profile="Till", owner="waiter", cashier="other-cashier",
            docstatus=1, consolidated_invoice=None, posting_date=timestamp.date(),
            posting_time=timedelta(hours=timestamp.hour, minutes=timestamp.minute,
                                   seconds=timestamp.second, microseconds=timestamp.microsecond),
            customer="Guest", grand_total=17700, net_total=15000, total_qty=2,
            total_taxes_and_charges=2700, is_return=0, return_against=None,
        )
        row.update(values)
        self.invoices.append(row)
        return row

    def _event(self, event):
        # Missing registrations mean the lifecycle does nothing, reproducing
        # empty closing rows rather than failing with an import/attribute error.
        handlers = hooks.doc_events["POS Closing Entry"].get(event, [])
        if isinstance(handlers, str):
            handlers = [handlers]
        for handler in handlers:
            module, name = handler.rsplit(".", 1)
            getattr(importlib.import_module(module), name)(self.doc, event)

    def _submit(self):
        self._event("before_validate")
        self._event("before_submit")

    def _names(self):
        return [row.pos_invoice for row in self.doc.pos_invoices]

    def test_waiter_owned_invoices_have_every_native_reference_field(self):
        invoice = self._invoice("WAITER-BILL")
        self._submit()
        self.assertEqual(self.doc.pos_invoices, [{
            "pos_invoice": "WAITER-BILL", "posting_date": invoice.posting_date,
            "customer": "Guest", "grand_total": 17700, "is_return": 0,
            "return_against": None,
        }])
        self.assertEqual((invoice.owner, self.doc.user), ("waiter", "cashier"))

    def test_excludes_other_profiles_consolidated_drafts_and_cancelled(self):
        self._invoice("VALID", consolidated_invoice="")
        self._invoice("OTHER-TILL", pos_profile="Other", stamp="2026-10-02 12:00:00")
        self._invoice("CONSOLIDATED", consolidated_invoice="SINV-1", stamp="2026-09-30 12:00:00")
        self._invoice("DRAFT", docstatus=0, stamp="2026-10-02 12:00:00")
        self._invoice("CANCELLED", docstatus=2, stamp="2026-09-30 12:00:00")
        self._submit()
        self.assertEqual(self._names(), ["VALID"])
        self.frappe.get_all.assert_called_once()
        query = self.frappe.get_all.call_args.kwargs
        self.assertEqual(query["filters"], {
            "docstatus": 1, "pos_profile": "Till",
            "consolidated_invoice": ["is", "not set"],
        })
        self.assertEqual(query["limit_page_length"], 0)

    def test_window_start_is_linked_opening_not_tampered_client_value(self):
        self._invoice("EARLY-SHIFT", stamp="2026-10-01 09:00:00")
        for start in ("2026-09-30 00:00:00", "2026-10-01 17:00:00"):
            with self.subTest(start=start):
                self.doc.period_start_date = start
                self._submit()
                self.assertEqual(self._names(), ["EARLY-SHIFT"])

    def test_inclusive_window_boundaries_and_chronological_order(self):
        self._invoice("END", stamp=self.end)
        self._invoice("START", stamp=self.start)
        self._submit()
        self.assertEqual(self._names(), ["START", "END"])

    def test_late_invoice_blocks_submit_including_next_day_and_microseconds(self):
        for stamp in ("2026-10-01 18:00:00.000001", "2026-10-02 12:00:00"):
            with self.subTest(stamp=stamp):
                self.invoices = []
                self._invoice("LATE", stamp=stamp)
                with self.assertRaisesRegex(frappe.ValidationError, r"\[URY-CLOSE-LATE-INVOICE\]"):
                    self._submit()
                self.assertEqual(self.doc.pos_invoices, [])
        self.get_taxes.assert_not_called()
        self.consolidate.assert_not_called()

    def test_orphan_invoice_blocks_submit_even_if_client_start_is_earlier(self):
        self.doc.period_start_date = "2026-09-01 00:00:00"
        for stamp in ("2026-10-01 07:59:59.999999", "2026-09-30 12:00:00"):
            with self.subTest(stamp=stamp):
                self.invoices = []
                self._invoice("ORPHAN", stamp=stamp)
                with self.assertRaisesRegex(frappe.ValidationError, r"\[URY-CLOSE-ORPHAN-INVOICE\]"):
                    self._submit()
                self.assertEqual(self.doc.pos_invoices, [])
        self.get_taxes.assert_not_called()

    def test_unreadable_invoice_blocks_instead_of_closing_a_partial_till(self):
        self._invoice("VISIBLE")
        self._invoice("HIDDEN")
        self.hidden_invoices.add("HIDDEN")
        with self.assertRaisesRegex(frappe.ValidationError, r"\[URY-CLOSE-UNREADABLE-INVOICE\]"):
            self._submit()
        self.assertEqual(self.doc.pos_invoices, [])
        self.get_taxes.assert_not_called()
        self.consolidate.assert_not_called()

    def test_invoice_list_permission_failure_is_not_bypassed(self):
        self._invoice("SECRET")
        self.frappe.get_list.side_effect = frappe.PermissionError("No invoice list permission")
        with self.assertRaises(frappe.PermissionError):
            self._submit()
        self.assertEqual(self.doc.pos_invoices, [])
        self.get_taxes.assert_not_called()

    def test_before_validate_clears_partial_desk_and_amended_rows(self):
        for amended_from in (None, "CANCELLED-CLOSE"):
            with self.subTest(amended_from=amended_from):
                self.doc.amended_from = amended_from
                self.doc.pos_invoices = [frappe._dict(pos_invoice="STALE-DESK-ROW")]
                self._event("before_validate")
                self.assertEqual(self.doc.pos_invoices, [])
        self.frappe.get_all.assert_not_called()
        self.frappe.get_list.assert_not_called()

    def test_before_submit_replaces_any_client_supplied_rows(self):
        self._invoice("WHOLE-TILL")
        self.doc.pos_invoices = [frappe._dict(pos_invoice="CLIENT-ROW")]
        self._event("before_submit")
        self.assertEqual(self._names(), ["WHOLE-TILL"])

    def test_pos_settings_not_client_invoice_type_controls_consolidation(self):
        self.doc.invoice_type = "Sales Invoice"
        self._invoice("POS-BILL")
        self._submit()
        self.assertEqual(self._names(), ["POS-BILL"])

    def test_before_validate_is_noop_in_sales_invoice_mode(self):
        self.invoice_type = "Sales Invoice"
        self.doc.pos_invoices = [frappe._dict(pos_invoice="UNCHANGED")]
        original = dict(self.doc)
        self._event("before_validate")
        self.assertEqual(dict(self.doc), original)
        self.frappe.get_all.assert_not_called()
        self.frappe.get_list.assert_not_called()
        self.frappe.db.get_value.assert_not_called()

    def test_before_submit_is_noop_in_sales_invoice_mode(self):
        self.invoice_type = "Sales Invoice"
        self._invoice("LATE", stamp="2026-10-02 12:00:00")
        original = dict(self.doc)
        self._event("before_submit")
        self.assertEqual(dict(self.doc), original)
        self.frappe.get_all.assert_not_called()
        self.frappe.get_list.assert_not_called()
        self.frappe.db.get_value.assert_not_called()
        self.get_taxes.assert_not_called()

    def test_recomputes_all_totals_and_uses_native_tax_aggregation(self):
        self._invoice("ONE")
        self._invoice("TWO", grand_total=11800, net_total=10000,
                      total_qty=3, total_taxes_and_charges=1800)
        self.get_taxes.return_value = [frappe._dict(account_head="VAT", tax_amount=4500)]
        self.doc.taxes = [frappe._dict(account_head="CLIENT-TAX", tax_amount=999)]
        self._submit()
        self.assertEqual((self.doc.grand_total, self.doc.net_total,
                          self.doc.total_quantity, self.doc.total_taxes_and_charges),
                         (29500, 25000, 5, 4500))
        self.assertEqual(self.doc.taxes, [{"account_head": "VAT", "amount": 4500}])
        self.get_taxes.assert_called_once()
        self.assertEqual([row.name for row in self.get_taxes.call_args.args[0]], ["ONE", "TWO"])

    def test_return_and_original_are_both_included_with_signed_totals(self):
        self._invoice("SALE")
        self._invoice("RETURN", is_return=1, return_against="SALE",
                      grand_total=-5900, net_total=-5000, total_qty=-1,
                      total_taxes_and_charges=-900)
        self.get_taxes.return_value = [frappe._dict(account_head="VAT", tax_amount=1800)]
        self._submit()
        self.assertEqual(self._names(), ["SALE", "RETURN"])
        self.assertEqual([(row.is_return, row.return_against) for row in self.doc.pos_invoices],
                         [(0, None), (1, "SALE")])
        self.assertEqual((self.doc.grand_total, self.doc.net_total,
                          self.doc.total_quantity, self.doc.total_taxes_and_charges),
                         (11800, 10000, 1, 1800))
        self.assertEqual(self.doc.taxes, [{"account_head": "VAT", "amount": 1800}])

    def test_ten_invoices_make_ten_rows_without_calling_native_consolidation(self):
        for index in range(10):
            self._invoice(f"BILL-{index}")
        self._submit()
        self.assertEqual(self._names(), [f"BILL-{index}" for index in range(10)])
        self.consolidate.assert_not_called()
        self.native_consolidate.assert_not_called()

    def test_empty_till_resets_stale_totals_and_taxes(self):
        self.get_taxes.return_value = []
        self.doc.taxes = [frappe._dict(account_head="OLD", tax_amount=999)]
        self._submit()
        self.assertEqual(self.doc.pos_invoices, [])
        self.assertEqual(self.doc.taxes, [])
        self.assertEqual((self.doc.grand_total, self.doc.net_total,
                          self.doc.total_quantity, self.doc.total_taxes_and_charges), (0, 0, 0, 0))

    def test_shared_selection_returns_reference_and_total_fields(self):
        for name, stamp in (
            ("BEFORE", "2026-10-01 07:59:59"), ("START", self.start),
            ("END", self.end), ("AFTER", "2026-10-01 18:00:00.000001"),
        ):
            self._invoice(name, stamp=stamp)
        helper = getattr(api, "_till_invoice_rows", None)
        self.assertTrue(callable(helper), "Missing shared till invoice selection")
        rows = helper("Till", self.start, self.end, self.frappe.get_list)
        self.assertEqual([row.name for row in rows], ["START", "END"])
        self.assertEqual(set(rows[0]), {
            "name", "posting_date", "posting_time", "customer", "grand_total",
            "net_total", "total_qty", "total_taxes_and_charges", "is_return", "return_against",
        })
        self.frappe.get_all.assert_not_called()
        self.frappe.get_doc.assert_not_called()

    def test_registers_new_events_without_replacing_existing_closing_hooks(self):
        events = hooks.doc_events["POS Closing Entry"]
        for event in ("before_validate", "before_submit", "before_save", "validate"):
            with self.subTest(event=event):
                self.assertEqual(events.get(event), f"ury.ury.hooks.ury_pos_closing_entry.{event}")


if __name__ == "__main__":
    unittest.main()

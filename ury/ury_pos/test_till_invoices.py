"""Main till-close regressions; no Frappe site or database is required."""

import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from ury.ury_pos import api


class TestTillInvoices(unittest.TestCase):
    def setUp(self):
        self.frappe = self.enterContext(patch("ury.ury_pos.api.frappe"))
        self.enterContext(patch("ury.ury_pos.api._", side_effect=lambda message: message))
        self.frappe.session.user = "cashier2"
        self.frappe.get_roles.return_value = []
        self.frappe.PermissionError = frappe.PermissionError
        self.frappe.throw.side_effect = self._throw
        self.frappe.utils.get_datetime.side_effect = frappe.utils.get_datetime
        self.frappe.utils.get_time.side_effect = frappe.utils.get_time
        self.frappe.get_list.side_effect = self._get_list
        self.frappe.get_doc.side_effect = self._get_doc
        self.frappe.get_all.side_effect = AssertionError("Till reads must use get_list")
        self.openings = [frappe._dict(
            name="OPEN-2", user="cashier2", owner="manager", pos_profile="Till",
            status="Open", docstatus=1, period_start_date="2026-10-01 08:00:00",
        )]
        self.invoices = []
        self.hidden_invoices = set()
        self.start = "2026-10-01 08:00:00"
        self.end = "2026-10-01 18:00:00"
        self.user = "cashier2"

    @staticmethod
    def _throw(message, exception):
        raise exception(message)

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

    def _get_list(self, doctype, *, filters, fields, order_by="", limit_page_length=20, or_filters=None):
        self.assertIn(doctype, {"POS Opening Entry", "POS Invoice"})
        source = self.openings if doctype == "POS Opening Entry" else self.invoices
        rows = [row for row in source if all(
            self._matches(row, field, value) for field, value in filters.items()
        )]
        if doctype == "POS Invoice":
            rows = [row for row in rows if row.name not in self.hidden_invoices]
        if or_filters:
            rows = [row for row in rows if any(
                self._matches(row, field, [op, value]) for field, op, value in or_filters
            )]
        for clause in reversed(order_by.split(",") if order_by else []):
            field, direction = clause.split()
            rows.sort(key=lambda row: row[field], reverse=direction == "desc")
        if limit_page_length:
            rows = rows[:limit_page_length]
        return [frappe._dict({field: row[field] for field in fields}) for row in rows]

    def _get_doc(self, doctype, name):
        self.assertEqual(doctype, "POS Invoice")
        row = next(row for row in self.invoices if row.name == name)
        return SimpleNamespace(as_dict=lambda: dict(row))

    def _invoice(self, name, *, stamp="2026-10-01 12:00:00", cashier="cashier1", **values):
        timestamp = datetime.fromisoformat(stamp)
        row = frappe._dict(
            name=name, pos_profile="Till", cashier=cashier, owner="waiter", docstatus=1,
            posting_date=timestamp.date(),
            posting_time=timedelta(hours=timestamp.hour, minutes=timestamp.minute,
                                   seconds=timestamp.second, microseconds=timestamp.microsecond),
            consolidated_invoice=None, grand_total=15000, net_total=15000, total_qty=1,
            change_amount=0, account_for_change_amount="Cash",
            payments=[{"mode_of_payment": "Cash", "amount": 15000}],
            taxes=[], items=[{"item_code": "Lunch", "qty": 1}],
        )
        row.update(values)
        self.invoices.append(row)
        return row

    def _read(self):
        method = getattr(api, "get_till_invoices", None)
        self.assertTrue(callable(method), "URY must provide get_till_invoices for ERPNext v16 till close")
        return method(start=self.start, end=self.end, pos_profile="Till", user=self.user)

    def _assert_no_invoice_reads(self):
        self.assertFalse(any(call.args[0] == "POS Invoice" for call in self.frappe.get_list.call_args_list))
        self.frappe.get_doc.assert_not_called()

    def test_holder_counts_other_cashiers_and_guest_bills(self):
        self._invoice("ROW-1", cashier="cashier1")
        self._invoice("HOLDER", cashier="cashier2")
        self._invoice("OTHER", cashier="cashier3")
        self._invoice("GUEST", cashier=None)
        self.assertEqual([row["name"] for row in self._read()], ["ROW-1", "HOLDER", "OTHER", "GUEST"])

    def test_other_cashier_cannot_impersonate_holder(self):
        self.frappe.session.user = "cashier1"
        self._invoice("SECRET")
        with self.assertRaises(frappe.PermissionError):
            self._read()
        self._assert_no_invoice_reads()

    def test_self_named_non_holder_is_denied(self):
        self.frappe.session.user = self.user = "cashier1"
        with self.assertRaises(frappe.PermissionError):
            self._read()
        self._assert_no_invoice_reads()

    def test_managers_can_count_the_holders_till(self):
        self.frappe.session.user = "manager"
        self._invoice("ROW-1")
        for role in ("URY Manager", "System Manager"):
            with self.subTest(role=role):
                self.frappe.get_roles.return_value = [role]
                self.assertEqual([row["name"] for row in self._read()], ["ROW-1"])

    def test_other_roles_do_not_grant_till_authority(self):
        self.frappe.session.user = "other"
        self.frappe.get_roles.return_value = ["URY Cashier", "Sales Manager"]
        with self.assertRaises(frappe.PermissionError):
            self._read()
        self._assert_no_invoice_reads()

    def test_missing_opening_is_denied_even_for_manager(self):
        self.frappe.session.user = "manager"
        self.frappe.get_roles.return_value = ["URY Manager"]
        self.openings = []
        with self.assertRaises(frappe.PermissionError):
            self._read()
        self._assert_no_invoice_reads()

    def test_opening_must_be_submitted_open_and_match_profile_and_user(self):
        for field, value in (("docstatus", 0), ("docstatus", 2), ("status", "Closed"),
                             ("pos_profile", "Other Till"), ("user", "cashier1")):
            with self.subTest(field=field, value=value):
                previous = self.openings[0][field]
                self.openings[0][field] = value
                try:
                    with self.assertRaises(frappe.PermissionError):
                        self._read()
                    self._assert_no_invoice_reads()
                finally:
                    self.openings[0][field] = previous

    def test_only_submitted_unconsolidated_invoices_on_this_profile_are_counted(self):
        self._invoice("VALID", consolidated_invoice="")
        self._invoice("OTHER-TILL", pos_profile="Other Till")
        self._invoice("DRAFT", docstatus=0)
        self._invoice("CANCELLED", docstatus=2)
        self._invoice("CONSOLIDATED", consolidated_invoice="SINV-1")
        self.assertEqual([row["name"] for row in self._read()], ["VALID"])
        self.assertEqual([call.args[1] for call in self.frappe.get_doc.call_args_list], ["VALID"])

    def test_exact_period_boundaries_use_timedelta_posting_time(self):
        for name, stamp in (
            ("PREVIOUS-DAY", "2026-09-30 12:00:00"), ("BEFORE", "2026-10-01 07:59:59"),
            ("START", "2026-10-01 08:00:00"), ("END", "2026-10-01 18:00:00"),
            ("AFTER", "2026-10-01 18:00:00.000001"), ("NEXT-DAY", "2026-10-02 12:00:00"),
        ):
            self._invoice(name, stamp=stamp)
        self.assertEqual([row["name"] for row in self._read()], ["START", "END"])
        self.assertEqual([call.args[1] for call in self.frappe.get_doc.call_args_list], ["START", "END"])

    def test_start_comes_from_opening_not_client(self):
        self._invoice("BEFORE", stamp="2026-10-01 07:59:59")
        self._invoice("SHIFT", stamp="2026-10-01 09:00:00")
        for start in ("2026-09-30 00:00:00", "2026-10-01 17:00:00"):
            with self.subTest(start=start):
                self.start = start
                self.assertEqual([row["name"] for row in self._read()], ["SHIFT"])

    def test_full_v15_documents_are_sorted_across_dates(self):
        self.end = "2026-10-02 18:00:00"
        self._invoice("LATE", stamp="2026-10-02 09:00:00")
        self._invoice("EARLY", stamp="2026-10-01 17:00:00")
        self._invoice("FIRST", stamp="2026-10-01 09:00:00")
        rows = self._read()
        self.assertEqual([row["name"] for row in rows], ["FIRST", "EARLY", "LATE"])
        self.assertEqual(rows[0]["payments"], [{"mode_of_payment": "Cash", "amount": 15000}])
        self.assertEqual(rows[0]["items"], [{"item_code": "Lunch", "qty": 1}])
        self.assertEqual(rows[0]["grand_total"], 15000)
        self.assertEqual(rows[0]["owner"], "waiter")
        self.assertEqual(rows[0]["taxes"], [])

    def test_caller_invoice_list_permissions_are_preserved(self):
        self._invoice("VISIBLE")
        self._invoice("HIDDEN")
        self.hidden_invoices.add("HIDDEN")
        self.assertEqual([row["name"] for row in self._read()], ["VISIBLE"])
        self.assertEqual([call.args[1] for call in self.frappe.get_doc.call_args_list], ["VISIBLE"])

    def test_list_permission_failure_propagates_without_document_reads(self):
        self.frappe.get_list.side_effect = frappe.PermissionError("No list permission")
        with self.assertRaises(frappe.PermissionError):
            self._read()
        self.frappe.get_doc.assert_not_called()

    def test_invoice_list_permission_failure_is_not_bypassed(self):
        def get_list(doctype, **kwargs):
            if doctype == "POS Invoice":
                raise frappe.PermissionError("No invoice permission")
            return self._get_list(doctype, **kwargs)

        self.frappe.get_list.side_effect = get_list
        with self.assertRaises(frappe.PermissionError):
            self._read()
        self.frappe.get_doc.assert_not_called()

    def test_all_bills_are_counted_without_default_list_pagination(self):
        for index in range(25):
            self._invoice(f"BILL-{index}")
        self.assertEqual(len(self._read()), 25)

    def test_empty_till_returns_an_empty_list(self):
        self.assertEqual(self._read(), [])


if __name__ == "__main__":
    unittest.main()

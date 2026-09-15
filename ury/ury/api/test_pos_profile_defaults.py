# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Track Item 13 tests: POS Profile write-off default resolution.

Static/unit tests using mocks, following this repo's existing
FrappeTestCase + mock pattern (see test_ury_feature_flags.py) so they run
under `bench run-tests` in a real environment, while still being reasoned
about without a live bench/site.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.pos_profile_defaults import resolve_write_off_defaults


def _company_doc(**attrs):
    doc = MagicMock()
    doc.name = attrs.get("name", "Test Company")
    doc.write_off_account = attrs.get("write_off_account")
    doc.cost_center = attrs.get("cost_center")
    doc.default_expense_account = attrs.get("default_expense_account")
    return doc


class TestResolveWriteOffDefaults(FrappeTestCase):
    def test_requires_company(self):
        with self.assertRaises(frappe.ValidationError):
            resolve_write_off_defaults(None)

    def test_unknown_company_throws(self):
        with patch("frappe.db.exists", return_value=False):
            with self.assertRaises(frappe.ValidationError):
                resolve_write_off_defaults("Nonexistent Co")

    def test_uses_company_write_off_account_when_set(self):
        doc = _company_doc(write_off_account="Write Off - TC", cost_center="Main - TC")
        with patch("frappe.db.exists", return_value=True), \
             patch("frappe.get_doc", return_value=doc), \
             patch("frappe.db.get_value", return_value=None):
            result = resolve_write_off_defaults("Test Company")
        self.assertEqual(result["write_off_account"], "Write Off - TC")
        self.assertEqual(result["write_off_cost_center"], "Main - TC")

    def test_falls_back_to_write_off_type_account(self):
        doc = _company_doc()

        def fake_get_value(doctype, filters, fieldname):
            if doctype == "Account" and filters.get("account_type") == "Write Off":
                return "Write Off Account - TC"
            if doctype == "Account" and filters.get("account_type") == "Expense Account":
                return "Expense - TC"
            if doctype == "Cost Center":
                return "Main - TC"
            return None

        with patch("frappe.db.exists", return_value=True), \
             patch("frappe.get_doc", return_value=doc), \
             patch("frappe.db.get_value", side_effect=fake_get_value):
            result = resolve_write_off_defaults("Test Company")
        self.assertEqual(result["write_off_account"], "Write Off Account - TC")
        self.assertEqual(result["write_off_cost_center"], "Main - TC")

    def test_falls_back_to_expense_account_when_no_write_off_account(self):
        doc = _company_doc()

        def fake_get_value(doctype, filters, fieldname):
            if doctype == "Account" and filters.get("account_type") == "Write Off":
                return None
            if doctype == "Account" and filters.get("account_type") == "Expense Account":
                return "Expense - TC"
            if doctype == "Cost Center":
                return None
            return None

        with patch("frappe.db.exists", return_value=True), \
             patch("frappe.get_doc", return_value=doc), \
             patch("frappe.db.get_value", side_effect=fake_get_value):
            result = resolve_write_off_defaults("Test Company")
        self.assertEqual(result["write_off_account"], "Expense - TC")
        self.assertIsNone(result["write_off_cost_center"])

    def test_returns_none_when_nothing_resolvable(self):
        doc = _company_doc()
        with patch("frappe.db.exists", return_value=True), \
             patch("frappe.get_doc", return_value=doc), \
             patch("frappe.db.get_value", return_value=None):
            result = resolve_write_off_defaults("Test Company")
        self.assertIsNone(result["write_off_account"])
        self.assertIsNone(result["write_off_cost_center"])

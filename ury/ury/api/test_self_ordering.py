# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Phase 3.8: customer-safe ordering API tests. These are unit tests against
# mocked frappe calls (matching the existing test_ury_order.py / test_api.py
# convention) rather than full integration tests against a live site —
# integration coverage (scan table -> order -> KOT -> order again -> same
# invoice updated -> incremental KOT) should be run against a provisioned
# bench as part of this track's acceptance criteria.

import base64
import hmac
import hashlib
import unittest
from unittest.mock import patch, MagicMock

import frappe

from ury.ury.api.self_ordering import (
    _verify_qr_token,
    _sign,
    add_customer_items,
    request_bill,
)


MOD = "ury.ury.api.self_ordering"


class TestQRTokenRoundtrip(unittest.TestCase):
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._get_profile_secret")
    def test_verify_qr_token_valid_table_token(self, mock_secret, mock_get_doc, mock_exists):
        secret = "test-secret"
        mock_secret.return_value = secret
        mock_exists.return_value = True

        profile_doc = MagicMock()
        profile_doc.enabled = 1
        profile_doc.enable_qr_table_ordering = 1
        mock_get_doc.return_value = profile_doc

        payload = "Profile A|Table 7"
        signature = _sign(payload, secret)
        raw = f"{payload}|{signature}"
        token = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

        profile, table, source = _verify_qr_token(token)
        self.assertEqual(profile, profile_doc)
        self.assertEqual(table, "Table 7")
        self.assertEqual(source, "QR Table")

    @patch(f"{MOD}._get_profile_secret")
    def test_verify_qr_token_bad_signature_rejected(self, mock_secret):
        mock_secret.return_value = "test-secret"
        payload = "Profile A|Table 7"
        raw = f"{payload}|deadbeef"
        token = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

        with self.assertRaises(frappe.PermissionError):
            _verify_qr_token(token)

    def test_verify_qr_token_malformed_rejected(self):
        with self.assertRaises(frappe.PermissionError):
            _verify_qr_token("not-a-valid-token")


class TestAddCustomerItemsAppendOnly(unittest.TestCase):
    """The core Phase 3 safety guarantee: add_customer_items() only ever
    appends new rows and re-derives price server-side — it must never trust
    a client-supplied rate/tax/cost-center, and must never replace existing
    invoice.items wholesale."""

    def _session_doc(self, table="Table 7", invoice=None, source="QR Table"):
        session = MagicMock()
        session.table = table
        session.invoice = invoice
        session.source = source
        session.device = None
        session.name = "SESSION-1"
        session.ordering_profile = "Profile A"
        return session

    @patch(f"{MOD}.kot_execute")
    @patch(f"{MOD}.price_items_for_invoice")
    @patch(f"{MOD}._resolve_or_create_pos_invoice")
    @patch(f"{MOD}.resolve_restaurant_menu")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}.frappe.set_user")
    def test_add_customer_items_appends_without_clearing_existing(
        self, mock_set_user, mock_db_get_value, mock_resolve_session, mock_get_doc,
        mock_resolve_menu, mock_resolve_invoice, mock_price_items, mock_kot,
    ):
        session = self._session_doc(invoice="POS-INV-100")
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enabled = 1
        profile.allow_add_to_running_table = 1
        profile.branch = "Branch A"
        profile.pos_profile = "POS Profile A"
        profile.default_customer = "Walk-in Customer"

        pos_profile_doc = MagicMock()
        pos_profile_doc.payments = [MagicMock(mode_of_payment="Cash")]

        def get_doc_side_effect(doctype, name=None):
            if doctype == "URY Self Ordering Profile":
                return profile
            if doctype == "POS Profile":
                return pos_profile_doc
            return MagicMock()

        mock_get_doc.side_effect = get_doc_side_effect

        mock_resolve_menu.return_value = {"items": [{"item": "Biryani"}, {"item": "Sandwich"}]}

        existing_row = MagicMock(item_code="Biryani", item_name="Biryani", qty=2)
        invoice = MagicMock()
        invoice.customer = "Walk-in Customer"
        invoice.items = [existing_row]
        invoice.invoice_created = 1
        invoice.invoice_printed = 0
        invoice.restaurant_table = "Table 7"
        invoice.branch = "Branch A"
        invoice.selling_price_list = "Standard Selling"
        invoice.grand_total = 300
        invoice.name = "POS-INV-100"
        mock_resolve_invoice.return_value = (invoice, "POS-INV-100")

        priced_sandwich = {"item_code": "Sandwich", "item_name": "Sandwich", "qty": 1, "comment": "",
                            "rate": 120, "price_list_rate": 120, "base_price_list_rate": 120, "cost_center": "CC"}
        mock_price_items.return_value = [priced_sandwich]

        mock_db_get_value.return_value = "Menu A"

        result = add_customer_items("session-token", [{"item": "Sandwich", "qty": 1}])

        # Existing rows were never cleared/replaced.
        self.assertIn(existing_row, invoice.items)
        # New row appended, not merged/overwritten.
        invoice.append.assert_any_call("items", priced_sandwich)
        # Server re-derives price via price_items_for_invoice — client qty/item
        # only, no client-supplied rate ever reaches invoice construction.
        mock_price_items.assert_called_once()
        called_items = mock_price_items.call_args[0][0]
        self.assertEqual(called_items, [{"item": "Sandwich", "item_name": "Sandwich", "qty": 1.0, "comment": ""}])
        # KOT still invoked (existing kitchen pipeline untouched).
        mock_kot.assert_called_once()
        invoice.save.assert_called_once_with(ignore_permissions=True)

    @patch(f"{MOD}._resolve_session")
    def test_add_customer_items_rejects_item_not_on_menu(self, mock_resolve_session):
        session = self._session_doc(invoice="POS-INV-100")
        mock_resolve_session.return_value = session

        with patch(f"{MOD}.frappe.get_doc") as mock_get_doc, \
             patch(f"{MOD}.resolve_restaurant_menu") as mock_resolve_menu, \
             patch(f"{MOD}.frappe.set_user"):
            profile = MagicMock()
            profile.enabled = 1
            profile.allow_add_to_running_table = 1
            profile.branch = "Branch A"
            mock_get_doc.return_value = profile
            mock_resolve_menu.return_value = {"items": [{"item": "Biryani"}]}

            with self.assertRaises(frappe.ValidationError):
                add_customer_items("session-token", [{"item": "Not On Menu", "qty": 1}])

    @patch(f"{MOD}._resolve_session")
    def test_add_customer_items_rejects_when_running_table_addition_disabled(self, mock_resolve_session):
        session = self._session_doc(invoice="POS-INV-100")
        mock_resolve_session.return_value = session

        with patch(f"{MOD}.frappe.get_doc") as mock_get_doc:
            profile = MagicMock()
            profile.enabled = 1
            profile.allow_add_to_running_table = 0
            mock_get_doc.return_value = profile

            with self.assertRaises(frappe.ValidationError):
                add_customer_items("session-token", [{"item": "Biryani", "qty": 1}])


class TestRequestBill(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_request_bill_creates_service_request(self, mock_set_user, mock_resolve_session, mock_exists, mock_get_doc):
        session = MagicMock()
        session.table = "Table 7"
        session.invoice = "POS-INV-100"
        session.name = "SESSION-1"
        session.ordering_profile = "Profile A"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_request_bill = 1

        req = MagicMock()
        req.name = "SR-001"

        def get_doc_side_effect(arg, name=None):
            if isinstance(arg, dict):
                return req
            return profile

        mock_get_doc.side_effect = get_doc_side_effect
        mock_exists.return_value = False

        result = request_bill("session-token")

        req.insert.assert_called_once_with(ignore_permissions=True)
        self.assertEqual(result["status"], "Requested")

    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_request_bill_idempotent_when_already_open(self, mock_set_user, mock_resolve_session, mock_get_doc, mock_exists):
        session = MagicMock()
        session.table = "Table 7"
        session.invoice = "POS-INV-100"
        session.name = "SESSION-1"
        session.ordering_profile = "Profile A"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_request_bill = 1
        mock_get_doc.return_value = profile
        mock_exists.return_value = "SR-EXISTING"

        result = request_bill("session-token")
        self.assertEqual(result["status"], "Already Requested")
        self.assertEqual(result["request"], "SR-EXISTING")

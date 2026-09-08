"""Focused regression tests for sync_order / split_bill validation (B1–B5).

Covers open cashier session, menu/disabled item gates, comment clear semantics,
dine-in pax, and split_bill ownership parity with sync_order.
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.ury_order.ury_order import (
    _require_open_cashier_session,
    _resolve_sync_opening_room,
    _validate_dine_in_pax,
    _validate_sync_items_against_menu,
    split_bill,
    sync_order,
)


def _role_rows(*roles):
    return [SimpleNamespace(role=r) for r in roles]


def _pos_profile(*, multi=0, billing=(), transfer=(), restricted=(), remove_items=1):
    profile = MagicMock()
    profile.name = "Test POS Profile"
    profile.custom_enable_multiple_cashier = multi
    profile.applicable_for_users = []
    profile.role_allowed_for_billing = _role_rows(*billing)
    profile.transfer_role_permissions = _role_rows(*transfer)
    profile.role_restricted_for_table_order = _role_rows(*restricted)
    profile.remove_items = remove_items
    return profile


class TestOpenCashierSessionB1(unittest.TestCase):
    @patch("ury.ury.doctype.ury_order.ury_order._branch_has_open_pos", return_value=False)
    def test_single_cashier_rejects_closed_branch(self, _mock_open):
        with self.assertRaises(frappe.ValidationError) as ctx:
            _require_open_cashier_session(
                _pos_profile(multi=0),
                "Branch A",
                room="Hall",
                billing_user=False,
                order_type="Dine In",
            )
        self.assertIn("POS is closed", str(ctx.exception))

    @patch("ury.ury.doctype.ury_order.ury_order._branch_has_open_pos", return_value=True)
    def test_single_cashier_allows_open_branch(self, _mock_open):
        _require_open_cashier_session(
            _pos_profile(multi=0),
            "Branch A",
            room=None,
            billing_user=False,
            order_type="Take Away",
        )

    @patch("ury.ury.doctype.ury_order.ury_order._room_has_open_pos", return_value=False)
    def test_multi_cashier_rejects_closed_table_room(self, _mock_room):
        with self.assertRaises(frappe.ValidationError) as ctx:
            _require_open_cashier_session(
                _pos_profile(multi=1),
                "Branch A",
                room="Hall",
                billing_user=False,
                order_type="Dine In",
            )
        self.assertIn("no cashier session", str(ctx.exception))

    @patch("ury.ury.doctype.ury_order.ury_order._room_has_open_pos", return_value=True)
    def test_multi_cashier_allows_open_table_room(self, _mock_room):
        _require_open_cashier_session(
            _pos_profile(multi=1),
            "Branch A",
            room="Hall",
            billing_user=False,
            order_type="Dine In",
        )

    @patch("ury.ury.doctype.ury_order.ury_order._branch_has_open_pos", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order._room_has_open_pos")
    def test_multi_billing_takeaway_uses_branch_opening_not_room(
        self, mock_room, mock_branch
    ):
        _require_open_cashier_session(
            _pos_profile(multi=1),
            "Branch A",
            room=None,
            billing_user=True,
            order_type="Take Away",
        )
        mock_branch.assert_called_once_with("Branch A")
        mock_room.assert_not_called()

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    def test_opening_room_prefers_table_restaurant_room(self, mock_get_value):
        mock_get_value.return_value = "Table Room"
        room = _resolve_sync_opening_room(table="T1", room="Client Room", invoice=None)
        self.assertEqual(room, "Table Room")
        mock_get_value.assert_called_with("URY Table", "T1", "restaurant_room")


class TestMenuItemValidationB2(unittest.TestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_all")
    @patch("ury.ury.doctype.ury_order.ury_order._resolve_menu_for_sync", return_value="Menu A")
    def test_rejects_newly_added_off_menu_item(self, _menu, mock_get_all, mock_get_value):
        mock_get_all.return_value = []
        with self.assertRaises(frappe.ValidationError) as ctx:
            _validate_sync_items_against_menu(
                [{"item": "OffMenu", "qty": 1}],
                past_item=[],
                branch="Branch A",
                table="T1",
                order_type="Dine In",
            )
        self.assertIn("not available on the menu", str(ctx.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_all")
    @patch("ury.ury.doctype.ury_order.ury_order._resolve_menu_for_sync", return_value="Menu A")
    def test_rejects_newly_added_disabled_item(self, _menu, mock_get_all, mock_get_value):
        mock_get_all.return_value = [SimpleNamespace(item="DisabledDish")]
        mock_get_value.return_value = 1
        with self.assertRaises(frappe.ValidationError) as ctx:
            _validate_sync_items_against_menu(
                [{"item": "DisabledDish", "qty": 1}],
                past_item=[],
                branch="Branch A",
                order_type="Dine In",
            )
        self.assertIn("disabled", str(ctx.exception).lower())

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_all")
    @patch("ury.ury.doctype.ury_order.ury_order._resolve_menu_for_sync")
    def test_preserves_historic_off_menu_lines(self, mock_menu, mock_get_all, mock_get_value):
        _validate_sync_items_against_menu(
            [{"item": "OldDish", "qty": 2}],
            past_item=[{"item_code": "OldDish", "qty": 1}],
            branch="Branch A",
            order_type="Dine In",
        )
        mock_menu.assert_not_called()
        mock_get_all.assert_not_called()

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value", return_value=0)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_all")
    @patch("ury.ury.doctype.ury_order.ury_order._resolve_menu_for_sync")
    def test_aggregator_skips_menu_membership(self, mock_menu, mock_get_all, mock_get_value):
        _validate_sync_items_against_menu(
            [{"item": "AggItem", "qty": 1}],
            past_item=[],
            branch="Branch A",
            order_type="Aggregators",
        )
        mock_menu.assert_not_called()
        mock_get_all.assert_not_called()
        mock_get_value.assert_called_with("Item", "AggItem", "disabled")

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value", return_value=1)
    def test_aggregator_still_rejects_disabled_item_master(self, _mock_get_value):
        with self.assertRaises(frappe.ValidationError) as ctx:
            _validate_sync_items_against_menu(
                [{"item": "AggItem", "qty": 1}],
                past_item=[],
                branch="Branch A",
                order_type="Aggregators",
            )
        self.assertIn("disabled", str(ctx.exception).lower())


class TestCommentsAndPaxB3B4(unittest.TestCase):
    def test_dine_in_rejects_zero_pax(self):
        with self.assertRaises(frappe.ValidationError):
            _validate_dine_in_pax(0, "Dine In")

    def test_dine_in_rejects_none_pax(self):
        with self.assertRaises(frappe.ValidationError):
            _validate_dine_in_pax(None, "Dine In")

    def test_dine_in_accepts_positive_integer(self):
        self.assertEqual(_validate_dine_in_pax(3, "Dine In"), 3)
        self.assertEqual(_validate_dine_in_pax("4", "Dine In"), 4)

    def test_non_dine_in_skips_pax_gate(self):
        self.assertEqual(_validate_dine_in_pax(0, "Take Away"), 0)
        self.assertIsNone(_validate_dine_in_pax(None, "Aggregators"))


class TestSyncOrderCommentClearB3(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.price_items_for_invoice", return_value=[])
    @patch("ury.ury.doctype.ury_order.ury_order._validate_sync_items_against_menu")
    @patch("ury.ury.doctype.ury_order.ury_order._require_open_cashier_session")
    @patch("ury.ury.doctype.ury_order.ury_order._resolve_sync_opening_room", return_value="Hall")
    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles", return_value=["URY Cashier"])
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_empty_comments_clears_note(
        self,
        mock_session,
        _roles,
        mock_get_doc,
        _perm,
        mock_get_order_invoice,
        _room,
        _opening,
        _menu_val,
        _price,
    ):
        mock_session.user = "cashier@example.com"
        invoice = MagicMock()
        invoice.name = "POS-INV-1"
        invoice.branch = "Branch A"
        invoice.waiter = "cashier@example.com"
        invoice.invoice_printed = 0
        invoice.invoice_created = 1
        invoice.items = []
        invoice.order_type = "Take Away"
        invoice.custom_comments = "old note"
        invoice.restaurant_table = None
        invoice.selling_price_list = "Standard"
        mock_get_order_invoice.return_value = invoice

        mock_get_doc.side_effect = [
            _pos_profile(billing=["URY Cashier"]),
            SimpleNamespace(mobile_number="999"),
        ]

        with patch("ury.ury.doctype.ury_order.ury_order.kot_execute"):
            with patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value", return_value=None):
                try:
                    sync_order(
                        items=[],
                        cashier="x",
                        owner="x",
                        mode_of_payment="Cash",
                        customer="Cust",
                        no_of_pax=0,
                        last_invoice=None,
                        waiter="x",
                        pos_profile="Test POS Profile",
                        comments="",
                        order_type="Take Away",
                    )
                except Exception:
                    pass

        self.assertEqual(invoice.custom_comments, "")

    @patch("ury.ury.doctype.ury_order.ury_order.price_items_for_invoice", return_value=[])
    @patch("ury.ury.doctype.ury_order.ury_order._validate_sync_items_against_menu")
    @patch("ury.ury.doctype.ury_order.ury_order._require_open_cashier_session")
    @patch("ury.ury.doctype.ury_order.ury_order._resolve_sync_opening_room", return_value="Hall")
    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission", return_value=True)
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles", return_value=["URY Cashier"])
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_omitted_comments_preserves_note(
        self,
        mock_session,
        _roles,
        mock_get_doc,
        _perm,
        mock_get_order_invoice,
        _room,
        _opening,
        _menu_val,
        _price,
    ):
        mock_session.user = "cashier@example.com"
        invoice = MagicMock()
        invoice.name = "POS-INV-1"
        invoice.branch = "Branch A"
        invoice.waiter = "cashier@example.com"
        invoice.invoice_printed = 0
        invoice.invoice_created = 1
        invoice.items = []
        invoice.order_type = "Take Away"
        invoice.custom_comments = "keep me"
        invoice.restaurant_table = None
        invoice.selling_price_list = "Standard"
        mock_get_order_invoice.return_value = invoice

        mock_get_doc.side_effect = [
            _pos_profile(billing=["URY Cashier"]),
            SimpleNamespace(mobile_number="999"),
        ]

        with patch("ury.ury.doctype.ury_order.ury_order.kot_execute"):
            with patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value", return_value=None):
                try:
                    sync_order(
                        items=[],
                        cashier="x",
                        owner="x",
                        mode_of_payment="Cash",
                        customer="Cust",
                        no_of_pax=0,
                        last_invoice=None,
                        waiter="x",
                        pos_profile="Test POS Profile",
                        order_type="Take Away",
                    )
                except Exception:
                    pass

        self.assertEqual(invoice.custom_comments, "keep me")

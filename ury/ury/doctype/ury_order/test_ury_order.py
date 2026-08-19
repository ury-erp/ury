# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import unittest
import json
import frappe
from types import SimpleNamespace
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury.doctype.ury_order.ury_order import sync_order, price_items_for_invoice

from unittest.mock import patch, MagicMock
from ury.ury.doctype.ury_order.ury_order import get_order_invoice
from ury.ury.doctype.ury_order.ury_order import get_table_order_context, get_captain_context
from ury.ury.doctype.ury_order.ury_order import table_transfer, captain_transfer

class TestURYOrderSEC11(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_all")
    def test_get_order_invoice_unauthorized(self, mock_get_all, mock_get_value, mock_get_doc, mock_has_permission, mock_getBranch):
        mock_invoice = MagicMock()
        mock_invoice.branch = "Test Branch"
        mock_get_doc.return_value = mock_invoice
        mock_get_value.return_value = "POS-INV-001"
        
        # When table is not passed, but invoiceNo is passed
        mock_has_permission.return_value = False
        with self.assertRaises(frappe.PermissionError) as context:
            get_order_invoice(invoiceNo="POS-INV-001")
        self.assertIn("Not permitted to view this order", str(context.exception))
        
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Other Branch"
        with self.assertRaises(frappe.PermissionError) as context:
            get_order_invoice(invoiceNo="POS-INV-001")
        self.assertIn("outside your active branch", str(context.exception))
class TestURYOrder(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_sync_order_authorized(self, mock_session, mock_get_roles, mock_get_doc, mock_get_value, mock_has_permission, mock_get_order_invoice):
        # Setup mock invoice
        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-001"
        mock_invoice.branch = "Test Branch"
        mock_invoice.restaurant_table = "Table 1"
        mock_invoice.invoice_printed = 0
        mock_invoice.items = []
        mock_invoice.waiter = "existing_waiter"

        mock_get_order_invoice.return_value = mock_invoice

        # Setup mock pos profile. transfer_role_permissions grants this
        # session user elevated access, modeling a legitimately-authorized
        # Manager/elevated Captain acting on another user's table order (the
        # Phase 3 ownership check would otherwise deny a plain role-mismatch
        # between session user and invoice.waiter).
        mock_pos_profile = MagicMock()
        mock_pos_profile.custom_enable_multiple_cashier = 0
        mock_pos_profile.applicable_for_users = []
        mock_pos_profile.transfer_role_permissions = _role_rows("URY Manager")
        mock_pos_profile.role_allowed_for_billing = _role_rows()
        mock_pos_profile.role_restricted_for_table_order = _role_rows()
        mock_get_doc.return_value = mock_pos_profile

        mock_get_roles.return_value = ["URY Manager"]

        # Setup session user
        mock_session.user = "authorized@example.com"

        # Setup has_permission to return True
        mock_has_permission.return_value = True

        # Call sync_order
        try:
            # We mock frappe.db.sql as well in another patch if needed
            with patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql") as mock_sql:
                # We expect this to not raise a PermissionError
                # It might raise other errors due to missing items etc, but we just want to ensure
                # it passes the permission check.
                # Actually, let's catch everything and just assert has_permission was called.
                try:
                    sync_order(
                        items="[]",
                        cashier="fake_cashier",
                        owner="fake_owner",
                        mode_of_payment="Cash",
                        customer="Test Customer",
                        no_of_pax=2,
                        last_invoice=None,
                        waiter="fake_waiter",
                        pos_profile="Test Profile"
                    )
                except Exception as e:
                    pass
                
                mock_has_permission.assert_called_once_with("POS Invoice", "write", doc=mock_invoice)
                
                # Verify fake cashier/waiter were ignored
                self.assertEqual(mock_invoice.cashier, "authorized@example.com")
                # Waiter should remain "existing_waiter" because it was an existing invoice and we don't overwrite
                self.assertEqual(mock_invoice.waiter, "existing_waiter")
        except Exception as e:
            self.fail(f"Test failed with {e}")

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    def test_sync_order_unauthorized(self, mock_has_permission, mock_get_order_invoice):
        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-001"
        mock_get_order_invoice.return_value = mock_invoice
        
        # Setup has_permission to return False
        mock_has_permission.return_value = False
        
        with self.assertRaises(frappe.PermissionError):
            sync_order(
                items="[]",
                cashier="fake_cashier",
                owner="fake_owner",
                mode_of_payment="Cash",
                customer="Test Customer",
                no_of_pax=2,
                last_invoice=None,
                waiter="fake_waiter",
                pos_profile="Test Profile"
            )

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_sync_order_fake_cashier_waiter_new_invoice(self, mock_session, mock_get_doc, mock_get_value, mock_has_permission, mock_get_order_invoice):
        # Setup new invoice
        mock_invoice = MagicMock()
        mock_invoice.name = None # New invoice
        mock_invoice.branch = "Test Branch"
        mock_invoice.restaurant_table = "Table 1"
        mock_invoice.invoice_printed = 0
        mock_invoice.items = []
        mock_invoice.waiter = None # Not set yet
        
        mock_get_order_invoice.return_value = mock_invoice
        
        mock_pos_profile = MagicMock()
        mock_pos_profile.custom_enable_multiple_cashier = 0
        mock_pos_profile.applicable_for_users = []
        mock_get_doc.return_value = mock_pos_profile
        
        mock_session.user = "newuser@example.com"
        
        with patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql") as mock_sql:
            try:
                sync_order(
                    items="[]",
                    cashier="fake_cashier",
                    owner="fake_owner",
                    mode_of_payment="Cash",
                    customer="Test Customer",
                    no_of_pax=2,
                    last_invoice=None,
                    waiter="fake_waiter",
                    pos_profile="Test Profile"
                )
            except Exception:
                pass
            
            # Waiter and cashier should be set to session user, ignoring "fake_waiter" and "fake_cashier"
            self.assertEqual(mock_invoice.cashier, "newuser@example.com")
            self.assertEqual(mock_invoice.waiter, "newuser@example.com")


def _role_rows(*roles):
    """Build fake POS Profile Table MultiSelect ("Role Permitted") rows."""
    return [SimpleNamespace(role=r) for r in roles]


def _make_pos_profile(
    transfer_role_permissions=(),
    role_allowed_for_billing=(),
    role_restricted_for_table_order=(),
    remove_items=0,
    show_image=0,
    custom_enable_kot_reprint=0,
    custom_enable_multiple_cashier=0,
    name="Test POS Profile",
):
    profile = MagicMock()
    profile.name = name
    profile.transfer_role_permissions = _role_rows(*transfer_role_permissions)
    profile.role_allowed_for_billing = _role_rows(*role_allowed_for_billing)
    profile.role_restricted_for_table_order = _role_rows(*role_restricted_for_table_order)
    profile.remove_items = remove_items
    profile.show_image = show_image
    profile.custom_enable_kot_reprint = custom_enable_kot_reprint
    profile.custom_enable_multiple_cashier = custom_enable_multiple_cashier
    return profile


class TestPriceItemsForInvoicePhase1(unittest.TestCase):
    """Phase 1 regression: price_items_for_invoice() must return the same
    dict shape sync_order() used to build inline, and sync_order() must
    delegate to it rather than re-deriving prices itself."""

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_list")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    def test_price_items_for_invoice_shape(self, mock_get_value, mock_get_list):
        def get_value_side_effect(doctype, filters, fieldname=None):
            if doctype == "URY Menu Item":
                return "Starters"
            if doctype == "POS Profile":
                return "Cost Center A"
            return None

        mock_get_value.side_effect = get_value_side_effect
        mock_price = MagicMock()
        mock_price.price_list_rate = 150
        mock_get_list.return_value = [mock_price]

        items = [{"item": "Biryani", "item_name": "Biryani", "qty": 2, "comment": "less spicy"}]
        result = price_items_for_invoice(items, "Standard Selling", "Test Profile", "Branch A", "Menu A")

        self.assertEqual(len(result), 1)
        row = result[0]
        self.assertEqual(row["item_code"], "Biryani")
        self.assertEqual(row["qty"], 2)
        self.assertEqual(row["comment"], "less spicy")
        self.assertEqual(row["rate"], 150)
        self.assertEqual(row["price_list_rate"], 150)
        self.assertEqual(row["base_price_list_rate"], 150)
        self.assertEqual(row["custom_course"], "Starters")
        self.assertEqual(row["cost_center"], "Cost Center A")

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_list")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    def test_price_items_for_invoice_throws_on_missing_price(self, mock_get_value, mock_get_list):
        mock_get_value.return_value = None
        mock_get_list.return_value = []

        with self.assertRaises(frappe.ValidationError):
            price_items_for_invoice(
                [{"item": "Biryani", "item_name": "Biryani", "qty": 1}],
                "Standard Selling", "Test Profile", "Branch A", "Menu A",
            )

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.price_items_for_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_sync_order_delegates_pricing(
        self, mock_session, mock_get_roles, mock_get_doc, mock_get_value, mock_has_permission,
        mock_price_items, mock_get_order_invoice,
    ):
        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-002"
        mock_invoice.branch = "Test Branch"
        mock_invoice.restaurant_table = "Table 1"
        mock_invoice.invoice_printed = 0
        mock_invoice.invoice_created = 1
        mock_invoice.items = []
        mock_invoice.waiter = "existing_waiter"
        mock_invoice.selling_price_list = "Standard Selling"
        mock_get_order_invoice.return_value = mock_invoice

        # billing_user must resolve True, or sync_order's early "Table
        # occupied" guard returns before ever reaching the pricing section.
        mock_get_roles.return_value = ["URY Cashier"]
        billing_role = MagicMock()
        billing_role.role = "URY Cashier"
        mock_pos_profile = MagicMock()
        mock_pos_profile.custom_enable_multiple_cashier = 0
        mock_pos_profile.applicable_for_users = []
        mock_pos_profile.role_allowed_for_billing = [billing_role]
        mock_get_doc.return_value = mock_pos_profile

        mock_session.user = "authorized@example.com"
        mock_has_permission.return_value = True

        priced = [{"item_code": "Biryani", "item_name": "Biryani", "qty": 1, "comment": None,
                   "rate": 150, "price_list_rate": 150, "base_price_list_rate": 150, "cost_center": "CC-1"}]
        mock_price_items.return_value = priced

        with patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql"):
            try:
                sync_order(
                    items=[{"item": "Biryani", "qty": 1}],
                    cashier="fake_cashier", owner="fake_owner", mode_of_payment="Cash",
                    customer="Test Customer", no_of_pax=2, last_invoice=None,
                    waiter="fake_waiter", pos_profile="Test Profile",
                )
            except Exception:
                pass

        mock_price_items.assert_called_once()
        mock_invoice.append.assert_any_call("items", priced[0])


class TestGetTableOrderContext(FrappeTestCase):
    """Covers the ownership/permission matrix documented in PHASE0_PERMISSION_MATRIX.md:
    free table, own order, another Captain's order (with/without elevated access),
    Cashier access, and cross-branch denial."""

    def _table_doc(self, branch="Test Branch", room="Main Hall"):
        table_doc = MagicMock()
        table_doc.name = "T1"
        table_doc.branch = branch
        table_doc.restaurant_room = room
        table_doc.as_dict.return_value = {"name": "T1", "branch": branch}
        return table_doc

    def _invoice_doc(self, waiter, invoice_printed=0, pos_profile="Test POS Profile", branch="Test Branch"):
        invoice = MagicMock()
        invoice.name = "POS-INV-100"
        invoice.waiter = waiter
        invoice.invoice_printed = invoice_printed
        invoice.pos_profile = pos_profile
        invoice.branch = branch
        invoice.as_dict.return_value = {
            "name": "POS-INV-100",
            "waiter": waiter,
            "invoice_printed": invoice_printed,
            "branch": branch,
        }
        return invoice

    def _run(
        self,
        session_user,
        table_doc,
        invoice_doc,
        pos_profile,
        user_branch="Test Branch",
        user_roles=None,
        assigned_room="Main Hall",
    ):
        def get_doc_side_effect(doctype, name=None):
            if doctype == "URY Table":
                return table_doc
            if doctype == "POS Invoice":
                return invoice_doc
            if doctype == "POS Profile":
                return pos_profile
            raise AssertionError(f"Unexpected frappe.get_doc({doctype!r}, {name!r})")

        invoices = [SimpleNamespace(name=invoice_doc.name)] if invoice_doc else []

        with patch(
            "ury.ury.doctype.ury_order.ury_order.getBranch", return_value=user_branch
        ), patch(
            "ury.ury.doctype.ury_order.ury_order.frappe.get_doc",
            side_effect=get_doc_side_effect,
        ), patch(
            "ury.ury.doctype.ury_order.ury_order.frappe.has_permission",
            return_value=True,
        ), patch(
            "ury.ury.doctype.ury_order.ury_order.frappe.get_all",
            return_value=invoices,
        ), patch(
            "ury.ury.doctype.ury_order.ury_order.frappe.get_roles",
            return_value=list(user_roles or []),
        ), patch(
            "ury.ury.doctype.ury_order.ury_order.frappe.db.exists",
            return_value=pos_profile.name if pos_profile else None,
        ), patch(
            "ury.ury.doctype.ury_order.ury_order.frappe.db.sql",
            return_value=[],
        ), patch(
            "ury.ury.doctype.ury_order.ury_order.frappe.session",
            SimpleNamespace(user=session_user),
        ), patch(
            # get_table_order_context's room-scoping check (added to match
            # _enforce_order_access's existing room gate) calls getRoom()
            # for real if unmocked — defaults to the same room as
            # _table_doc()'s default so is-mine/own-order tests aren't
            # incidentally denied by a room mismatch they aren't testing.
            # Pass assigned_room=None to simulate a branch-level (not
            # room-specific) assignment, or a different room name to
            # exercise the room-mismatch denial path.
            "ury.ury.doctype.ury_order.ury_order.getRoom",
            return_value=[{"name": assigned_room, "branch": user_branch}],
        ):
            return get_table_order_context("T1")

    def test_free_table_no_order(self):
        """A free table has no owner to protect: view/modify default open."""
        table_doc = self._table_doc()
        pos_profile = _make_pos_profile()

        result = self._run(
            session_user="captain@example.com",
            table_doc=table_doc,
            invoice_doc=None,
            pos_profile=pos_profile,
            user_roles=["URY Captain"],
        )

        self.assertIsNone(result["order"])
        self.assertIsNone(result["assignment"])
        self.assertTrue(result["permissions"]["view"])
        self.assertTrue(result["permissions"]["modify"])

    def test_own_order_is_mine(self):
        table_doc = self._table_doc()
        invoice_doc = self._invoice_doc(waiter="captain@example.com")
        pos_profile = _make_pos_profile(remove_items=1)

        result = self._run(
            session_user="captain@example.com",
            table_doc=table_doc,
            invoice_doc=invoice_doc,
            pos_profile=pos_profile,
            user_roles=["URY Captain"],
        )

        self.assertTrue(result["assignment"]["is_mine"])
        self.assertTrue(result["permissions"]["view"])
        self.assertTrue(result["permissions"]["modify"])
        self.assertTrue(result["permissions"]["reduce_items"])
        self.assertTrue(result["permissions"]["remove_items"])
        # No submit/cancel DocType permission and not a billing user.
        self.assertFalse(result["permissions"]["settle"])
        self.assertFalse(result["permissions"]["cancel"])

    def test_other_captains_order_without_elevated_access_denied(self):
        """Captain A viewing Captain B's table with no transfer/billing access:
        every permission must be false (the ported V1 ownership check)."""
        table_doc = self._table_doc()
        invoice_doc = self._invoice_doc(waiter="captain_b@example.com")
        pos_profile = _make_pos_profile(
            remove_items=1, custom_enable_kot_reprint=1
        )

        result = self._run(
            session_user="captain_a@example.com",
            table_doc=table_doc,
            invoice_doc=invoice_doc,
            pos_profile=pos_profile,
            user_roles=["URY Captain"],
        )

        self.assertFalse(result["assignment"]["is_mine"])
        for key, value in result["permissions"].items():
            self.assertFalse(value, f"expected permissions.{key} to be False")

    def test_other_captains_order_with_elevated_access_allowed(self):
        """Captain with transfer_role_permissions can view/modify another
        Captain's table (elevated access)."""
        table_doc = self._table_doc()
        invoice_doc = self._invoice_doc(waiter="captain_b@example.com")
        pos_profile = _make_pos_profile(
            transfer_role_permissions=["URY Manager"],
            remove_items=1,
        )

        result = self._run(
            session_user="manager@example.com",
            table_doc=table_doc,
            invoice_doc=invoice_doc,
            pos_profile=pos_profile,
            user_roles=["URY Manager"],
        )

        self.assertFalse(result["assignment"]["is_mine"])
        self.assertTrue(result["permissions"]["view"])
        self.assertTrue(result["permissions"]["modify"])
        self.assertTrue(result["permissions"]["transfer_table"])

    def test_cashier_can_access_any_table(self):
        table_doc = self._table_doc()
        invoice_doc = self._invoice_doc(waiter="captain_b@example.com")
        pos_profile = _make_pos_profile(role_allowed_for_billing=["URY Cashier"])

        result = self._run(
            session_user="cashier@example.com",
            table_doc=table_doc,
            invoice_doc=invoice_doc,
            pos_profile=pos_profile,
            user_roles=["URY Cashier"],
        )

        self.assertFalse(result["assignment"]["is_mine"])
        self.assertTrue(result["permissions"]["view"])
        self.assertTrue(result["permissions"]["modify"])
        # settle/cancel additionally require real submit/cancel DocType
        # permission, which is mocked True here to isolate the billing gate.
        self.assertTrue(result["permissions"]["settle"])
        self.assertTrue(result["permissions"]["cancel"])

    def test_cross_branch_table_denied(self):
        """A table outside the session user's active branch must be denied
        outright, matching get_order_invoice's branch check."""
        table_doc = self._table_doc(branch="Other Branch")
        pos_profile = _make_pos_profile()

        result = self._run(
            session_user="captain@example.com",
            table_doc=table_doc,
            invoice_doc=None,
            pos_profile=pos_profile,
            user_branch="Test Branch",
            user_roles=["URY Captain"],
        )

        self.assertIsNone(result["order"])
        self.assertIsNone(result["assignment"])
        for key, value in result["permissions"].items():
            self.assertFalse(value, f"expected permissions.{key} to be False")


class TestGetCaptainContext(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.posOpening")
    @patch("ury.ury.doctype.ury_order.ury_order.getRoom")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.exists")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_get_captain_context_shape(
        self,
        mock_session,
        mock_getBranch,
        mock_get_roles,
        mock_get_doc,
        mock_db_exists,
        mock_getRoom,
        mock_posOpening,
    ):
        mock_session.user = "captain@example.com"
        mock_getBranch.return_value = "Test Branch"
        mock_get_roles.return_value = ["URY Captain"]
        mock_getRoom.return_value = [{"name": "Main Hall", "branch": "Test Branch"}]
        mock_db_exists.return_value = "Test POS Profile"
        mock_posOpening.return_value = 0  # POS is open

        pos_profile = _make_pos_profile(
            role_restricted_for_table_order=["URY Cashier"],
        )
        mock_get_doc.return_value = pos_profile

        result = get_captain_context()

        self.assertEqual(result["user"], "captain@example.com")
        self.assertEqual(result["branch"], "Test Branch")
        self.assertEqual(result["rooms"], [{"name": "Main Hall", "branch": "Test Branch"}])
        self.assertFalse(result["role_restricted_for_table_order"])
        self.assertEqual(result["opening_state"], {"pos_open": True})
        self.assertIn("pos_profile", result)
        self.assertEqual(result["pos_profile"]["name"], "Test POS Profile")


class TestSyncOrderHardening(FrappeTestCase):
    """Phase 3: additional server-side authorization added to sync_order()
    on top of the pre-existing billing-role/write-permission/stale-write
    checks — ownership, billed-state, role-restricted Dine-In, table
    branch/room, and item reduction/removal."""

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_denies_other_captains_order(
        self, mock_session, mock_get_roles, mock_get_doc, mock_has_permission, mock_get_order_invoice
    ):
        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-001"
        mock_invoice.waiter = "captain_b@example.com"
        mock_invoice.invoice_printed = 0
        mock_get_order_invoice.return_value = mock_invoice

        mock_pos_profile = _make_pos_profile()  # no elevated/billing roles configured
        mock_get_doc.return_value = mock_pos_profile

        mock_get_roles.return_value = ["URY Captain"]
        mock_session.user = "captain_a@example.com"
        mock_has_permission.return_value = True

        with self.assertRaises(frappe.PermissionError) as context:
            sync_order(
                items="[]",
                cashier="fake_cashier",
                owner="fake_owner",
                mode_of_payment="Cash",
                customer="Test Customer",
                no_of_pax=2,
                last_invoice=None,
                waiter="fake_waiter",
                pos_profile="Test Profile",
            )
        self.assertIn("Not permitted to modify this order", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_denies_modification_of_billed_invoice_for_non_billing_user(
        self, mock_session, mock_get_roles, mock_get_doc, mock_has_permission, mock_get_order_invoice
    ):
        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-001"
        mock_invoice.waiter = "captain_a@example.com"  # is_mine True
        mock_invoice.invoice_printed = 1  # already billed/printed
        mock_get_order_invoice.return_value = mock_invoice

        mock_pos_profile = _make_pos_profile()  # not a billing user
        mock_get_doc.return_value = mock_pos_profile

        mock_get_roles.return_value = ["URY Captain"]
        mock_session.user = "captain_a@example.com"
        mock_has_permission.return_value = True

        with self.assertRaises(frappe.PermissionError) as context:
            sync_order(
                items="[]",
                cashier="fake_cashier",
                owner="fake_owner",
                mode_of_payment="Cash",
                customer="Test Customer",
                no_of_pax=2,
                last_invoice=None,
                waiter="fake_waiter",
                pos_profile="Test Profile",
            )
        self.assertIn("already been billed", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_denies_dine_in_for_table_order_restricted_role(
        self, mock_session, mock_get_roles, mock_get_doc, mock_has_permission, mock_get_order_invoice
    ):
        mock_invoice = MagicMock()
        mock_invoice.name = None  # new order, no ownership issue
        mock_invoice.waiter = None
        mock_invoice.invoice_printed = 0
        mock_get_order_invoice.return_value = mock_invoice

        mock_pos_profile = _make_pos_profile(
            role_restricted_for_table_order=["URY Captain"]
        )
        mock_get_doc.return_value = mock_pos_profile

        mock_get_roles.return_value = ["URY Captain"]
        mock_session.user = "restricted_captain@example.com"
        mock_has_permission.return_value = True

        with self.assertRaises(frappe.PermissionError) as context:
            sync_order(
                items="[]",
                cashier="fake_cashier",
                owner="fake_owner",
                mode_of_payment="Cash",
                customer="Test Customer",
                no_of_pax=2,
                last_invoice=None,
                waiter="fake_waiter",
                pos_profile="Test Profile",
                order_type="Dine In",
            )
        self.assertIn("not permitted to take Dine In table orders", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_denies_table_outside_active_branch(
        self,
        mock_session,
        mock_get_roles,
        mock_get_doc,
        mock_getBranch,
        mock_db_get_value,
        mock_has_permission,
        mock_get_order_invoice,
    ):
        mock_invoice = MagicMock()
        mock_invoice.name = None  # skip ownership block, isolate the table/branch check
        mock_get_order_invoice.return_value = mock_invoice

        mock_pos_profile = _make_pos_profile()
        mock_get_doc.return_value = mock_pos_profile

        mock_get_roles.return_value = ["URY Captain"]
        mock_session.user = "captain@example.com"
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Test Branch"
        mock_db_get_value.return_value = ("Other Branch", "Main Hall")

        with self.assertRaises(frappe.PermissionError) as context:
            sync_order(
                items="[]",
                cashier="fake_cashier",
                owner="fake_owner",
                mode_of_payment="Cash",
                customer="Test Customer",
                no_of_pax=2,
                last_invoice=None,
                waiter="fake_waiter",
                pos_profile="Test Profile",
                table="T1",
            )
        self.assertIn("outside your active branch", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.getRoom")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_denies_table_outside_assigned_room(
        self,
        mock_session,
        mock_get_roles,
        mock_get_doc,
        mock_getBranch,
        mock_getRoom,
        mock_db_get_value,
        mock_has_permission,
        mock_get_order_invoice,
    ):
        mock_invoice = MagicMock()
        mock_invoice.name = None
        mock_get_order_invoice.return_value = mock_invoice

        mock_pos_profile = _make_pos_profile()  # no elevated/billing access
        mock_get_doc.return_value = mock_pos_profile

        mock_get_roles.return_value = ["URY Captain"]
        mock_session.user = "captain@example.com"
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Test Branch"
        mock_db_get_value.return_value = ("Test Branch", "Back Room")
        mock_getRoom.return_value = [{"name": "Main Hall", "branch": "Test Branch"}]

        with self.assertRaises(frappe.PermissionError) as context:
            sync_order(
                items="[]",
                cashier="fake_cashier",
                owner="fake_owner",
                mode_of_payment="Cash",
                customer="Test Customer",
                no_of_pax=2,
                last_invoice=None,
                waiter="fake_waiter",
                pos_profile="Test Profile",
                table="T1",
            )
        self.assertIn("outside your assigned room", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order._reconcile_invoice_merged_tables")
    @patch("ury.ury.doctype.ury_order.ury_order.get_order_invoice")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_denies_item_reduction_without_remove_items_permission(
        self,
        mock_session,
        mock_get_roles,
        mock_get_doc,
        mock_db_get_value,
        mock_has_permission,
        mock_get_order_invoice,
        mock_reconcile,
    ):
        existing_item = MagicMock()
        existing_item.item_code = "ITEM-1"
        existing_item.item_name = "Item One"
        existing_item.qty = 2

        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-001"
        mock_invoice.branch = "Test Branch"
        mock_invoice.restaurant_table = None
        mock_invoice.invoice_printed = 0
        mock_invoice.items = [existing_item]
        mock_invoice.waiter = "captain@example.com"
        # Matches last_modified_time below exactly (same string, both
        # parsed identically) so the pre-existing stale-write guard
        # (last_invoice + last_modified_time branch, not Phase-3 code)
        # doesn't short-circuit before reaching the item-reduction check.
        mock_invoice.modified = "2024-01-01 10:00:00.123456"
        mock_get_order_invoice.return_value = mock_invoice

        mock_pos_profile = _make_pos_profile(remove_items=0)
        mock_get_doc.return_value = mock_pos_profile

        mock_get_roles.return_value = ["URY Captain"]
        mock_session.user = "captain@example.com"  # is_mine True: ownership check passes
        mock_has_permission.return_value = True
        mock_db_get_value.return_value = None

        with patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql", return_value=[]):
            with self.assertRaises(frappe.PermissionError) as context:
                sync_order(
                    items=json.dumps([{"item": "ITEM-1", "qty": 1}]),  # 2 -> 1: a reduction
                    cashier="fake_cashier",
                    owner="fake_owner",
                    mode_of_payment="Cash",
                    customer="Test Customer",
                    no_of_pax=2,
                    # Must match mock_invoice.name/.modified — without a
                    # matching last_invoice + last_modified_time pair,
                    # sync_order's pre-existing (not Phase-3-added)
                    # stale-write/"table occupied" guards return
                    # {"status": "Failure"} before ever reaching the
                    # item-reduction check this test is targeting, silently
                    # short-circuiting this test regardless of the
                    # reduction logic under test.
                    last_invoice="POS-INV-001",
                    last_modified_time="2024-01-01 10:00:00.123456",
                    waiter="fake_waiter",
                    pos_profile="Test Profile",
                )
        self.assertIn(
            "not permitted to reduce or remove items", str(context.exception)
        )


class TestGetOrderInvoiceOwnership(FrappeTestCase):
    """Phase 3: get_order_invoice() previously fetched/returned an invoice
    with only a DocType-level read-permission + branch check. These cover
    the added Captain/waiter ownership + room-access validation."""

    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_denies_other_captains_order(
        self,
        mock_session,
        mock_get_roles,
        mock_get_value,
        mock_get_doc,
        mock_has_permission,
        mock_getBranch,
    ):
        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-001"
        mock_invoice.branch = "Test Branch"
        mock_invoice.waiter = "captain_b@example.com"
        mock_invoice.pos_profile = "Test POS Profile"
        mock_invoice.get = lambda key, default=None: getattr(mock_invoice, key, default)

        pos_profile = _make_pos_profile()  # no elevated/billing roles

        def get_doc_side_effect(doctype, name=None):
            if doctype == "POS Invoice":
                return mock_invoice
            if doctype == "POS Profile":
                return pos_profile
            raise AssertionError(f"Unexpected frappe.get_doc({doctype!r}, {name!r})")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_get_value.return_value = "POS-INV-001"
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Test Branch"
        mock_get_roles.return_value = ["URY Captain"]
        mock_session.user = "captain_a@example.com"

        with self.assertRaises(frappe.PermissionError) as context:
            get_order_invoice(invoiceNo="POS-INV-001")
        self.assertIn("Not permitted to view this order", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.getRoom")
    @patch("ury.ury.doctype.ury_order.ury_order.getBranch")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_value")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.session")
    def test_allows_elevated_user_without_room_check(
        self,
        mock_session,
        mock_get_roles,
        mock_get_value,
        mock_get_doc,
        mock_has_permission,
        mock_getBranch,
        mock_getRoom,
    ):
        mock_invoice = MagicMock()
        mock_invoice.name = "POS-INV-001"
        mock_invoice.branch = "Test Branch"
        mock_invoice.waiter = "captain_b@example.com"
        mock_invoice.restaurant_table = "T1"
        mock_invoice.pos_profile = "Test POS Profile"
        mock_invoice.get = lambda key, default=None: getattr(mock_invoice, key, default)

        pos_profile = _make_pos_profile(transfer_role_permissions=["URY Manager"])

        def get_doc_side_effect(doctype, name=None):
            if doctype == "POS Invoice":
                return mock_invoice
            if doctype == "POS Profile":
                return pos_profile
            raise AssertionError(f"Unexpected frappe.get_doc({doctype!r}, {name!r})")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_get_value.return_value = "POS-INV-001"
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Test Branch"
        mock_get_roles.return_value = ["URY Manager"]
        mock_session.user = "manager@example.com"

        result = get_order_invoice(invoiceNo="POS-INV-001")

        self.assertEqual(result.name, "POS-INV-001")
        # Elevated access short-circuits the room-membership lookup.
        mock_getRoom.assert_not_called()


class TestTableTransfer(FrappeTestCase):
    """Phase 3: table_transfer() previously had no server-side transfer-role
    check at all, relying entirely on the frontend's canCaptainTransfer()."""

    @patch("ury.ury.doctype.ury_order.ury_order._get_merge_cluster")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    def test_denied_without_transfer_role(
        self, mock_get_roles, mock_get_doc, mock_has_permission, mock_merge_cluster
    ):
        current_table = MagicMock()
        current_table.branch = "Test Branch"
        new_table = MagicMock()
        new_table.branch = "Test Branch"
        new_table.occupied = 0
        pos_invoice = MagicMock()
        pos_invoice.pos_profile = "Test POS Profile"

        pos_profile = _make_pos_profile()  # no transfer_role_permissions

        def get_doc_side_effect(doctype, name=None):
            if doctype == "URY Table" and name == "T1":
                return current_table
            if doctype == "URY Table" and name == "T2":
                return new_table
            if doctype == "POS Invoice":
                return pos_invoice
            if doctype == "POS Profile":
                return pos_profile
            raise AssertionError(f"Unexpected frappe.get_doc({doctype!r}, {name!r})")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_has_permission.return_value = True
        mock_get_roles.return_value = ["URY Captain"]

        with self.assertRaises(frappe.PermissionError) as context:
            table_transfer("T1", "T2", "POS-INV-1")
        self.assertIn("not permitted to transfer tables", str(context.exception))
        mock_merge_cluster.assert_not_called()

    @patch("ury.ury.doctype.ury_order.ury_order.change_table_in_kot")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.set_value")
    @patch("ury.ury.doctype.ury_order.ury_order._get_merge_cluster")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    def test_allowed_with_transfer_role(
        self,
        mock_get_roles,
        mock_get_doc,
        mock_has_permission,
        mock_merge_cluster,
        mock_set_value,
        mock_change_kot,
    ):
        current_table = MagicMock()
        current_table.branch = "Test Branch"
        new_table = MagicMock()
        new_table.branch = "Test Branch"
        new_table.occupied = 0
        new_table.name = "T2"
        new_table.restaurant_room = "Main Hall"
        pos_invoice = MagicMock()
        pos_invoice.pos_profile = "Test POS Profile"
        pos_invoice.name = "POS-INV-1"
        pos_invoice.branch = "Test Branch"

        pos_profile = _make_pos_profile(transfer_role_permissions=["URY Manager"])

        def get_doc_side_effect(doctype, name=None):
            if doctype == "URY Table" and name == "T1":
                return current_table
            if doctype == "URY Table" and name == "T2":
                return new_table
            if doctype == "POS Invoice":
                return pos_invoice
            if doctype == "POS Profile":
                return pos_profile
            raise AssertionError(f"Unexpected frappe.get_doc({doctype!r}, {name!r})")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_has_permission.return_value = True
        mock_get_roles.return_value = ["URY Manager"]
        mock_merge_cluster.return_value = (["T1"], {})

        table_transfer("T1", "T2", "POS-INV-1")

        self.assertEqual(pos_invoice.restaurant_table, "T2")
        pos_invoice.save.assert_called_once()


class TestCaptainTransfer(FrappeTestCase):
    """Phase 3: captain_transfer() previously only enforced same-room
    assignment under multiple_cashier mode. These cover the added
    transfer-role authorization, invoice-write authorization, branch
    validation, and target-user eligibility."""

    def _pos_invoice(self, pos_profile="Test POS Profile", branch="Test Branch", restaurant_table="T1"):
        inv = MagicMock()
        inv.pos_profile = pos_profile
        inv.branch = branch
        inv.restaurant_table = restaurant_table
        inv.name = "POS-INV-1"
        return inv

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    def test_denied_without_transfer_role(self, mock_get_roles, mock_get_doc, mock_has_permission, mock_sql):
        pos_invoice = self._pos_invoice()
        pos_profile = _make_pos_profile()  # no transfer_role_permissions

        def get_doc_side_effect(doctype, name=None):
            if doctype == "POS Invoice":
                return pos_invoice
            if doctype == "POS Profile":
                return pos_profile
            raise AssertionError(f"Unexpected frappe.get_doc({doctype!r}, {name!r})")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_has_permission.return_value = True
        mock_get_roles.side_effect = lambda user=None: ["URY Captain"]

        with self.assertRaises(frappe.PermissionError) as context:
            captain_transfer("captain_a@example.com", "captain_b@example.com", "POS-INV-1")
        self.assertIn("not permitted to transfer captains", str(context.exception))
        mock_sql.assert_not_called()

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    def test_denied_target_not_in_branch(self, mock_get_roles, mock_get_doc, mock_has_permission, mock_sql):
        pos_invoice = self._pos_invoice()
        pos_profile = _make_pos_profile(transfer_role_permissions=["URY Manager"])

        def get_doc_side_effect(doctype, name=None):
            if doctype == "POS Invoice":
                return pos_invoice
            if doctype == "POS Profile":
                return pos_profile
            raise AssertionError(f"Unexpected frappe.get_doc({doctype!r}, {name!r})")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_has_permission.return_value = True
        mock_get_roles.side_effect = lambda user=None: ["URY Manager"]
        mock_sql.return_value = []  # target has no URY User row under this branch

        with self.assertRaises(frappe.PermissionError) as context:
            captain_transfer("captain_a@example.com", "captain_b@example.com", "POS-INV-1")
        self.assertIn("not assigned to this branch", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    def test_denied_ineligible_target_role(self, mock_get_roles, mock_get_doc, mock_has_permission, mock_sql):
        pos_invoice = self._pos_invoice()
        pos_profile = _make_pos_profile(
            transfer_role_permissions=["URY Manager"],
            role_restricted_for_table_order=["URY Cashier"],
        )

        def get_doc_side_effect(doctype, name=None):
            if doctype == "POS Invoice":
                return pos_invoice
            if doctype == "POS Profile":
                return pos_profile
            raise AssertionError(f"Unexpected frappe.get_doc({doctype!r}, {name!r})")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_has_permission.return_value = True

        def get_roles_side_effect(user=None):
            if user == "captain_b@example.com":
                return ["URY Cashier"]
            return ["URY Manager"]

        mock_get_roles.side_effect = get_roles_side_effect
        mock_sql.return_value = [{"room": "Main Hall"}]

        with self.assertRaises(frappe.PermissionError) as context:
            captain_transfer("captain_a@example.com", "captain_b@example.com", "POS-INV-1")
        self.assertIn("not permitted to take table orders", str(context.exception))

    @patch("ury.ury.doctype.ury_order.ury_order.frappe.db.sql")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.has_permission")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_doc")
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.get_roles")
    def test_allowed(self, mock_get_roles, mock_get_doc, mock_has_permission, mock_sql):
        pos_invoice = self._pos_invoice(restaurant_table="T1")
        pos_profile = _make_pos_profile(transfer_role_permissions=["URY Manager"])

        user_docs = {}

        def get_doc_side_effect(doctype, name=None):
            if doctype == "POS Invoice":
                return pos_invoice
            if doctype == "POS Profile":
                return pos_profile
            if doctype == "User":
                doc = user_docs.setdefault(name, MagicMock())
                doc.name = name
                return doc
            raise AssertionError(f"Unexpected frappe.get_doc({doctype!r}, {name!r})")

        mock_get_doc.side_effect = get_doc_side_effect
        mock_has_permission.return_value = True
        mock_get_roles.side_effect = (
            lambda user=None: ["URY Manager"]
            if user in (None, "manager@example.com")
            else ["URY Captain"]
        )
        mock_sql.return_value = [{"room": "Main Hall"}]

        captain_transfer("captain_a@example.com", "captain_b@example.com", "POS-INV-1")

        self.assertEqual(pos_invoice.waiter, "captain_b@example.com")
        pos_invoice.save.assert_called_once()

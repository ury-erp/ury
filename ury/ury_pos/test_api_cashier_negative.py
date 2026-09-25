# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and Contributors
# See license.txt

"""Negative-path tests for getInvoiceForCashier (api.py:418) and getCashier
(api.py:722), filling gaps left by test_api_cashier_scoping.py and test_api.py.

Checked before writing these to avoid duplication:
  - test_api_cashier_scoping.py::TestGetInvoiceForCashierScoping - already
    covers: non-elevated user forced to own session user, elevated role can
    read other cashier, own-cashier value unaffected, pagination next=True/
    False, Recently Paid never sets next.
  - test_api_cashier_scoping.py::TestGetCashier - already covers: cashier
    found for an open POS Opening Entry, and no open entry -> None (this is
    the "no open POS shift" case, so it is not repeated here).
  - test_api.py - no coverage at all for getInvoiceForCashier or getCashier
    (grepped for both names and for "Guest"/"POS Opening Entry": no hits).

Gaps this file adds:
  - getInvoiceForCashier: branch used in the query always comes from
    getBranch() (the caller's own branch), never something an "other branch"
    caller could inject; a user with no branch mapping gets getBranch()'s
    frappe.throw propagated instead of a silent/wrong result; a Guest
    session (no roles at all) is still force-scoped to its own session user
    exactly like any other non-elevated caller.
  - getCashier: a user with no branch mapping gets getBranch()'s error
    propagated; a room with no matching "Multiple Rooms" row (nonexistent/
    invalid room - the closest analogue to an "invalid id" for this
    function, since getCashier takes no invoice id) also resolves to None
    without touching frappe.db.get_value.

Note: neither getInvoiceForCashier nor getCashier accepts an invoice name/id
parameter (getInvoiceForCashier takes status/cashier/limit/limit_start; a
per-invoice equivalent would be getPosInvoiceGroup, which is out of scope for
this file per the task), so "invalid/nonexistent invoice id" has no direct
analogue here.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch

from ury.ury_pos import api


class TestGetInvoiceForCashierNegative(FrappeTestCase):
    """Negative paths for getInvoiceForCashier not covered by
    TestGetInvoiceForCashierScoping."""

    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_wrong_cashier_from_other_branch_scoped_to_own_branch(
        self, mock_session, mock_get_roles, mock_get_branch, mock_sql
    ):
        # A non-elevated caller in "Branch A" tries to pass a cashier that
        # actually belongs to "Branch B". The function must still query only
        # the caller's own branch (from getBranch()), never a branch implied
        # by the requested cashier.
        mock_session.user = "waiter@branch-a.test.com"
        mock_get_roles.return_value = ["URY Waiter"]
        mock_get_branch.return_value = "Branch A"
        mock_sql.return_value = []

        api.getInvoiceForCashier(
            status="Draft",
            cashier="cashier@branch-b.test.com",
            limit=10,
            limit_start=0,
        )

        args, kwargs = mock_sql.call_args
        bind_params = args[1] if len(args) > 1 else kwargs.get("values")
        self.assertIn("Branch A", bind_params)
        self.assertNotIn("Branch B", bind_params)
        # cashier is also force-scoped since the caller has no elevated role
        self.assertIn("waiter@branch-a.test.com", bind_params)
        self.assertNotIn("cashier@branch-b.test.com", bind_params)

    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_user_with_no_branch_mapping_raises(
        self, mock_session, mock_get_roles, mock_get_branch, mock_sql
    ):
        # getBranch() throws (mirrors its real frappe.throw when the "URY
        # User"/"Branch" join finds nothing) - the caller-facing error must
        # propagate rather than being swallowed.
        mock_session.user = "unmapped@test.com"
        mock_get_roles.return_value = []
        mock_get_branch.side_effect = frappe.ValidationError("User is not Associated with any Branch.")

        with self.assertRaises(frappe.ValidationError):
            api.getInvoiceForCashier(
                status="Draft", cashier="unmapped@test.com", limit=10, limit_start=0
            )

        mock_sql.assert_not_called()

    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_guest_user_is_force_scoped_to_guest(
        self, mock_session, mock_get_roles, mock_get_branch, mock_sql
    ):
        # A Guest session has no roles at all, so the elevated-role check
        # must still force `cashier` back to the session user ("Guest")
        # rather than raising or leaking another cashier's invoices.
        mock_session.user = "Guest"
        mock_get_roles.return_value = []
        mock_get_branch.return_value = "Branch A"
        mock_sql.return_value = []

        api.getInvoiceForCashier(
            status="Draft", cashier="cashier@test.com", limit=10, limit_start=0
        )

        args, kwargs = mock_sql.call_args
        bind_params = args[1] if len(args) > 1 else kwargs.get("values")
        self.assertIn("Guest", bind_params)
        self.assertNotIn("cashier@test.com", bind_params)


class TestGetCashierNegative(FrappeTestCase):
    """Negative paths for getCashier not covered by TestGetCashier."""

    @patch("ury.ury_pos.api.frappe.db.get_value")
    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    def test_user_with_no_branch_mapping_raises(
        self, mock_get_branch, mock_sql, mock_get_value
    ):
        mock_get_branch.side_effect = frappe.ValidationError("User is not Associated with any Branch.")

        with self.assertRaises(frappe.ValidationError):
            api.getCashier(room="Room 1")

        mock_sql.assert_not_called()
        mock_get_value.assert_not_called()

    @patch("ury.ury_pos.api.frappe.db.get_value")
    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    def test_nonexistent_room_returns_none(
        self, mock_get_branch, mock_sql, mock_get_value
    ):
        # A room with no matching row in "Multiple Rooms" for an open POS
        # Opening Entry (invalid/nonexistent room) - the query legitimately
        # returns no rows, distinct from the "shift not open" case already
        # covered in TestGetCashier.
        mock_get_branch.return_value = "Branch A"
        mock_sql.return_value = []

        result = api.getCashier(room="Nonexistent Room")

        self.assertIsNone(result)
        mock_get_value.assert_not_called()
        args, kwargs = mock_sql.call_args
        bind_params = args[1] if len(args) > 1 else kwargs.get("values")
        self.assertIn("Nonexistent Room", bind_params)

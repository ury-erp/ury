# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and Contributors
# See license.txt

"""Priority-3 whitelisted-function audit: ury_pos/api.py cashier surface.

Covers functions with zero prior coverage (per grep against test_api.py):
  - getInvoiceForCashier: the U27 cashier-scoping security fix (a non-elevated
    caller must not be able to read another cashier's invoices by simply
    passing a different `cashier` argument).
  - searchPosInvoice: branch scoping + Administrator/System Manager bypass
    when getBranch() raises (no branch assigned).
  - getCashier: POS Opening Entry -> room -> assigned cashier lookup.

Pattern follows test_api.py: patch frappe.db.sql / frappe.get_all /
frappe.session / frappe.get_roles directly on the ury.ury_pos.api module.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury_pos import api


class TestGetInvoiceForCashierScoping(FrappeTestCase):
    """U27 security fix: `cashier` param must not let a non-elevated caller
    read another cashier's invoices."""

    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_non_elevated_user_cannot_read_other_cashier(
        self, mock_session, mock_get_roles, mock_get_branch, mock_sql
    ):
        mock_session.user = "waiter@test.com"
        mock_get_roles.return_value = ["URY Waiter"]
        mock_get_branch.return_value = "Branch A"
        mock_sql.return_value = []

        api.getInvoiceForCashier(
            status="Draft", cashier="other_cashier@test.com", limit=10, limit_start=0
        )

        # The SQL bind params must carry the session user, not the requested one.
        args, kwargs = mock_sql.call_args
        bind_params = args[1] if len(args) > 1 else kwargs.get("values")
        self.assertIn("waiter@test.com", bind_params)
        self.assertNotIn("other_cashier@test.com", bind_params)

    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_elevated_role_can_read_other_cashier(
        self, mock_session, mock_get_roles, mock_get_branch, mock_sql
    ):
        mock_session.user = "manager@test.com"
        mock_get_roles.return_value = ["URY Manager"]
        mock_get_branch.return_value = "Branch A"
        mock_sql.return_value = []

        api.getInvoiceForCashier(
            status="Draft", cashier="other_cashier@test.com", limit=10, limit_start=0
        )

        args, kwargs = mock_sql.call_args
        bind_params = args[1] if len(args) > 1 else kwargs.get("values")
        self.assertIn("other_cashier@test.com", bind_params)

    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_own_cashier_value_is_unaffected(
        self, mock_session, mock_get_roles, mock_get_branch, mock_sql
    ):
        mock_session.user = "cashier@test.com"
        mock_get_roles.return_value = []
        mock_get_branch.return_value = "Branch A"
        mock_sql.return_value = []

        api.getInvoiceForCashier(
            status="Draft", cashier="cashier@test.com", limit=10, limit_start=0
        )

        args, kwargs = mock_sql.call_args
        bind_params = args[1] if len(args) > 1 else kwargs.get("values")
        self.assertIn("cashier@test.com", bind_params)

    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_pagination_next_flag_true_when_extra_row_returned(
        self, mock_session, mock_get_roles, mock_get_branch, mock_sql
    ):
        mock_session.user = "cashier@test.com"
        mock_get_roles.return_value = []
        mock_get_branch.return_value = "Branch A"
        # limit passed in is 2 -> internally becomes 3; return 3 rows to
        # simulate "there is more data".
        mock_sql.return_value = [{"name": f"INV-{i}"} for i in range(3)]

        result = api.getInvoiceForCashier(
            status="Draft", cashier="cashier@test.com", limit=2, limit_start=0
        )

        self.assertTrue(result["next"])
        self.assertEqual(len(result["data"]), 2)

    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_pagination_next_flag_false_when_no_extra_row(
        self, mock_session, mock_get_roles, mock_get_branch, mock_sql
    ):
        mock_session.user = "cashier@test.com"
        mock_get_roles.return_value = []
        mock_get_branch.return_value = "Branch A"
        mock_sql.return_value = [{"name": "INV-1"}]

        result = api.getInvoiceForCashier(
            status="Draft", cashier="cashier@test.com", limit=2, limit_start=0
        )

        self.assertFalse(result["next"])
        self.assertEqual(len(result["data"]), 1)

    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_recently_paid_status_never_sets_next(
        self, mock_session, mock_get_roles, mock_get_branch, mock_sql
    ):
        mock_session.user = "cashier@test.com"
        mock_get_roles.return_value = []
        mock_get_branch.return_value = "Branch A"
        # Even with a full "extra row" result set, Recently Paid should not
        # flag `next` per the explicit status exclusion in the source.
        mock_sql.return_value = [{"name": f"INV-{i}"} for i in range(3)]

        result = api.getInvoiceForCashier(
            status="Recently Paid", cashier="cashier@test.com", limit=2, limit_start=0
        )

        self.assertFalse(result["next"])
        self.assertEqual(len(result["data"]), 3)


class TestSearchPosInvoiceBranchScoping(FrappeTestCase):
    """searchPosInvoice(): empty-query short-circuit, branch scoping, and the
    Administrator/System Manager bypass when getBranch() raises."""

    def test_empty_query_returns_empty_without_touching_db(self):
        result = api.searchPosInvoice(query="", status="Draft")
        self.assertEqual(result, {"data": [], "next": False})

    @patch("ury.ury_pos.api._enrich_split_group_meta", side_effect=lambda rows: rows)
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.getBranch")
    def test_branch_filter_applied_for_normal_user(
        self, mock_get_branch, mock_get_all, mock_enrich
    ):
        mock_get_branch.return_value = "Branch A"
        mock_get_all.return_value = []

        api.searchPosInvoice(query="9999", status="Draft")

        _, kwargs = mock_get_all.call_args
        self.assertEqual(kwargs["filters"]["branch"], "Branch A")

    @patch("ury.ury_pos.api._enrich_split_group_meta", side_effect=lambda rows: rows)
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.getBranch", side_effect=frappe.ValidationError)
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_administrator_without_branch_searches_all_branches(
        self, mock_session, mock_get_roles, mock_get_branch, mock_get_all, mock_enrich
    ):
        mock_session.user = "Administrator"
        mock_get_roles.return_value = ["System Manager"]
        mock_get_all.return_value = []

        api.searchPosInvoice(query="9999", status="Draft")

        _, kwargs = mock_get_all.call_args
        self.assertNotIn("branch", kwargs["filters"])

    @patch("ury.ury_pos.api._enrich_split_group_meta", side_effect=lambda rows: rows)
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.getBranch", side_effect=frappe.ValidationError)
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_non_admin_without_branch_reraises(
        self, mock_session, mock_get_roles, mock_get_branch, mock_get_all, mock_enrich
    ):
        mock_session.user = "waiter@test.com"
        mock_get_roles.return_value = ["URY Waiter"]

        with self.assertRaises(frappe.ValidationError):
            api.searchPosInvoice(query="9999", status="Draft")

        mock_get_all.assert_not_called()

    @patch("ury.ury_pos.api._enrich_split_group_meta", side_effect=lambda rows: rows)
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.getBranch")
    def test_unbilled_status_overrides_filters(
        self, mock_get_branch, mock_get_all, mock_enrich
    ):
        mock_get_branch.return_value = "Branch A"
        mock_get_all.return_value = []

        api.searchPosInvoice(query="abc", status="Unbilled")

        _, kwargs = mock_get_all.call_args
        self.assertEqual(kwargs["filters"]["status"], "draft")
        self.assertEqual(kwargs["filters"]["invoice_printed"], 0)

    @patch("ury.ury_pos.api._enrich_split_group_meta", side_effect=lambda rows: rows)
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.getBranch")
    def test_next_true_when_page_full(self, mock_get_branch, mock_get_all, mock_enrich):
        mock_get_branch.return_value = "Branch A"
        mock_get_all.return_value = [{"name": f"INV-{i}"} for i in range(10)]

        result = api.searchPosInvoice(query="abc", status="Draft")

        self.assertTrue(result["next"])

    @patch("ury.ury_pos.api._enrich_split_group_meta", side_effect=lambda rows: rows)
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.getBranch")
    def test_next_false_when_page_not_full(self, mock_get_branch, mock_get_all, mock_enrich):
        mock_get_branch.return_value = "Branch A"
        mock_get_all.return_value = [{"name": "INV-1"}]

        result = api.searchPosInvoice(query="abc", status="Draft")

        self.assertFalse(result["next"])


class TestGetCashier(FrappeTestCase):
    """getCashier(): POS Opening Entry -> room -> assigned cashier lookup."""

    @patch("ury.ury_pos.api.frappe.db.get_value")
    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    def test_returns_cashier_when_open_entry_found(
        self, mock_get_branch, mock_sql, mock_get_value
    ):
        mock_get_branch.return_value = "Branch A"
        mock_sql.return_value = [frappe._dict({"name": "POE-1"})]
        mock_get_value.return_value = "cashier@test.com"

        result = api.getCashier(room="Room 1")

        self.assertEqual(result, "cashier@test.com")
        mock_get_value.assert_called_once_with(
            "POS Opening Entry", {"name": "POE-1"}, "user"
        )

    @patch("ury.ury_pos.api.frappe.db.get_value")
    @patch("ury.ury_pos.api.frappe.db.sql")
    @patch("ury.ury_pos.api.getBranch")
    def test_returns_none_when_no_open_entry(
        self, mock_get_branch, mock_sql, mock_get_value
    ):
        mock_get_branch.return_value = "Branch A"
        mock_sql.return_value = []

        result = api.getCashier(room="Room 1")

        self.assertIsNone(result)
        mock_get_value.assert_not_called()

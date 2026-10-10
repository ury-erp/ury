"""Tests for loyalty, which is mostly a test that we did NOT reimplement it.

ERPNext owns the ledger, the tiers and the expiry. What is ours is: which
programme a customer collects on, what the till is told, and that a
misconfiguration cannot stop a guest paying.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury.api.loyalty import (
    apply_loyalty_to_invoice,
    get_customer_loyalty,
    resolve_loyalty_program,
)

MOD = "ury.ury.api.loyalty"


class TestResolveLoyaltyProgram(FrappeTestCase):

    @patch(f"{MOD}.frappe.db.get_value", return_value="Gold Card")
    def test_an_explicit_enrolment_wins(self, mock_get_value):
        self.assertEqual(resolve_loyalty_program("CUST-1", "Smart Choice"), "Gold Card")

    @patch(f"{MOD}.frappe.get_all", return_value=["House Points"])
    @patch(f"{MOD}.frappe.db.get_value", return_value=None)
    def test_a_single_auto_opt_in_programme_is_used(self, mock_get_value, mock_get_all):
        self.assertEqual(resolve_loyalty_program("CUST-1", "Smart Choice"), "House Points")
        self.assertEqual(mock_get_all.call_args[1]["filters"]["auto_opt_in"], 1)

    @patch(f"{MOD}.frappe.get_all", return_value=["House Points", "Staff Card"])
    @patch(f"{MOD}.frappe.db.get_value", return_value=None)
    def test_ambiguity_resolves_to_nothing_not_to_a_guess(self, mock_get_value, mock_get_all):
        """Enrolling a customer in the wrong programme quietly awards them
        someone else's tier, so two candidates means none."""
        self.assertIsNone(resolve_loyalty_program("CUST-1", "Smart Choice"))

    def test_no_customer_means_no_programme(self):
        self.assertIsNone(resolve_loyalty_program(None, "Smart Choice"))


class TestGetCustomerLoyalty(FrappeTestCase):

    @patch(f"{MOD}.resolve_loyalty_program", return_value=None)
    @patch(f"{MOD}._company_for_profile", return_value="Smart Choice")
    def test_a_walk_in_gets_a_quiet_answer_not_an_error(self, mock_company, mock_resolve):
        """This runs every time a customer is picked at the till, and most of
        them have no loyalty at all."""
        result = get_customer_loyalty("Walk In", "Profile A")

        self.assertFalse(result["enrolled"])
        self.assertEqual(result["loyalty_points"], 0)

    @patch(f"{MOD}.get_loyalty_program_details_with_points")
    @patch(f"{MOD}.resolve_loyalty_program", return_value="Gold Card")
    @patch(f"{MOD}._company_for_profile", return_value="Smart Choice")
    def test_points_and_their_cash_value_are_returned(
        self, mock_company, mock_resolve, mock_details
    ):
        mock_details.return_value = frappe._dict(
            loyalty_points=250, conversion_factor=10, tier_name="Gold"
        )

        result = get_customer_loyalty("CUST-1", "Profile A")

        self.assertTrue(result["enrolled"])
        self.assertEqual(result["loyalty_points"], 250)
        self.assertEqual(result["redeemable_amount"], 2500)
        self.assertEqual(result["tier_name"], "Gold")

    @patch(f"{MOD}.frappe.log_error")
    @patch(f"{MOD}.get_loyalty_program_details_with_points", side_effect=Exception("no rules"))
    @patch(f"{MOD}.resolve_loyalty_program", return_value="Broken Card")
    @patch(f"{MOD}._company_for_profile", return_value="Smart Choice")
    def test_a_misconfigured_programme_does_not_block_the_till(
        self, mock_company, mock_resolve, mock_details, mock_log
    ):
        result = get_customer_loyalty("CUST-1", "Profile A")

        self.assertFalse(result["enrolled"])
        mock_log.assert_called_once()


class TestApplyLoyaltyToInvoice(FrappeTestCase):

    def _invoice(self):
        invoice = MagicMock()
        invoice.customer = "CUST-1"
        invoice.company = "Smart Choice"
        invoice.pos_profile = "Profile A"
        invoice.get.return_value = None
        return invoice

    @patch(f"{MOD}.resolve_loyalty_program", return_value=None)
    def test_no_programme_means_nothing_is_touched(self, mock_resolve):
        invoice = self._invoice()
        self.assertEqual(apply_loyalty_to_invoice(invoice, 100), 0)

    @patch(f"{MOD}.resolve_loyalty_program", return_value="Gold Card")
    def test_the_programme_is_attached_even_with_no_redemption(self, mock_resolve):
        """This is the field that makes ERPNext *award* points on submit —
        the half of loyalty that happens on every bill."""
        invoice = self._invoice()

        self.assertEqual(apply_loyalty_to_invoice(invoice, 0), 0)

        self.assertEqual(invoice.loyalty_program, "Gold Card")
        self.assertEqual(invoice.redeem_loyalty_points, 0)

    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}.resolve_loyalty_program", return_value="Gold Card")
    def test_a_redemption_sets_the_fields_erpnext_posts_against(
        self, mock_resolve, mock_get_value
    ):
        mock_get_value.side_effect = lambda *a, **k: (
            frappe._dict(cost_center="CC-1") if k.get("as_dict") else "Loyalty Expense"
        )
        invoice = self._invoice()

        points = apply_loyalty_to_invoice(invoice, 250)

        self.assertEqual(points, 250)
        self.assertEqual(invoice.redeem_loyalty_points, 1)
        self.assertEqual(invoice.loyalty_points, 250)
        self.assertEqual(invoice.loyalty_redemption_account, "Loyalty Expense")

    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}.resolve_loyalty_program", return_value="Gold Card")
    def test_a_programme_without_a_redemption_account_is_refused_clearly(
        self, mock_resolve, mock_get_value
    ):
        """Better a named refusal now than an accounting error at submit that
        the cashier cannot act on."""
        mock_get_value.side_effect = lambda *a, **k: (
            frappe._dict(cost_center="CC-1") if k.get("as_dict") else None
        )
        invoice = self._invoice()

        with self.assertRaises(frappe.ValidationError):
            apply_loyalty_to_invoice(invoice, 250)

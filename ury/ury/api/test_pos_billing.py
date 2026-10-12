"""Billing invariants around server-owned service and staff adjustments."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.pos_billing import _apply_staff_policy, _policy_allowance, _resolve_policy, get_invoice_billing_quote, prepare_invoice_billing


MODULE = "ury.ury.api.pos_billing"


class Invoice(frappe._dict):
    def set(self, field, value):
        self[field] = value

    def append(self, field, value):
        row = frappe._dict(value)
        self.setdefault(field, []).append(row)
        return row

    def precision(self, field):
        return 2

    def calculate_taxes_and_totals(self):
        # The fake tests only URY's ordering of adjustments. ERPNext owns the
        # tax arithmetic itself; its native calculator is exercised on site.
        before_manual = sum(item.rate * item.qty for item in self["items"])
        self.discount_amount = round(before_manual * (self.additional_discount_percentage or 0) / 100, 2)
        self.net_total = before_manual - self.discount_amount
        self.total_taxes_and_charges = sum(row.tax_amount for row in self.taxes)
        self.grand_total = self.net_total + self.total_taxes_and_charges
        self.rounded_total = self.grand_total


def invoice(order_type="Dine In", manual=0):
    return Invoice(
        name="TEST-POS-1", company="Test Co", branch="Test Branch", pos_profile="Test Profile",
        order_type=order_type, cashier="cashier@test.local", customer="Walk In",
        custom_waiter_employee="EMP-WAITER",
        additional_discount_percentage=manual, discount_amount=0,
        staff_discount_policy=None, custom_staff_discount_amount=0,
        custom_service_charge_amount=0,
        items=[frappe._dict(item_code="FOOD", qty=1, rate=100, custom_staff_policy_discount=0, is_disposable=0)],
        taxes=[],
    )


class TestServiceCharge(FrappeTestCase):
    def profile(self, enabled=1):
        return frappe._dict(
            company="Test Co", branch="Test Branch", custom_enable_service_charge=enabled,
            custom_service_charge_order_types="Dine In", custom_service_charge_percentage=10,
            custom_service_charge_payable_account="Waiter Payable - TC", cost_center="Main - TC",
        )

    def test_disabled_profile_keeps_total_unchanged(self):
        doc = invoice()
        with patch(f"{MODULE}.frappe.get_cached_doc", return_value=self.profile(0)), patch(f"{MODULE}._apply_staff_policy", return_value={"reason": "no_applicable_policy"}):
            result = prepare_invoice_billing(doc)
        self.assertEqual(result["service_charge"], 0)
        self.assertEqual(doc.grand_total, 100)
        self.assertFalse(doc["taxes"])

    def test_dine_in_charge_is_after_manual_discount_and_idempotent(self):
        doc = invoice(manual=20)
        account = frappe._dict(company="Test Co", root_type="Liability", is_group=0)
        employee = frappe._dict(status="Active", branch="Test Branch")
        with patch(f"{MODULE}.frappe.get_cached_doc", return_value=self.profile()), patch(f"{MODULE}.frappe.db.get_value", side_effect=lambda doctype, *args, **kwargs: account if doctype == "Account" else employee), patch("ury.ury.doctype.ury_order.ury_order._validate_additional_discount", return_value=20):
            first = prepare_invoice_billing(doc)
            second = prepare_invoice_billing(doc)
        self.assertEqual(first["service_charge"], 8)
        self.assertEqual(second["service_charge"], 8)
        self.assertEqual(doc.grand_total, 88)
        self.assertEqual(len(doc["taxes"]), 1)
        self.assertEqual(doc["taxes"][0].custom_is_service_charge, 1)
        self.assertEqual(doc["taxes"][0].account_head, "Waiter Payable - TC")

    def test_charge_requires_waiter_in_branch(self):
        doc = invoice(manual=20)
        doc.custom_waiter_employee = None
        account = frappe._dict(company="Test Co", root_type="Liability", is_group=0)
        with patch(f"{MODULE}.frappe.get_cached_doc", return_value=self.profile()), patch(f"{MODULE}.frappe.db.get_value", return_value=account), patch("ury.ury.doctype.ury_order.ury_order._validate_additional_discount", return_value=20):
            with self.assertRaisesRegex(frappe.ValidationError, "Assign an active waiter"):
                prepare_invoice_billing(doc)

    def test_takeaway_has_no_service_charge(self):
        doc = invoice(order_type="Take Away")
        with patch(f"{MODULE}.frappe.get_cached_doc", return_value=self.profile()), patch(f"{MODULE}._apply_staff_policy", return_value={"reason": "no_applicable_policy"}):
            result = prepare_invoice_billing(doc)
        self.assertEqual(result["service_charge"], 0)
        self.assertEqual(doc.grand_total, 100)

    def test_direct_manual_amount_without_authorised_percentage_is_rejected(self):
        doc = invoice()
        doc.discount_amount = 50
        with patch(f"{MODULE}.frappe.get_cached_doc", return_value=self.profile(0)):
            with self.assertRaises(frappe.PermissionError):
                prepare_invoice_billing(doc)


class TestStaffPolicy(FrappeTestCase):
    def test_policy_context_uses_invoice_cashier_and_documents(self):
        doc = invoice()
        doc.custom_closing_employee = "FORGED-EMPLOYEE"
        with patch("ury.ury.hooks.ury_pos_invoice._employee_for_user", return_value="REAL-EMPLOYEE") as employee_lookup, patch(f"{MODULE}.frappe.get_cached_value", return_value="Food"), patch(f"{MODULE}.get_applicable_policy", return_value=None) as resolver:
            _resolve_policy(doc)
        employee_lookup.assert_called_once_with("cashier@test.local")
        resolver.assert_called_once_with(
            customer="Walk In", employee="REAL-EMPLOYEE",
            branch="Test Branch", item_group=["Food"],
        )

    def test_fixed_discount_only_reduces_eligible_items_and_obeys_cap(self):
        doc = invoice()
        doc["items"].append(frappe._dict(item_code="DRINK", qty=1, rate=60, custom_staff_policy_discount=0, is_disposable=0))
        for item in doc["items"]:
            item.precision = lambda field: 2
        policy = frappe._dict(
            name="POLICY-1", policy_name="Food only", discount_type="Amount",
            discount_amount=50, eligible_item_groups=[frappe._dict(item_group="Food")],
        )
        with patch(f"{MODULE}._resolve_policy", return_value=(policy, "EMP-1")), patch(f"{MODULE}.frappe.get_cached_value", side_effect=lambda dt, name, field: {"FOOD": "Food", "DRINK": "Drinks"}[name]), patch(f"{MODULE}._policy_allowance", return_value=(30, 30)):
            result = _apply_staff_policy(doc)
        self.assertEqual(result["amount"], 30)
        self.assertEqual(doc["items"][0].rate, 70)
        self.assertEqual(doc["items"][1].rate, 60)
        self.assertEqual(doc.staff_discount_policy, "POLICY-1")

    def test_period_limit_is_checked_after_policy_row_lock(self):
        doc = invoice()
        policy = frappe._dict(name="POLICY-1", per_transaction_cap=40, period_cap=100, period="Daily", applies_to="Role")
        with patch(f"{MODULE}.frappe.db.sql") as sql, patch("ury.ury.hooks.ury_pos_invoice._period_to_date_discount", return_value=75):
            allowance, remaining = _policy_allowance(doc, policy, "EMP-1", lock=True)
        self.assertEqual((allowance, remaining), (25, 25))
        self.assertIn("FOR UPDATE", sql.call_args.args[0])


class TestBillingQuote(FrappeTestCase):
    def test_merged_quote_includes_both_bills_and_their_service_charges(self):
        main = frappe._dict(
            name="MAIN", docstatus=0, branch="B1", pos_profile="P1", currency="KZT",
            custom_merged_pos_invoice="SECOND", net_total=100, discount_amount=0,
            custom_staff_discount_amount=10, total_taxes_and_charges=20,
            custom_service_charge_amount=10, grand_total=120, rounded_total=120,
        )
        second = frappe._dict(
            name="SECOND", docstatus=0, branch="B1", pos_profile="P1", currency="KZT",
            net_total=50, discount_amount=0, custom_staff_discount_amount=5,
            total_taxes_and_charges=5, custom_service_charge_amount=5,
            grand_total=55, rounded_total=55,
        )
        main_result = {"policy": {"name": "POL-1", "amount": 10}, "service_charge": 10, "service_charge_percentage": 10}
        second_result = {"policy": {"name": "POL-2", "amount": 5}, "service_charge": 5, "service_charge_percentage": 10}
        with patch(f"{MODULE}.frappe.db.get_value", return_value=frappe._dict(order_type="Dine In", restaurant_table=None)), patch(
            "ury.ury.doctype.ury_order.ury_order.get_order_invoice", side_effect=[main, second]
        ), patch(
            "ury.ury.doctype.ury_order.ury_order._validate_additional_discount", return_value=0
        ), patch(f"{MODULE}.prepare_invoice_billing", side_effect=[main_result, second_result]):
            quote = get_invoice_billing_quote("MAIN", 0)
        self.assertEqual(quote["rounded_total"], 175)
        self.assertEqual(quote["service_charge"], 15)
        self.assertEqual(quote["tax_amount"], 10)
        self.assertEqual(quote["merged_policy"]["name"], "POL-2")


class TestERPNextCalculator(FrappeTestCase):
    def test_receipt_shows_policy_and_tax_exempt_service_charge(self):
        names = frappe.get_all("POS Invoice", filters={"docstatus": 1}, pluck="name", limit=1)
        if not names:
            self.skipTest("No POS invoice is available for receipt rendering")
        doc = frappe.get_doc("POS Invoice", names[0])
        doc.custom_service_charge_amount = 5
        doc.custom_staff_discount_amount = 10
        doc.staff_discount_policy = "TEST-POLICY"
        for format_name in ("URY Short Goods Receipt", "Merged POS Invoice Format"):
            template = frappe.get_doc("Print Format", format_name).html
            rendered = frappe.render_template(template, {"doc": doc})
            self.assertIn("Waiter Service", rendered)
            self.assertIn("TEST-POLICY", rendered)

    def test_full_policy_discount_survives_native_recalculation(self):
        names = frappe.get_all(
            "POS Invoice", filters={"docstatus": 1, "is_return": 0}, pluck="name", limit=5,
        )
        source = next(
            (frappe.get_doc("POS Invoice", name) for name in names), None,
        )
        if not source or not any(item.item_code and item.qty and item.rate for item in source.items):
            self.skipTest("No priced POS invoice is available for calculator verification")

        source.docstatus = 0  # In-memory only; no write or submit on site data.
        source.additional_discount_percentage = 0
        source.discount_amount = 0
        profile = frappe.get_doc(frappe.get_cached_doc("POS Profile", source.pos_profile).as_dict())
        profile.custom_enable_service_charge = 0
        cached_doc = frappe.get_cached_doc
        policy = {
            "name": "TEST-100-PERCENT", "policy_name": "Full discount",
            "discount_type": "Percentage", "discount_percentage": 100,
            "eligible_item_groups": [],
        }
        with patch(f"{MODULE}.frappe.get_cached_doc", side_effect=lambda dt, name: profile if dt == "POS Profile" else cached_doc(dt, name)), patch(f"{MODULE}.get_applicable_policy", return_value=policy):
            prepare_invoice_billing(source)
            first_amount = source.custom_staff_discount_amount
            self.assertGreater(first_amount, 0)
            self.assertTrue(all(item.rate == 0 for item in source.items if item.custom_staff_policy_discount))
            prepare_invoice_billing(source)
        self.assertEqual(source.custom_staff_discount_amount, first_amount)

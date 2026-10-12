"""Run with unittest: no Frappe test hooks, fixtures, or committed invoices."""
import unittest
from datetime import date, datetime
from unittest.mock import MagicMock, patch

import frappe

from ury.ury.api import promotions as api
from ury.ury.doctype.ury_audit_log.ury_audit_log import EVENTS


# The whitelist decorator wraps these in Frappe's argument-type validation,
# which reads request flags that exist only inside a site. These tests are
# about the logic, so they call through the wrapper.
def unwrapped(fn):
	return getattr(fn, "__wrapped__", fn)


check_coupon = unwrapped(api.check_coupon)
apply_coupon = unwrapped(api.apply_coupon)
remove_coupon = unwrapped(api.remove_coupon)
get_active_offers = unwrapped(api.get_active_offers)


def reject(message, *args, **kwargs):
	raise ValueError(message)


def coupon(**overrides):
	values = dict(
		name="WELCOME10", coupon_code="WELCOME10", description="", pricing_rule="PR-0001",
		valid_from=None, valid_upto=None, maximum_use=0, used=0, customer=None,
	)
	values.update(overrides)
	return frappe._dict(values)


class PromotionCase(unittest.TestCase):
	def setUp(self):
		self.throw = patch.object(api.frappe, "throw", side_effect=reject)
		self.throw.start()
		self.addCleanup(self.throw.stop)
		self.translate = patch.object(api, "_", side_effect=lambda value: value)
		self.translate.start()
		self.addCleanup(self.translate.stop)
		self.today = patch.object(api, "today", return_value="2026-09-21")
		self.today.start()
		self.addCleanup(self.today.stop)


class TestCheckCoupon(PromotionCase):
	def check(self, doc, code="WELCOME10", invoice=None, customer=None):
		db = MagicMock()
		db.get_value.side_effect = lambda *args, **kwargs: (
			customer if args[0] == "POS Invoice" else (doc.name if doc else None)
		)
		with patch.object(api.frappe, "db", db), \
			patch.object(api.frappe, "get_doc", return_value=doc):
			return check_coupon(code, invoice=invoice)

	def test_an_unknown_code_is_data_not_an_exception(self):
		# The cashier is typing what a guest read off a phone; a typo is the
		# normal case and must not arrive as a red error dialog.
		result = self.check(None)
		self.assertFalse(result["valid"])
		self.assertEqual(result["reason"], "unknown")

	def test_a_live_coupon_passes(self):
		result = self.check(coupon(valid_from=date(2026, 1, 1), valid_upto=date(2026, 12, 31)))
		self.assertTrue(result["valid"])
		self.assertEqual(result["pricing_rule"], "PR-0001")

	def test_a_coupon_that_has_not_started(self):
		result = self.check(coupon(valid_from=date(2026, 12, 1)))
		self.assertEqual(result["reason"], "not_started")

	def test_an_expired_coupon(self):
		result = self.check(coupon(valid_upto=date(2026, 9, 20)))
		self.assertEqual(result["reason"], "expired")

	def test_a_used_up_coupon(self):
		result = self.check(coupon(maximum_use=5, used=5))
		self.assertEqual(result["reason"], "exhausted")

	def test_remaining_uses_are_reported_when_limited(self):
		result = self.check(coupon(maximum_use=5, used=2))
		self.assertEqual(result["remaining_uses"], 3)

	def test_an_unlimited_coupon_reports_no_remaining_count(self):
		self.assertIsNone(self.check(coupon())["remaining_uses"])

	def test_another_customers_coupon_is_refused(self):
		result = self.check(
			coupon(customer="Alice"), invoice="ACC-PSINV-0001", customer="Bob"
		)
		self.assertEqual(result["reason"], "other_customer")

	def test_a_personal_coupon_on_its_owners_bill_passes(self):
		result = self.check(
			coupon(customer="Alice"), invoice="ACC-PSINV-0001", customer="Alice"
		)
		self.assertTrue(result["valid"])


class TestApplyCoupon(PromotionCase):
	def invoice(self, docstatus=0):
		doc = MagicMock()
		doc.docstatus = docstatus
		doc.grand_total = 100.0
		doc.rounded_total = 100.0
		doc.discount_amount = 0.0
		doc.net_total = 100.0
		doc.coupon_code = None
		doc.branch = "Branch 1"
		doc.pos_profile = "Profile 1"
		doc.get.return_value = []
		return doc

	def test_a_settled_bill_refuses_a_coupon(self):
		doc = self.invoice(docstatus=1)
		with patch.object(api.frappe, "get_doc", return_value=doc):
			with self.assertRaises(ValueError):
				apply_coupon("ACC-PSINV-0001", "WELCOME10")
		doc.save.assert_not_called()

	def test_an_invalid_coupon_never_touches_the_bill(self):
		doc = self.invoice()
		with patch.object(api.frappe, "get_doc", return_value=doc), \
			patch.object(api, "check_coupon", return_value={"valid": False, "reason": "expired"}):
			with self.assertRaises(ValueError):
				apply_coupon("ACC-PSINV-0001", "OLD")
		doc.save.assert_not_called()

	def test_the_totals_come_from_the_invoice_not_from_here(self):
		doc = self.invoice()

		def reprice():
			# Stand-in for ERPNext repricing the bill on save.
			doc.grand_total = 90.0
			doc.discount_amount = 10.0

		doc.save.side_effect = reprice

		with patch.object(api.frappe, "get_doc", return_value=doc), \
			patch.object(api, "check_coupon", return_value={
				"valid": True, "name": "WELCOME10", "coupon_code": "WELCOME10",
				"pricing_rule": "PR-0001"}), \
			patch.object(api, "record_event") as audit:
			totals = apply_coupon("ACC-PSINV-0001", "WELCOME10")

		self.assertEqual(totals["grand_total"], 90.0)
		self.assertEqual(totals["discount_amount"], 10.0)
		audit.assert_called_once()
		self.assertEqual(audit.call_args.args[0], "Coupon Applied")
		self.assertEqual(audit.call_args.kwargs["amount"], 10.0)

	def test_removing_a_coupon_is_recorded_too(self):
		doc = self.invoice()
		doc.coupon_code = "WELCOME10"

		with patch.object(api.frappe, "get_doc", return_value=doc), \
			patch.object(api, "record_event") as audit:
			remove_coupon("ACC-PSINV-0001")

		self.assertIsNone(doc.coupon_code)
		self.assertEqual(audit.call_args.args[0], "Coupon Removed")

	def test_removing_nothing_writes_nothing(self):
		doc = self.invoice()
		with patch.object(api.frappe, "get_doc", return_value=doc), \
			patch.object(api, "record_event") as audit:
			remove_coupon("ACC-PSINV-0001")
		doc.save.assert_not_called()
		audit.assert_not_called()


class TestActiveOffers(PromotionCase):
	def offers(self, rules, now=datetime(2026, 9, 21, 19, 0)):
		db = MagicMock()
		db.get_value.return_value = "Smart Choice Co"
		with patch.object(api.frappe, "db", db), \
			patch.object(api.frappe, "get_all", return_value=rules), \
			patch.object(api, "now_datetime", return_value=now):
			return get_active_offers(pos_profile="Profile 1")

	def test_separates_what_a_guest_must_ask_for(self):
		rules = [
			frappe._dict(name="A", coupon_code_based=0, valid_from=None, valid_upto=None),
			frappe._dict(name="B", coupon_code_based=1, valid_from=None, valid_upto=None),
		]
		result = self.offers(rules)
		self.assertEqual([r.name for r in result["automatic"]], ["A"])
		self.assertEqual([r.name for r in result["coupon"]], ["B"])

	def test_a_rule_with_no_dates_runs_today(self):
		rules = [frappe._dict(name="A", coupon_code_based=0, valid_from=None, valid_upto=None)]
		self.assertEqual(len(self.offers(rules)["automatic"]), 1)

	def test_an_expired_rule_is_not_offered(self):
		rules = [frappe._dict(name="A", coupon_code_based=0, valid_from=None,
							  valid_upto=date(2026, 9, 1))]
		self.assertEqual(self.offers(rules)["automatic"], [])

	def test_a_future_rule_is_not_offered(self):
		rules = [frappe._dict(name="A", coupon_code_based=0, valid_from=date(2026, 10, 1),
							  valid_upto=None)]
		self.assertEqual(self.offers(rules)["automatic"], [])


class TestAuditEvents(unittest.TestCase):
	def test_the_coupon_events_are_registered(self):
		# A typo at the call site would otherwise write a row no filter finds.
		self.assertIn("Coupon Applied", EVENTS)
		self.assertIn("Coupon Removed", EVENTS)


if __name__ == "__main__":
	unittest.main()

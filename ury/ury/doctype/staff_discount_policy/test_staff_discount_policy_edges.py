# Copyright (c) 2026, Safwan Erooth and contributors
# See license.txt
"""Edge-case tests for get_applicable_policy (staff_discount_policy.py) not
covered by test_staff_discount_policy.py: validity windows, disabled-policy
exclusion, deterministic overlapping-policy resolution order, discount
bounds validation, and the fact that the resolver is no longer an HTTP
endpoint.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import getdate

from ury.ury.doctype.staff_discount_policy.staff_discount_policy import (
	StaffDiscountPolicy,
	get_applicable_policy,
)

MODULE = "ury.ury.doctype.staff_discount_policy.staff_discount_policy"


def _policy(**kwargs):
	defaults = {
		"valid_from": None,
		"valid_to": None,
		"applies_to": "Role",
		"role": None,
		"employee_group": None,
		"customer_group": None,
		"eligible_item_groups": [],
		"branch": None,
		"enabled": 1,
	}
	defaults.update(kwargs)
	return frappe._dict(defaults)


class TestGetApplicablePolicyValidityWindow(FrappeTestCase):
	"""get_applicable_policy filters candidates by _is_within_validity(policy,
	today) inline (staff_discount_policy.py ~line 92), before eligibility is
	even checked -- confirm expired/not-yet-valid policies are excluded end
	to end, not just at the _is_within_validity() unit level.
	"""

	def test_not_yet_valid_policy_excluded(self):
		future_policy = _policy(
			applies_to="Role", role="Cashier", valid_from=getdate().replace(year=getdate().year + 1)
		)

		with patch(f"{MODULE}.frappe.get_all", return_value=["FUTURE"]), \
			patch(f"{MODULE}.frappe.get_doc", return_value=future_policy), \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001")

		self.assertIsNone(result)

	def test_expired_policy_excluded(self):
		expired_policy = _policy(
			applies_to="Role", role="Cashier", valid_to=getdate().replace(year=getdate().year - 1)
		)

		with patch(f"{MODULE}.frappe.get_all", return_value=["EXPIRED"]), \
			patch(f"{MODULE}.frappe.get_doc", return_value=expired_policy), \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001")

		self.assertIsNone(result)


class TestGetApplicablePolicyDisabledExclusion(FrappeTestCase):
	"""Disabled policies are excluded purely by the {"enabled": 1} filter
	passed to frappe.get_all (staff_discount_policy.py ~line 82) -- they
	never reach get_doc/candidate scoring at all. Assert that filter is what
	is actually sent, and that with no enabled policies at all (as a real
	`enabled=1` filter would yield for an all-disabled table) the resolver
	returns None.
	"""

	def test_enabled_filter_is_sent_to_get_all(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=[]) as mock_get_all:
			get_applicable_policy(employee="EMP-0001")

		mock_get_all.assert_called_once_with(
			"Staff Discount Policy",
			filters={"enabled": 1},
			pluck="name",
			order_by="creation asc, name asc",
		)

	def test_no_enabled_policies_returns_none_even_with_matching_role(self):
		# Simulates an all-disabled table: get_all with filters={"enabled": 1}
		# yields nothing, so a would-be-matching disabled policy is never
		# even loaded via get_doc.
		with patch(f"{MODULE}.frappe.get_all", return_value=[]), \
			patch(f"{MODULE}.frappe.get_doc") as mock_get_doc, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001")

		self.assertIsNone(result)
		mock_get_doc.assert_not_called()


class TestGetApplicablePolicyOverlappingPolicies(FrappeTestCase):
	"""Two enabled, valid, equally branch-specific policies that both match
	the same eligibility -- which one wins?

	Fixed behaviour (staff_discount_policy.py): frappe.get_all is called
	with order_by="creation asc, name asc", so among candidates of equal
	branch-specificity the resolver always keeps DB order and
	`candidates[0]` / `branch_specific[0]` is deterministically the oldest
	matching policy (ties broken by name), regardless of any other
	iteration order frappe.get_all might otherwise return.
	"""

	def test_oldest_of_two_overlapping_global_policies_wins(self):
		policy_a = _policy(applies_to="Role", role="Cashier")
		policy_b = _policy(applies_to="Role", role="Cashier")
		policy_a.as_dict = lambda: {"name": "POLICY-A", **policy_a}
		policy_b.as_dict = lambda: {"name": "POLICY-B", **policy_b}

		def _get_doc(doctype, name):
			return {"POLICY-A": policy_a, "POLICY-B": policy_b}[name]

		# frappe.get_all is mocked to return names already in
		# "creation asc, name asc" order, as the real order_by would --
		# POLICY-A (the oldest) comes first and wins.
		with patch(f"{MODULE}.frappe.get_all", return_value=["POLICY-A", "POLICY-B"]) as mock_get_all, \
			patch(f"{MODULE}.frappe.get_doc", side_effect=_get_doc), \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001")

		mock_get_all.assert_called_once_with(
			"Staff Discount Policy",
			filters={"enabled": 1},
			pluck="name",
			order_by="creation asc, name asc",
		)
		self.assertEqual(result["name"], "POLICY-A")

	def test_oldest_of_two_overlapping_branch_specific_policies_wins(self):
		policy_a = _policy(applies_to="Role", role="Cashier", branch="Branch A")
		policy_b = _policy(applies_to="Role", role="Cashier", branch="Branch A")
		policy_a.as_dict = lambda: {"name": "BRANCH-A-1", **policy_a}
		policy_b.as_dict = lambda: {"name": "BRANCH-A-2", **policy_b}

		def _get_doc(doctype, name):
			return {"BRANCH-A-1": policy_a, "BRANCH-A-2": policy_b}[name]

		# BRANCH-A-1 is the oldest (first in creation/name order) and must
		# win regardless of which policy has "nicer" attributes.
		with patch(f"{MODULE}.frappe.get_all", return_value=["BRANCH-A-1", "BRANCH-A-2"]), \
			patch(f"{MODULE}.frappe.get_doc", side_effect=_get_doc), \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001", branch="Branch A")

		self.assertEqual(result["name"], "BRANCH-A-1")


class TestStaffDiscountPolicyDiscountBoundsValidation(FrappeTestCase):
	"""StaffDiscountPolicy.validate() now enforces bounds on
	discount_percentage (0..100 when discount_type == "Percentage"),
	rejects negative discount_amount/per_transaction_cap/period_cap, and
	rejects valid_to before valid_from. Boundary values 0 and 100 must
	still be accepted.
	"""

	def test_document_class_has_a_validate_method(self):
		self.assertIn("validate", StaffDiscountPolicy.__dict__)

	def _make_unsaved_policy(self, discount_percentage=None, **kwargs):
		doc_dict = {
			"doctype": "Staff Discount Policy",
			"policy_name": "Edge Case Policy",
			"applies_to": "Role",
			"role": "Cashier",
			"discount_type": "Percentage",
		}
		if discount_percentage is not None:
			doc_dict["discount_percentage"] = discount_percentage
		doc_dict.update(kwargs)
		return frappe.get_doc(doc_dict)

	def test_zero_discount_percentage_is_accepted(self):
		doc = self._make_unsaved_policy(0)
		doc.run_method("validate")
		self.assertEqual(doc.discount_percentage, 0)

	def test_hundred_discount_percentage_is_accepted(self):
		doc = self._make_unsaved_policy(100)
		doc.run_method("validate")
		self.assertEqual(doc.discount_percentage, 100)

	def test_negative_discount_percentage_is_rejected(self):
		doc = self._make_unsaved_policy(-10)
		with self.assertRaises(frappe.ValidationError):
			doc.run_method("validate")

	def test_over_100_discount_percentage_is_rejected(self):
		doc = self._make_unsaved_policy(150)
		with self.assertRaises(frappe.ValidationError):
			doc.run_method("validate")

	def test_negative_discount_amount_is_rejected(self):
		doc = self._make_unsaved_policy(
			discount_type="Fixed Amount", discount_amount=-5
		)
		with self.assertRaises(frappe.ValidationError):
			doc.run_method("validate")

	def test_negative_per_transaction_cap_is_rejected(self):
		doc = self._make_unsaved_policy(50, per_transaction_cap=-1)
		with self.assertRaises(frappe.ValidationError):
			doc.run_method("validate")

	def test_negative_period_cap_is_rejected(self):
		doc = self._make_unsaved_policy(50, period_cap=-1)
		with self.assertRaises(frappe.ValidationError):
			doc.run_method("validate")

	def test_valid_to_before_valid_from_is_rejected(self):
		doc = self._make_unsaved_policy(
			50, valid_from="2026-06-01", valid_to="2026-01-01"
		)
		with self.assertRaises(frappe.ValidationError):
			doc.run_method("validate")

	def test_valid_to_on_or_after_valid_from_is_accepted(self):
		doc = self._make_unsaved_policy(
			50, valid_from="2026-01-01", valid_to="2026-06-01"
		)
		doc.run_method("validate")
		self.assertEqual(str(doc.valid_to), "2026-06-01")


class TestGetApplicablePolicyNotWhitelisted(FrappeTestCase):
	"""get_applicable_policy has no frontend caller (it is only used
	server-side from ury/ury/hooks/ury_pos_invoice.py), so the
	@frappe.whitelist() decorator has been removed: it must no longer be
	reachable as an HTTP endpoint, while remaining a plain importable
	Python function with the same signature and behaviour.
	"""

	def test_function_is_not_whitelisted(self):
		# frappe.whitelisted (frappe v15) collects every function decorated
		# with @frappe.whitelist(); get_applicable_policy must not be in it.
		self.assertNotIn(get_applicable_policy, frappe.whitelisted)

	def test_resolver_still_works_as_a_plain_function_call(self):
		policy = _policy(applies_to="Role", role="Cashier")
		policy.as_dict = lambda: {
			"name": "POLICY-1",
			"discount_percentage": 25,
			**policy,
		}

		with patch(f"{MODULE}.frappe.get_all", return_value=["POLICY-1"]), \
			patch(f"{MODULE}.frappe.get_doc", return_value=policy), \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001")

		self.assertIsNotNone(result)
		self.assertEqual(result["name"], "POLICY-1")
		self.assertEqual(result["discount_percentage"], 25)

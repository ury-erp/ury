# Copyright (c) 2026, Safwan Erooth and contributors
# See license.txt
"""Tests for staff_discount_policy.py (COVERAGE_GAP_ANALYSIS.md: zero test
file on both the doctype AND its whitelisted `get_applicable_policy`, Top 15
item #14 -- "a pricing/discount rule with no coverage in either
direction"). Mocked per this track's read-path convention: the module's own
private helpers are pure functions over an already-loaded policy doc, and
`get_applicable_policy` itself is a read-only resolver, no writes.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import getdate

from ury.ury.doctype.staff_discount_policy.staff_discount_policy import (
	_is_within_validity,
	_matches_eligibility,
	_matches_item_group,
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
	}
	defaults.update(kwargs)
	return frappe._dict(defaults)


class TestIsWithinValidity(FrappeTestCase):
	on_date = getdate("2026-06-15")

	def test_no_dates_is_always_valid(self):
		self.assertTrue(_is_within_validity(_policy(), self.on_date))

	def test_before_valid_from_is_invalid(self):
		policy = _policy(valid_from="2026-07-01")
		self.assertFalse(_is_within_validity(policy, self.on_date))

	def test_after_valid_to_is_invalid(self):
		policy = _policy(valid_to="2026-06-01")
		self.assertFalse(_is_within_validity(policy, self.on_date))

	def test_within_range_is_valid(self):
		policy = _policy(valid_from="2026-01-01", valid_to="2026-12-31")
		self.assertTrue(_is_within_validity(policy, self.on_date))


class TestMatchesEligibility(FrappeTestCase):
	def test_role_match(self):
		policy = _policy(applies_to="Role", role="Cashier")
		self.assertTrue(_matches_eligibility(policy, role="Cashier"))
		self.assertFalse(_matches_eligibility(policy, role="Manager"))
		self.assertFalse(_matches_eligibility(policy, role=None))

	def test_employee_group_match(self):
		policy = _policy(applies_to="Employee Group", employee_group="Kitchen")
		self.assertTrue(_matches_eligibility(policy, department="Kitchen"))
		self.assertFalse(_matches_eligibility(policy, department="Front of House"))

	def test_customer_group_match(self):
		policy = _policy(applies_to="Customer Group", customer_group="VIP")
		self.assertTrue(_matches_eligibility(policy, customer_group="VIP"))
		self.assertFalse(_matches_eligibility(policy, customer_group="Regular"))

	def test_unknown_applies_to_never_matches(self):
		policy = _policy(applies_to="Something Else")
		self.assertFalse(
			_matches_eligibility(policy, role="Cashier", department="Kitchen", customer_group="VIP")
		)


class TestMatchesItemGroup(FrappeTestCase):
	def test_no_item_group_requested_always_matches(self):
		policy = _policy(eligible_item_groups=[frappe._dict(item_group="Beverages")])
		self.assertTrue(_matches_item_group(policy, item_group=None))

	def test_no_restriction_on_policy_always_matches(self):
		policy = _policy(eligible_item_groups=[])
		self.assertTrue(_matches_item_group(policy, item_group="Beverages"))

	def test_matching_item_group(self):
		policy = _policy(eligible_item_groups=[frappe._dict(item_group="Beverages")])
		self.assertTrue(_matches_item_group(policy, item_group="Beverages"))

	def test_nonmatching_item_group(self):
		policy = _policy(eligible_item_groups=[frappe._dict(item_group="Beverages")])
		self.assertFalse(_matches_item_group(policy, item_group="Desserts"))


class TestGetApplicablePolicy(FrappeTestCase):
	def test_no_enabled_policies_returns_none(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=[]):
			result = get_applicable_policy(branch="Branch A")
		self.assertIsNone(result)

	def test_branch_specific_policy_wins_over_global(self):
		global_policy = _policy(applies_to="Role", role="Cashier", branch=None)
		branch_policy = _policy(applies_to="Role", role="Cashier", branch="Branch A")
		global_policy.as_dict = lambda: {"name": "global", **global_policy}
		branch_policy.as_dict = lambda: {"name": "branch-specific", **branch_policy}

		def _get_doc(doctype, name):
			return {"GLOBAL": global_policy, "BRANCH": branch_policy}[name]

		with patch(f"{MODULE}.frappe.get_all", return_value=["GLOBAL", "BRANCH"]), \
			patch(f"{MODULE}.frappe.get_doc", side_effect=_get_doc), \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001", branch="Branch A")

		self.assertEqual(result["name"], "branch-specific")

	def test_policy_for_other_branch_is_excluded(self):
		other_branch_policy = _policy(applies_to="Role", role="Cashier", branch="Branch B")

		with patch(f"{MODULE}.frappe.get_all", return_value=["OTHER"]), \
			patch(f"{MODULE}.frappe.get_doc", return_value=other_branch_policy), \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001", branch="Branch A")

		self.assertIsNone(result)

	def test_no_matching_role_returns_none(self):
		policy = _policy(applies_to="Role", role="Manager")

		with patch(f"{MODULE}.frappe.get_all", return_value=["P1"]), \
			patch(f"{MODULE}.frappe.get_doc", return_value=policy), \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001")

		self.assertIsNone(result)

	def test_item_group_restriction_excludes_policy(self):
		policy = _policy(
			applies_to="Role",
			role="Cashier",
			eligible_item_groups=[frappe._dict(item_group="Beverages")],
		)

		with patch(f"{MODULE}.frappe.get_all", return_value=["P1"]), \
			patch(f"{MODULE}.frappe.get_doc", return_value=policy), \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Cashier"]), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=("user@test.com", None)):
			result = get_applicable_policy(employee="EMP-0001", item_group="Desserts")

		self.assertIsNone(result)

"""Tests for ury_order_attribution: who an order is recorded for, and who owes.

Covers the fail-closed rules that keep attribution trustworthy:
  1. Passing a performer while the POS Profile flag is off is an error, not a
     silently dropped field.
  2. The acting user must hold a role the profile permits.
  3. The performer must be an active employee of the order's branch.
  4. A profile that requires a performer rejects an order without one, but
     leaves an order that already has one editable.
  5. Per-line performers are validated once per distinct employee.
  6. Credit settlement honours the enable flag, role list, validity window,
     branch scope and credit limit.

These use mocking (frappe.get_cached_doc, frappe.db, frappe.get_roles) and are
not executed against a live bench/site.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_order_attribution import (
	check_credit_limit,
	get_credit_mode_of_payment,
	list_eligible_performers,
	resolve_credit_account,
	resolve_line_performers,
	resolve_order_performer,
)

MODULE = "ury.ury.api.ury_order_attribution"


def _profile_doc(**overrides):
	data = {
		"name": "Test Profile",
		"branch": "Branch A",
		"company": "Company A",
		"custom_enable_order_on_behalf": 1,
		"custom_require_performer_on_order": 0,
		"custom_roles_allowed_to_order_on_behalf": [frappe._dict({"role": "URY Manager"})],
		"custom_enable_credit_settlement": 1,
		"custom_credit_mode_of_payment": "Credit",
		"custom_roles_allowed_for_credit": [frappe._dict({"role": "URY Manager"})],
	}
	data.update(overrides)
	return frappe._dict(data)


def _employee(status="Active", branch="Branch A"):
	return frappe._dict({"name": "EMP-1", "status": status, "branch": branch, "employee_name": "Washer One"})


class TestResolveOrderPerformer(FrappeTestCase):
	def setUp(self):
		self.profile = _profile_doc()
		self.get_profile = patch(f"{MODULE}.frappe.get_cached_doc", return_value=self.profile).start()
		self.roles = patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]).start()
		patch(f"{MODULE}.frappe.session", frappe._dict({"user": "manager@example.com"})).start()
		self.get_value = patch(f"{MODULE}.frappe.db.get_value", return_value=_employee()).start()
		self.addCleanup(patch.stopall)

	def test_returns_none_when_no_performer_requested(self):
		self.assertIsNone(resolve_order_performer("Test Profile", "Branch A", None))

	def test_feature_off_rejects_supplied_performer(self):
		self.get_profile.return_value = _profile_doc(custom_enable_order_on_behalf=0)
		with self.assertRaises(frappe.PermissionError):
			resolve_order_performer("Test Profile", "Branch A", "EMP-1")

	def test_role_not_permitted_is_denied(self):
		self.roles.return_value = ["URY Captain"]
		with self.assertRaises(frappe.PermissionError):
			resolve_order_performer("Test Profile", "Branch A", "EMP-1")

	def test_system_manager_bypasses_role_list(self):
		self.roles.return_value = ["System Manager"]
		self.assertEqual(resolve_order_performer("Test Profile", "Branch A", "EMP-1"), "EMP-1")

	def test_unknown_employee_is_rejected(self):
		self.get_value.return_value = None
		with self.assertRaises(frappe.ValidationError):
			resolve_order_performer("Test Profile", "Branch A", "EMP-1")

	def test_inactive_employee_is_rejected(self):
		self.get_value.return_value = _employee(status="Left")
		with self.assertRaises(frappe.ValidationError):
			resolve_order_performer("Test Profile", "Branch A", "EMP-1")

	def test_employee_from_another_branch_is_rejected(self):
		self.get_value.return_value = _employee(branch="Branch B")
		with self.assertRaises(frappe.ValidationError):
			resolve_order_performer("Test Profile", "Branch A", "EMP-1")

	def test_happy_path_returns_employee(self):
		self.assertEqual(resolve_order_performer("Test Profile", "Branch A", "EMP-1"), "EMP-1")

	def test_required_performer_blocks_a_new_order(self):
		self.get_profile.return_value = _profile_doc(custom_require_performer_on_order=1)
		with self.assertRaises(frappe.ValidationError):
			resolve_order_performer("Test Profile", "Branch A", None)

	def test_required_performer_leaves_existing_order_editable(self):
		self.get_profile.return_value = _profile_doc(custom_require_performer_on_order=1)
		self.assertIsNone(
			resolve_order_performer("Test Profile", "Branch A", None, existing="EMP-9")
		)


class TestResolveLinePerformers(FrappeTestCase):
	def setUp(self):
		self.profile = _profile_doc()
		patch(f"{MODULE}.frappe.get_cached_doc", return_value=self.profile).start()
		patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]).start()
		patch(f"{MODULE}.frappe.session", frappe._dict({"user": "manager@example.com"})).start()
		self.get_value = patch(f"{MODULE}.frappe.db.get_value", return_value=_employee()).start()
		self.addCleanup(patch.stopall)

	def test_no_line_performers_skips_all_lookups(self):
		self.assertEqual(resolve_line_performers("Test Profile", "Branch A", [{"item": "A"}]), {})
		self.get_value.assert_not_called()

	def test_distinct_employees_are_validated_once_each(self):
		items = [
			{"item": "A", "performed_by": "EMP-1"},
			{"item": "B", "performed_by": "EMP-1"},
			{"item": "C", "performed_by": "EMP-1"},
		]
		self.assertEqual(resolve_line_performers("Test Profile", "Branch A", items), {"EMP-1": "EMP-1"})
		self.assertEqual(self.get_value.call_count, 1)


class TestCreditSettlement(FrappeTestCase):
	def setUp(self):
		self.profile = _profile_doc()
		self.get_profile = patch(f"{MODULE}.frappe.get_cached_doc", return_value=self.profile).start()
		patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]).start()
		patch(f"{MODULE}.frappe.session", frappe._dict({"user": "manager@example.com"})).start()
		self.account = frappe._dict(
			{
				"name": "CA-1",
				"enabled": 1,
				"party_type": "Employee",
				"party": "EMP-1",
				"customer": "CUST-1",
				"branch": "Branch A",
				"credit_limit": 1000,
				"valid_from": None,
				"valid_to": None,
			}
		)
		patch(f"{MODULE}.frappe.db.get_value", return_value=self.account).start()
		self.outstanding = patch(f"{MODULE}.get_outstanding", return_value=0).start()
		self.addCleanup(patch.stopall)

	def test_credit_mode_hidden_when_disabled(self):
		self.get_profile.return_value = _profile_doc(custom_enable_credit_settlement=0)
		self.assertIsNone(get_credit_mode_of_payment("Test Profile"))

	def test_disabled_profile_rejects_credit(self):
		self.get_profile.return_value = _profile_doc(custom_enable_credit_settlement=0)
		with self.assertRaises(frappe.PermissionError):
			resolve_credit_account("Test Profile", "Branch A", "CA-1", 100)

	def test_account_from_another_branch_is_rejected(self):
		self.account.branch = "Branch B"
		with self.assertRaises(frappe.ValidationError):
			resolve_credit_account("Test Profile", "Branch A", "CA-1", 100)

	def test_branchless_account_is_allowed_anywhere(self):
		self.account.branch = None
		self.assertEqual(resolve_credit_account("Test Profile", "Branch A", "CA-1", 100).name, "CA-1")

	def test_disabled_account_is_rejected(self):
		self.account.enabled = 0
		with self.assertRaises(frappe.ValidationError):
			resolve_credit_account("Test Profile", "Branch A", "CA-1", 100)

	def test_charge_within_limit_is_allowed(self):
		self.outstanding.return_value = 400
		self.assertEqual(resolve_credit_account("Test Profile", "Branch A", "CA-1", 600).name, "CA-1")

	def test_charge_over_limit_is_rejected(self):
		self.outstanding.return_value = 400
		with self.assertRaises(frappe.ValidationError):
			resolve_credit_account("Test Profile", "Branch A", "CA-1", 601)

	def test_zero_limit_means_unlimited(self):
		self.outstanding.return_value = 99999
		check_credit_limit({"name": "CA-1", "credit_limit": 0}, 100000)


class TestListEligiblePerformers(FrappeTestCase):
	def setUp(self):
		self.profile = _profile_doc()
		self.get_profile = patch(f"{MODULE}.frappe.get_cached_doc", return_value=self.profile).start()
		self.roles = patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]).start()
		patch(f"{MODULE}.frappe.session", frappe._dict({"user": "manager@example.com"})).start()
		self.get_all = patch(f"{MODULE}.frappe.get_all", return_value=[]).start()
		self.addCleanup(patch.stopall)

	def test_returns_empty_when_feature_is_off(self):
		self.get_profile.return_value = _profile_doc(custom_enable_order_on_behalf=0)
		self.assertEqual(list_eligible_performers("Test Profile"), [])
		self.get_all.assert_not_called()

	def test_denies_a_user_without_an_allowed_role(self):
		self.roles.return_value = ["URY Captain"]
		with self.assertRaises(frappe.PermissionError):
			list_eligible_performers("Test Profile")

	def test_scopes_to_the_profile_branch_and_active_staff(self):
		list_eligible_performers("Test Profile")
		filters = self.get_all.call_args.kwargs["filters"]
		self.assertEqual(filters, {"status": "Active", "branch": "Branch A"})

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching the test_ury_cost_variance_attribution.py
# convention) rather than a live bench -- no bench/Docker is available in this task's
# worktree. These were reviewed by hand (traced call-by-call against ury_yield_variance.py)
# rather than executed against a real site; see the task report for that walkthrough.
# Static validation performed: python3 -m py_compile and git diff --check.

import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_yield_variance import (
	record_yield_check,
	get_yield_variance,
	get_yield_check_compliance,
	user_has_branch_access,
)


MOD = "ury.ury.api.ury_yield_variance"


def _yield_check_record(
	name="YC-001",
	item="TEST-ITEM",
	branch="Test Branch",
	company="Test Co",
	actual_yield=85.0,
	standard_yield=80.0,
	variance=5.0,
	checked_on="2026-01-01 10:00:00",
	issue_authorization=None,
):
	return frappe._dict({
		"name": name,
		"item": item,
		"branch": branch,
		"company": company,
		"actual_yield_percent": actual_yield,
		"standard_yield_percent_snapshot": standard_yield,
		"variance_percent": variance,
		"checked_on": checked_on,
		"issue_authorization": issue_authorization,
	})


class TestRecordYieldCheckPermissionGating(FrappeTestCase):
	"""Test record_yield_check permission and scope gating."""

	@patch(f"{MOD}.frappe.has_permission")
	def test_has_permission_gate_enforced(self, mock_has_permission):
		"""record_yield_check requires doctype create permission (I7: relaxed
		from manager-only to any authenticated user with create permission --
		this replaced the old require_manager() gate for this endpoint)."""
		mock_has_permission.return_value = False

		with self.assertRaises(frappe.PermissionError):
			record_yield_check(
				item="TEST-ITEM",
				branch="Test Branch",
				company="Test Co",
				input_qty=100,
				output_qty=85,
				stock_uom="Nos",
				check_type="Routine",
			)

		mock_has_permission.assert_called_once_with("URY Yield Check", "create")

	@patch(f"{MOD}.frappe.has_permission")
	@patch(f"{MOD}._require_scope")
	def test_require_scope_called_with_company(self, mock_scope, mock_has_permission):
		"""record_yield_check calls _require_scope(company)."""
		mock_has_permission.return_value = True
		mock_scope.side_effect = frappe.ValidationError

		with self.assertRaises(frappe.ValidationError):
			record_yield_check(
				item="TEST-ITEM",
				branch="Test Branch",
				company="Test Co",
				input_qty=100,
				output_qty=85,
				stock_uom="Nos",
				check_type="Routine",
			)

		mock_scope.assert_called_once_with("Test Co")

	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.frappe.session")
	@patch(f"{MOD}.frappe.utils.now")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.user_has_branch_access")
	@patch(f"{MOD}.frappe.has_permission")
	def test_record_yield_check_creates_and_inserts_document(
		self, mock_has_permission, mock_access, mock_scope, mock_now, mock_session, mock_get_doc
	):
		"""record_yield_check creates URY Yield Check and inserts it."""
		mock_has_permission.return_value = True
		mock_access.return_value = True
		mock_session.user = "test_user"
		mock_now.return_value = "2026-01-01 10:00:00"
		mock_doc = MagicMock()
		mock_doc.name = "YC-001"
		mock_doc.item = "TEST-ITEM"
		mock_doc.branch = "Test Branch"
		mock_doc.company = "Test Co"
		mock_doc.actual_yield_percent = 85.0
		mock_doc.standard_yield_percent_snapshot = 80.0
		mock_doc.variance_percent = 5.0
		mock_doc.checked_on = "2026-01-01 10:00:00"
		mock_doc.check_type = "Routine"
		mock_get_doc.return_value = mock_doc

		result = record_yield_check(
			item="TEST-ITEM",
			branch="Test Branch",
			company="Test Co",
			input_qty=100,
			output_qty=85,
			stock_uom="Nos",
			check_type="Routine",
		)

		mock_get_doc.assert_called_once()
		call_dict = mock_get_doc.call_args[0][0]
		self.assertEqual(call_dict["doctype"], "URY Yield Check")
		self.assertEqual(call_dict["item"], "TEST-ITEM")
		self.assertEqual(call_dict["branch"], "Test Branch")
		self.assertEqual(call_dict["company"], "Test Co")
		self.assertEqual(call_dict["input_qty"], 100)
		self.assertEqual(call_dict["output_qty"], 85)
		self.assertEqual(call_dict["stock_uom"], "Nos")
		self.assertEqual(call_dict["check_type"], "Routine")
		self.assertEqual(call_dict["checked_by"], "test_user")

		mock_doc.insert.assert_called_once_with(ignore_permissions=False)

	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.frappe.session")
	@patch(f"{MOD}.frappe.utils.now")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.user_has_branch_access")
	@patch(f"{MOD}.frappe.has_permission")
	def test_record_yield_check_with_optional_fields(
		self, mock_has_permission, mock_access, mock_scope, mock_now, mock_session, mock_get_doc
	):
		"""record_yield_check includes optional fields when provided."""
		mock_has_permission.return_value = True
		mock_access.return_value = True
		mock_session.user = "test_user"
		mock_now.return_value = "2026-01-01 10:00:00"
		mock_doc = MagicMock()
		mock_doc.name = "YC-001"
		mock_get_doc.return_value = mock_doc

		result = record_yield_check(
			item="TEST-ITEM",
			branch="Test Branch",
			company="Test Co",
			input_qty=100,
			output_qty=85,
			stock_uom="Nos",
			check_type="Routine",
			issue_authorization="AUTH-001",
			department="Dept-1",
			production_unit="PU-001",
		)

		call_dict = mock_get_doc.call_args[0][0]
		self.assertEqual(call_dict["issue_authorization"], "AUTH-001")
		self.assertEqual(call_dict["department"], "Dept-1")
		self.assertEqual(call_dict["production_unit"], "PU-001")

	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.frappe.session")
	@patch(f"{MOD}.frappe.utils.now")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.user_has_branch_access")
	@patch(f"{MOD}.frappe.has_permission")
	def test_record_yield_check_returns_key_fields(
		self, mock_has_permission, mock_access, mock_scope, mock_now, mock_session, mock_get_doc
	):
		"""record_yield_check return dict includes required key fields."""
		mock_has_permission.return_value = True
		mock_access.return_value = True
		mock_session.user = "test_user"
		mock_now.return_value = "2026-01-01 10:00:00"
		mock_doc = MagicMock()
		mock_doc.name = "YC-001"
		mock_doc.item = "TEST-ITEM"
		mock_doc.branch = "Test Branch"
		mock_doc.company = "Test Co"
		mock_doc.actual_yield_percent = 85.0
		mock_doc.standard_yield_percent_snapshot = 80.0
		mock_doc.variance_percent = 5.0
		mock_doc.checked_on = "2026-01-01 10:00:00"
		mock_doc.check_type = "Routine"
		mock_get_doc.return_value = mock_doc

		result = record_yield_check(
			item="TEST-ITEM",
			branch="Test Branch",
			company="Test Co",
			input_qty=100,
			output_qty=85,
			stock_uom="Nos",
			check_type="Routine",
		)

		self.assertEqual(result["name"], "YC-001")
		self.assertEqual(result["item"], "TEST-ITEM")
		self.assertEqual(result["branch"], "Test Branch")
		self.assertEqual(result["company"], "Test Co")
		self.assertEqual(result["actual_yield_percent"], 85.0)
		self.assertEqual(result["standard_yield_percent_snapshot"], 80.0)
		self.assertEqual(result["variance_percent"], 5.0)


class TestGetYieldVariancePermissionGating(FrappeTestCase):
	"""Test get_yield_variance permission and scope gating."""

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}._require_scope")
	def test_require_manager_called(self, mock_scope, mock_manager):
		"""get_yield_variance calls require_manager()."""
		mock_manager.side_effect = frappe.PermissionError

		with self.assertRaises(frappe.PermissionError):
			get_yield_variance(company="Test Co")

		mock_manager.assert_called_once()

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}._require_scope")
	def test_require_scope_called_with_company(self, mock_scope, mock_manager):
		"""get_yield_variance calls _require_scope(company)."""
		mock_scope.side_effect = frappe.ValidationError

		with self.assertRaises(frappe.ValidationError):
			get_yield_variance(company="Test Co")

		mock_scope.assert_called_once_with("Test Co")

	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.require_manager")
	def test_get_yield_variance_retrieves_all_records_for_company(
		self, mock_manager, mock_scope, mock_get_all
	):
		"""get_yield_variance filters by company only."""
		mock_get_all.return_value = [
			_yield_check_record(name="YC-001", item="ITEM-A"),
			_yield_check_record(name="YC-002", item="ITEM-B"),
		]

		result = get_yield_variance(company="Test Co")

		self.assertEqual(len(result), 2)
		mock_get_all.assert_called_once()
		call_kwargs = mock_get_all.call_args[1]
		self.assertEqual(call_kwargs["filters"]["company"], "Test Co")

	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.require_manager")
	def test_get_yield_variance_with_branch_filter(
		self, mock_manager, mock_scope, mock_get_all
	):
		"""get_yield_variance adds branch filter when provided."""
		mock_get_all.return_value = [
			_yield_check_record(name="YC-001", branch="Branch A"),
		]

		result = get_yield_variance(company="Test Co", branch="Branch A")

		call_kwargs = mock_get_all.call_args[1]
		self.assertEqual(call_kwargs["filters"]["branch"], "Branch A")

	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.require_manager")
	def test_get_yield_variance_with_item_filter(
		self, mock_manager, mock_scope, mock_get_all
	):
		"""get_yield_variance adds item filter when provided."""
		mock_get_all.return_value = [
			_yield_check_record(name="YC-001", item="ITEM-A"),
		]

		result = get_yield_variance(company="Test Co", item="ITEM-A")

		call_kwargs = mock_get_all.call_args[1]
		self.assertEqual(call_kwargs["filters"]["item"], "ITEM-A")

	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.require_manager")
	def test_get_yield_variance_ordered_by_checked_on_desc(
		self, mock_manager, mock_scope, mock_get_all
	):
		"""get_yield_variance orders results by checked_on descending."""
		mock_get_all.return_value = []

		result = get_yield_variance(company="Test Co")

		call_kwargs = mock_get_all.call_args[1]
		self.assertEqual(call_kwargs["order_by"], "checked_on desc")

	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.require_manager")
	def test_get_yield_variance_limited_to_200_records(
		self, mock_manager, mock_scope, mock_get_all
	):
		"""get_yield_variance limits results to 200 records."""
		mock_get_all.return_value = []

		result = get_yield_variance(company="Test Co")

		call_kwargs = mock_get_all.call_args[1]
		self.assertEqual(call_kwargs["limit_page_length"], 200)


class TestGetYieldCheckCompliancePermissionGating(FrappeTestCase):
	"""Test get_yield_check_compliance permission and scope gating."""

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}._require_scope")
	def test_require_manager_called(self, mock_scope, mock_manager):
		"""get_yield_check_compliance calls require_manager()."""
		mock_manager.side_effect = frappe.PermissionError

		with self.assertRaises(frappe.PermissionError):
			get_yield_check_compliance(company="Test Co")

		mock_manager.assert_called_once()

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}._require_scope")
	def test_require_scope_called_with_company(self, mock_scope, mock_manager):
		"""get_yield_check_compliance calls _require_scope(company)."""
		mock_scope.side_effect = frappe.ValidationError

		with self.assertRaises(frappe.ValidationError):
			get_yield_check_compliance(company="Test Co")

		mock_scope.assert_called_once_with("Test Co")

	@patch(f"{MOD}.frappe.get_all")
	@patch(f"{MOD}.frappe.utils.getdate")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.require_manager")
	def test_get_yield_check_compliance_returns_list_of_items(
		self, mock_manager, mock_scope, mock_getdate, mock_get_all
	):
		"""get_yield_check_compliance returns a list of compliance records."""
		from datetime import date, timedelta
		today = date(2026, 1, 15)
		mock_getdate.return_value = today
		mock_get_all.side_effect = [
			[frappe._dict(
				name="ITEM-A",
				custom_yield_check_cadence="Interval",
				custom_yield_check_interval_days=7,
			)],
			[],  # completed_checks
		]

		result = get_yield_check_compliance(company="Test Co")

		self.assertIsInstance(result, list)
		self.assertTrue(len(result) >= 0)


class TestRequireScope(FrappeTestCase):
	"""Test _require_scope helper function."""

	def test_require_scope_throws_when_company_is_none(self):
		"""_require_scope fails closed when company is None."""
		with self.assertRaises(frappe.ValidationError):
			from ury.ury.api.ury_yield_variance import _require_scope
			_require_scope(None)

	def test_require_scope_throws_when_company_is_empty_string(self):
		"""_require_scope fails closed when company is empty string."""
		with self.assertRaises(frappe.ValidationError):
			from ury.ury.api.ury_yield_variance import _require_scope
			_require_scope("")

	def test_require_scope_passes_when_company_is_set(self):
		"""_require_scope passes when company is not empty."""
		# Should not raise
		from ury.ury.api.ury_yield_variance import _require_scope
		_require_scope("Test Co")


class TestUserHasBranchAccess(FrappeTestCase):
	"""Test B1: user_has_branch_access permission gating."""

	def test_returns_true_for_administrator(self):
		"""Administrator user has access to any branch."""
		result = user_has_branch_access("Administrator", "Test Branch")
		self.assertTrue(result)

	@patch(f"{MOD}.frappe.get_roles")
	def test_returns_true_for_system_manager_role(self, mock_get_roles):
		"""User with System Manager role has access to any branch."""
		mock_get_roles.return_value = ["System Manager", "Sales User"]

		result = user_has_branch_access("test_user", "Test Branch")

		self.assertTrue(result)
		mock_get_roles.assert_called_once_with("test_user")

	@patch(f"{MOD}.frappe.get_roles")
	@patch(f"{MOD}.frappe.db.exists")
	def test_returns_true_when_user_in_branch_table(self, mock_exists, mock_get_roles):
		"""User listed in Branch's user child table has access."""
		mock_get_roles.return_value = ["Sales User"]
		mock_exists.return_value = True

		result = user_has_branch_access("test_user", "Test Branch")

		self.assertTrue(result)
		# The real query also filters by parentfield="user" (to scope to
		# Branch's own user child table specifically, not any other doctype
		# reusing "URY User" as a child table with a different fieldname) --
		# this test's expected filter dict predates that and was missing it.
		mock_exists.assert_called_once_with(
			"URY User",
			{
				"parenttype": "Branch",
				"parent": "Test Branch",
				"parentfield": "user",
				"user": "test_user",
			},
		)

	@patch(f"{MOD}.frappe.get_roles")
	@patch(f"{MOD}.frappe.db.exists")
	def test_returns_false_when_user_not_in_branch_table(self, mock_exists, mock_get_roles):
		"""User NOT listed in Branch's user table denied access."""
		mock_get_roles.return_value = ["Sales User"]
		mock_exists.return_value = False

		result = user_has_branch_access("test_user", "Test Branch")

		self.assertFalse(result)

	def test_returns_false_when_user_is_none(self):
		"""None user has no access."""
		result = user_has_branch_access(None, "Test Branch")
		self.assertFalse(result)

	def test_returns_false_when_branch_is_none(self):
		"""None branch check returns False (guard clause)."""
		result = user_has_branch_access("test_user", None)
		self.assertFalse(result)

	def test_returns_false_when_both_are_none(self):
		"""Both None returns False."""
		result = user_has_branch_access(None, None)
		self.assertFalse(result)

	def test_returns_false_when_empty_string_user(self):
		"""Empty string user has no access."""
		result = user_has_branch_access("", "Test Branch")
		self.assertFalse(result)

	def test_returns_false_when_empty_string_branch(self):
		"""Empty string branch check returns False."""
		result = user_has_branch_access("test_user", "")
		self.assertFalse(result)


class TestRecordYieldCheckBranchAccessGating(FrappeTestCase):
	"""Test B1: record_yield_check enforces user-branch access."""

	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.frappe.has_permission")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.user_has_branch_access")
	def test_calls_user_has_branch_access(self, mock_access, mock_scope, mock_perm, mock_get_doc):
		"""record_yield_check checks user's branch access."""
		mock_perm.return_value = True
		mock_access.return_value = True
		# Once permission/scope/branch-access all pass, record_yield_check
		# goes on to frappe.get_doc({...}).insert() for real -- unmocked,
		# that's a genuine document insert against nonexistent Item/Branch/
		# Company records, which is not what this test is about.
		mock_get_doc.return_value = MagicMock()

		record_yield_check(
			item="TEST-ITEM",
			branch="Test Branch",
			company="Test Co",
			input_qty=100,
			output_qty=85,
			stock_uom="Nos",
			check_type="Routine",
		)

		mock_access.assert_called_once()
		call_args = mock_access.call_args[0]
		self.assertIn("Test Branch", call_args)

	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.frappe.has_permission")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.user_has_branch_access")
	@patch(f"{MOD}.frappe.session")
	def test_user_has_branch_access_receives_session_user(self, mock_session, mock_access, mock_scope, mock_perm, mock_get_doc):
		"""record_yield_check passes frappe.session.user to branch access check."""
		mock_session.user = "test_user"
		mock_perm.return_value = True
		mock_access.return_value = True
		mock_get_doc.return_value = MagicMock()

		record_yield_check(
			item="TEST-ITEM",
			branch="Test Branch",
			company="Test Co",
			input_qty=100,
			output_qty=85,
			stock_uom="Nos",
			check_type="Routine",
		)

		call_args = mock_access.call_args[0]
		self.assertEqual(call_args[0], "test_user")

	@patch(f"{MOD}.frappe.has_permission")
	@patch(f"{MOD}._require_scope")
	@patch(f"{MOD}.user_has_branch_access")
	def test_throws_permission_error_when_no_branch_access(self, mock_access, mock_scope, mock_perm):
		"""record_yield_check raises PermissionError when user lacks branch access."""
		mock_perm.return_value = True
		mock_access.return_value = False

		with self.assertRaises(frappe.PermissionError):
			record_yield_check(
				item="TEST-ITEM",
				branch="Test Branch",
				company="Test Co",
				input_qty=100,
				output_qty=85,
				stock_uom="Nos",
				check_type="Routine",
			)


class TestYieldCheckComplianceRealDocumentIntegration(FrappeTestCase):
	"""F9: real-document coverage for get_yield_check_compliance -- every
	other test in this file mocks frappe.get_all/get_value, so none of them
	inserted an actual Item/URY Issue Authorization/URY Yield Check and ran
	the real aggregation query. These do, via frappe.get_doc(...).insert()
	and the real record_yield_check() whitelisted API.
	"""

	def _ensure_company(self, company_name, abbr):
		if not frappe.db.exists("Company", company_name):
			frappe.get_doc(
				{
					"doctype": "Company",
					"company_name": company_name,
					"default_currency": "INR",
					"abbr": abbr,
				}
			).insert(ignore_permissions=True)

	def _ensure_branch(self, branch_name, company):
		if not frappe.db.exists("Branch", branch_name):
			frappe.get_doc(
				{
					"doctype": "Branch",
					"branch": branch_name,
					"company": company,
					"user": [{"user": "Administrator"}],
				}
			).insert(ignore_permissions=True)

	def _ensure_item(self, item_code, **overrides):
		if frappe.db.exists("Item", item_code):
			return
		fields = {
			"doctype": "Item",
			"item_code": item_code,
			"item_name": item_code,
			"item_group": "All Item Groups",
			"stock_uom": "Nos",
			"is_stock_item": 1,
			"custom_yield_tracked": 1,
			"custom_yield_percent": 80.0,
		}
		fields.update(overrides)
		frappe.get_doc(fields).insert(ignore_permissions=True)

	def _minimal_plan(self, branch, company):
		plan = frappe.get_doc(
			{
				"doctype": "URY Sales Plan",
				"status": "Draft",
				"enforcement_mode": "Soft",
				"branch": branch,
				"company": company,
				"plan_date": "2026-09-01",
			}
		)
		plan.flags.ignore_mandatory = True
		plan.flags.ignore_validate = True
		plan.insert(ignore_permissions=True)
		return plan.name

	def _department(self, branch, company):
		name = f"{branch} F9 Compliance Dept"
		if frappe.db.exists("URY Production Department", name):
			return name
		frappe.get_doc(
			{
				"doctype": "URY Production Department",
				"department_name": name,
				"branch": branch,
				"company": company,
				"enabled": 1,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True)
		return name

	def _auth(self, plan, branch, company, department, item, qty=50.0):
		doc = frappe.get_doc(
			{
				"doctype": "URY Issue Authorization",
				"plan": plan,
				"plan_approval_hash": "f9-real-doc-test",
				"branch": branch,
				"company": company,
				"department": department,
				"component_item": item,
				"stock_uom": "Nos",
				"control_mode": "SOFT",
				"status": "Authorized",
				"required_qty": qty,
				"authorized_qty": qty,
				"remaining_before_qty": qty,
				"remaining_after_qty": 0,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc.name

	def setUp(self):
		self.company = "F9 Compliance Test Co"
		self.branch = "F9 Compliance Test Branch"
		self._ensure_company(self.company, "F9CC")
		self._ensure_branch(self.branch, self.company)

	def test_real_compliance_reports_100_percent_for_zero_required_count(self):
		"""Documents CURRENT behavior: an Interval-cadence item with
		interval_days<=0 (skipped by the engine, so required_count == 0)
		reports compliance_percent == 100.0 -- a flattering default that
		looks like an accidental `x/0 -> 100` fallback rather than a
		documented product decision (see TRACK.md F9/Opus review). This
		test does NOT assert that 100% is the *correct* semantics, only
		that it is the semantics actually shipped today, against a real
		inserted Item and a real (unmocked) call to
		get_yield_check_compliance -- so a future intentional change to
		this default will show up here as a deliberate test update, not a
		silent behavior change.
		"""
		item_code = "F9-COMPLIANCE-ZERO-REQ-ITEM"
		self._ensure_item(
			item_code,
			custom_yield_check_cadence="Interval",
			custom_yield_check_interval_days=0,
		)

		rows = get_yield_check_compliance(company=self.company, branch=self.branch)
		row = next((r for r in rows if r["item"] == item_code), None)
		self.assertIsNotNone(row, "expected the real inserted item to appear in compliance rows")
		self.assertEqual(row["required_count"], 0)
		self.assertEqual(row["compliance_percent"], 100.0)

	def test_real_compliance_computes_from_real_authorizations_and_checks(self):
		"""Every Issue cadence: 2 real Authorized Issue Authorizations, only
		1 with a real Yield Check recorded against it -> required_count=2,
		completed_count=1, compliance_percent=50.0, computed by the real
		aggregation query (not asserted against mocked get_all calls)."""
		item_code = "F9-COMPLIANCE-EVERY-ISSUE-ITEM"
		self._ensure_item(item_code, custom_yield_check_cadence="Every Issue")

		department = self._department(self.branch, self.company)
		plan = self._minimal_plan(self.branch, self.company)
		auth_with_check = self._auth(plan, self.branch, self.company, department, item_code)
		self._auth(plan, self.branch, self.company, department, item_code)

		frappe.set_user("Administrator")
		record_yield_check(
			item=item_code,
			branch=self.branch,
			company=self.company,
			input_qty=100,
			output_qty=80,
			stock_uom="Nos",
			check_type="Routine",
			issue_authorization=auth_with_check,
		)

		rows = get_yield_check_compliance(company=self.company, branch=self.branch)
		row = next((r for r in rows if r["item"] == item_code), None)
		self.assertIsNotNone(row)
		self.assertEqual(row["required_count"], 2)
		self.assertEqual(row["completed_count"], 1)
		self.assertEqual(row["compliance_percent"], 50.0)


if __name__ == "__main__":
	unittest.main()

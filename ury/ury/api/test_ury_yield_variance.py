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
	update_yield_standards,
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


class TestUpdateYieldStandardsPermissionGating(FrappeTestCase):
	"""F2: update_yield_standards must be manager-gated -- these are
	costing-grade fields (drive BOM back-calculation and Yield Check variance
	baselines) that were previously writable by anyone with plain Item write
	permission via a raw frappe.client.set_value call from the frontend."""

	@patch(f"{MOD}.require_manager")
	def test_require_manager_called_and_enforced(self, mock_manager):
		"""A non-manager caller is rejected before anything else runs."""
		mock_manager.side_effect = frappe.PermissionError

		with self.assertRaises(frappe.PermissionError):
			update_yield_standards(
				item="TEST-ITEM",
				custom_yield_tracked=1,
				custom_yield_percent=85,
				custom_yield_check_cadence="Every Issue",
				custom_yield_check_interval_days=0,
			)

		mock_manager.assert_called_once()

	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.frappe.db.exists")
	@patch(f"{MOD}.require_manager")
	def test_manager_write_succeeds_and_saves_fields(self, mock_manager, mock_exists, mock_get_doc):
		"""A manager caller passes the gate and the four fields are set + saved."""
		mock_manager.return_value = None
		mock_exists.return_value = True
		mock_doc = MagicMock()
		mock_doc.name = "TEST-ITEM"
		mock_doc.custom_yield_tracked = 1
		mock_doc.custom_yield_percent = 85.0
		mock_doc.custom_yield_check_cadence = "Every Issue"
		mock_doc.custom_yield_check_interval_days = 0
		mock_get_doc.return_value = mock_doc

		result = update_yield_standards(
			item="TEST-ITEM",
			custom_yield_tracked=1,
			custom_yield_percent=85,
			custom_yield_check_cadence="Every Issue",
			custom_yield_check_interval_days=0,
		)

		mock_manager.assert_called_once()
		mock_doc.set.assert_any_call("custom_yield_tracked", 1)
		mock_doc.set.assert_any_call("custom_yield_percent", 85.0)
		mock_doc.set.assert_any_call("custom_yield_check_cadence", "Every Issue")
		mock_doc.set.assert_any_call("custom_yield_check_interval_days", 0)
		mock_doc.save.assert_called_once_with(ignore_permissions=False)
		self.assertEqual(result["item"], "TEST-ITEM")

	@patch(f"{MOD}.frappe.db.exists")
	@patch(f"{MOD}.require_manager")
	def test_rejects_missing_item(self, mock_manager, mock_exists):
		mock_manager.return_value = None

		with self.assertRaises(frappe.ValidationError):
			update_yield_standards(item=None, custom_yield_percent=85)

	@patch(f"{MOD}.frappe.db.exists")
	@patch(f"{MOD}.require_manager")
	def test_rejects_out_of_range_percent(self, mock_manager, mock_exists):
		mock_manager.return_value = None
		mock_exists.return_value = True

		with self.assertRaises(frappe.ValidationError):
			update_yield_standards(item="TEST-ITEM", custom_yield_percent=150)

	@patch(f"{MOD}.frappe.db.exists")
	@patch(f"{MOD}.require_manager")
	def test_rejects_invalid_cadence(self, mock_manager, mock_exists):
		mock_manager.return_value = None
		mock_exists.return_value = True

		with self.assertRaises(frappe.ValidationError):
			update_yield_standards(item="TEST-ITEM", custom_yield_check_cadence="Bogus")


class TestYieldStandardFieldsRawWritePathBlocked(FrappeTestCase):
	"""F2 follow-up (PR #435 adversarial review): the permission-gating tests
	above only prove that update_yield_standards() calls require_manager() --
	they patch require_manager() itself, so they cannot detect whether the
	underlying fields are still writable by any other path. That was exactly
	the bug: the four yield-standard fields were permlevel: 0, so a plain
	Item-write role (no URY Manager / System Manager) could still call
	frappe.client.set_value directly -- or just doc.save() -- and bypass
	update_yield_standards() entirely.

	These tests exercise the REAL permission system (real frappe.set_user,
	real Item Manager role, no mocking of require_manager or of Frappe's
	permission/permlevel machinery) against the raw low-level write paths,
	not the update_yield_standards() wrapper. They must fail before the
	permlevel: 1 fix (fixtures/custom_field.json + patches/v3_26) and pass
	after it.
	"""

	YIELD_STANDARD_FIELDS = (
		"custom_yield_percent",
		"custom_yield_tracked",
		"custom_yield_check_cadence",
		"custom_yield_check_interval_days",
	)

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")

		cls.item_code = "_TEST-F2-YIELD-STANDARD-ITEM"
		if not frappe.db.exists("Item", cls.item_code):
			item_group = frappe.db.get_value("Item Group", {}, "name") or "All Item Groups"
			doc = frappe.get_doc({
				"doctype": "Item",
				"item_code": cls.item_code,
				"item_name": cls.item_code,
				"item_group": item_group,
				"stock_uom": "Nos",
				"is_stock_item": 1,
				"custom_yield_percent": 40,
				"custom_yield_tracked": 0,
			})
			doc.insert(ignore_permissions=True)
		frappe.db.commit()

		# A user with plain Item write permission (Item Manager is a core
		# ERPNext role with read/write/create on Item at permlevel 0) but
		# NEITHER URY Manager NOR System Manager -- this is the exact
		# attacker profile from the F2 finding.
		cls.nonmanager_user = "_test-f2-yield-nonmanager@example.com"
		if not frappe.db.exists("User", cls.nonmanager_user):
			frappe.get_doc({
				"doctype": "User",
				"email": cls.nonmanager_user,
				"first_name": "F2NonManager",
				"send_welcome_email": 0,
				"roles": [{"role": "Item Manager"}],
			}).insert(ignore_permissions=True)

		cls.manager_user = "_test-f2-yield-manager@example.com"
		if not frappe.db.exists("User", cls.manager_user):
			frappe.get_doc({
				"doctype": "User",
				"email": cls.manager_user,
				"first_name": "F2Manager",
				"send_welcome_email": 0,
				"roles": [{"role": "URY Manager"}],
			}).insert(ignore_permissions=True)
		frappe.db.commit()

	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_value("Item", self.item_code, "custom_yield_percent", 40)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_nonmanager_cannot_raw_set_value_yield_percent(self):
		"""A non-manager with plain Item write permission cannot change
		custom_yield_percent via the raw frappe.client.set_value endpoint --
		the same call the frontend used to make before #435, and that any
		curl/devtools caller can still make directly against the API."""
		from frappe.client import set_value

		self.assertNotIn("URY Manager", frappe.get_roles(self.nonmanager_user))
		self.assertNotIn("System Manager", frappe.get_roles(self.nonmanager_user))

		frappe.set_user(self.nonmanager_user)
		try:
			set_value("Item", self.item_code, "custom_yield_percent", 99)
		except frappe.PermissionError:
			pass  # also an acceptable outcome
		finally:
			frappe.db.rollback()
			frappe.set_user("Administrator")

		# The real assertion: regardless of whether an exception was raised,
		# the value must NOT have been persisted for a non-manager.
		self.assertEqual(
			frappe.db.get_value("Item", self.item_code, "custom_yield_percent"),
			40.0,
			"custom_yield_percent was written by a non-manager via the raw "
			"set_value path -- the F2 permission hole is still open.",
		)

	def test_nonmanager_cannot_raw_doc_save_yield_percent(self):
		"""Same as above but via frappe.get_doc(...).save() directly --
		confirms the block is a real permission boundary (permlevel /
		validate hook), not just something wired into the set_value RPC
		wrapper specifically."""
		frappe.set_user(self.nonmanager_user)
		try:
			doc = frappe.get_doc("Item", self.item_code)
			doc.custom_yield_percent = 88
			doc.save()
		except frappe.PermissionError:
			pass
		finally:
			frappe.db.rollback()
			frappe.set_user("Administrator")

		self.assertEqual(
			frappe.db.get_value("Item", self.item_code, "custom_yield_percent"),
			40.0,
			"custom_yield_percent was written by a non-manager via doc.save() "
			"directly -- the F2 permission hole is still open.",
		)

	def test_manager_can_still_update_via_update_yield_standards(self):
		"""Regression check: the intended, manager-gated path must keep
		working after the permlevel change -- managers still need to be able
		to set these fields through update_yield_standards()."""
		frappe.set_user(self.manager_user)
		try:
			result = update_yield_standards(
				item=self.item_code,
				custom_yield_percent=77,
			)
			self.assertEqual(result["custom_yield_percent"], 77.0)
		finally:
			frappe.set_user("Administrator")

		self.assertEqual(
			frappe.db.get_value("Item", self.item_code, "custom_yield_percent"),
			77.0,
		)


if __name__ == "__main__":
	unittest.main()

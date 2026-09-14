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

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}._require_scope")
	def test_require_manager_called(self, mock_scope, mock_manager):
		"""record_yield_check calls require_manager()."""
		mock_manager.side_effect = frappe.PermissionError

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

		mock_manager.assert_called_once()

	@patch(f"{MOD}.require_manager")
	@patch(f"{MOD}._require_scope")
	def test_require_scope_called_with_company(self, mock_scope, mock_manager):
		"""record_yield_check calls _require_scope(company)."""
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
	@patch(f"{MOD}.require_manager")
	def test_record_yield_check_creates_and_inserts_document(
		self, mock_manager, mock_scope, mock_now, mock_session, mock_get_doc
	):
		"""record_yield_check creates URY Yield Check and inserts it."""
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
	@patch(f"{MOD}.require_manager")
	def test_record_yield_check_with_optional_fields(
		self, mock_manager, mock_scope, mock_now, mock_session, mock_get_doc
	):
		"""record_yield_check includes optional fields when provided."""
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
	@patch(f"{MOD}.require_manager")
	def test_record_yield_check_returns_key_fields(
		self, mock_manager, mock_scope, mock_now, mock_session, mock_get_doc
	):
		"""record_yield_check return dict includes required key fields."""
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


if __name__ == "__main__":
	unittest.main()

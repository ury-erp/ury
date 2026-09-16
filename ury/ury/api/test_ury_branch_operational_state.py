import unittest
from datetime import datetime
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_branch_operational_state import resolve_branch_operational_state


class TestBranchOperationalState(unittest.TestCase):
	@patch("ury.ury.api.ury_branch_operational_state.getBranch", return_value="Main")
	@patch("ury.ury.api.ury_branch_operational_state.frappe")
	def test_missing_schedule_fails_closed(self, frappe_mock, _get_branch):
		frappe_mock.db.get_value.return_value = None
		result = resolve_branch_operational_state(at=datetime(2026, 9, 7, 12))
		self.assertEqual(result["primary_phase"], "NOT_CONFIGURED")
		self.assertEqual(result["health"], "WARNING")

	@patch("ury.ury.api.ury_branch_operational_state.getBranch", return_value="Main")
	@patch("ury.ury.api.ury_branch_operational_state.frappe")
	def test_active_service_is_open(self, frappe_mock, _get_branch):
		frappe_mock.db.get_value.side_effect = [{"name": "Main", "enabled": 1}, None, None]
		frappe_mock.get_all.return_value = [{"service_name": "Lunch", "open_time": "10:00:00", "close_time": "14:00:00", "enabled": 1}]
		result = resolve_branch_operational_state(at=datetime(2026, 9, 7, 12))
		self.assertTrue(result["is_open"])
		self.assertEqual(result["active_services"], ["Lunch"])
		self.assertEqual(result["primary_phase"], "SERVICE_OPEN")

	@patch("ury.ury.api.ury_branch_operational_state.getBranch", return_value="Main")
	@patch("ury.ury.api.ury_branch_operational_state.frappe")
	def test_closed_exception_wins(self, frappe_mock, _get_branch):
		# Three get_value calls in order: schedule config, today's exception,
		# yesterday's exception (added by the overnight-carryover fix) -- the
		# third value is irrelevant to this test's assertion (today's closed
		# exception already wins) but must be present or the mock's
		# side_effect iterator is exhausted.
		frappe_mock.db.get_value.side_effect = [{"name": "Main", "enabled": 1}, {"is_closed": 1, "reason": "Holiday"}, None]
		result = resolve_branch_operational_state(at=datetime(2026, 9, 7, 12))
		self.assertEqual(result["state"], "OFF_HOURS")
		self.assertEqual(result["reason"], "Holiday")

	@staticmethod
	def _get_all_by_day(monday_window):
		# 2026-09-07 is a Monday: today=Monday, yesterday=Sunday.
		def _side_effect(doctype, filters=None, **kwargs):
			parentfield = (filters or {}).get("parentfield")
			if parentfield == "monday":
				return [monday_window]
			return []
		return _side_effect

	@patch("ury.ury.api.ury_branch_operational_state.getBranch", return_value="Main")
	@patch("ury.ury.api.ury_branch_operational_state.frappe")
	def test_overnight_window_open_before_midnight(self, frappe_mock, _get_branch):
		# Monday 22:00-02:00 window, checked at Monday 23:00 -> should be open (unaffected by fix).
		monday_window = {"service_name": "Late Night", "open_time": "22:00:00", "close_time": "02:00:00", "enabled": 1}
		frappe_mock.db.get_value.side_effect = [{"name": "Main", "enabled": 1}, None, None]
		frappe_mock.get_all.side_effect = self._get_all_by_day(monday_window)
		result = resolve_branch_operational_state(at=datetime(2026, 9, 7, 23, 0))
		self.assertTrue(result["is_open"])
		self.assertEqual(result["active_services"], ["Late Night"])
		self.assertEqual(result["service_date"], "2026-09-07")

	@patch("ury.ury.api.ury_branch_operational_state.getBranch", return_value="Main")
	@patch("ury.ury.api.ury_branch_operational_state.frappe")
	def test_overnight_window_carries_over_past_midnight(self, frappe_mock, _get_branch):
		# Monday 22:00-02:00 window, checked at Tuesday 01:00 -> must still be open
		# (carried over from Monday's row, previously reported closed).
		monday_window = {"service_name": "Late Night", "open_time": "22:00:00", "close_time": "02:00:00", "enabled": 1}
		frappe_mock.db.get_value.side_effect = [{"name": "Main", "enabled": 1}, None, None]
		frappe_mock.get_all.side_effect = self._get_all_by_day(monday_window)
		result = resolve_branch_operational_state(at=datetime(2026, 9, 8, 1, 0))
		self.assertTrue(result["is_open"])
		self.assertEqual(result["active_services"], ["Late Night"])
		# The session logically belongs to the day it opened (Monday), not Tuesday.
		self.assertEqual(result["service_date"], "2026-09-07")

	@patch("ury.ury.api.ury_branch_operational_state.getBranch", return_value="Main")
	@patch("ury.ury.api.ury_branch_operational_state.frappe")
	def test_no_carryover_before_todays_future_window_opens(self, frappe_mock, _get_branch):
		# Monday 22:00-02:00 window, no Sunday window at all, checked at Monday 01:00 ->
		# must be closed (previously wrongly reported open by applying today's future window early).
		monday_window = {"service_name": "Late Night", "open_time": "22:00:00", "close_time": "02:00:00", "enabled": 1}
		frappe_mock.db.get_value.side_effect = [{"name": "Main", "enabled": 1}, None, None]
		frappe_mock.get_all.side_effect = self._get_all_by_day(monday_window)
		result = resolve_branch_operational_state(at=datetime(2026, 9, 7, 1, 0))
		self.assertFalse(result["is_open"])
		self.assertEqual(result["active_services"], [])


class TestBranchOperationalStateRealPermissionBoundary(FrappeTestCase):
	"""Real (non-mocked) coverage of the branch-scope PermissionError guard in
	`resolve_branch_operational_state()` -- the existing test class above patches
	`frappe` entirely, which means the actual `getBranch()`/role-check control flow
	(the security-relevant part of this module) has never been exercised end to end
	against a real session/DB, only the pure date/time windowing logic has.

	Uses `frappe.set_user()` with real fixtures (Branch + URY User child-row
	assignment, per `getBranch()`'s own SQL join in `ury/ury_pos/api.py`) so these
	tests fail if the guard is ever accidentally unwired -- the same class of gap
	already found and fixed this session in `ury_kot_execution_service.py`.
	"""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from ury.ury.tests.factories import make_branch

		cls.branch_a = make_branch(branch="P4R3 Branch A")
		cls.branch_b = make_branch(branch="P4R3 Branch B")

		cls.user_a = cls._make_branch_user("p4r3-branch-a-user@ury.test", cls.branch_a.name)
		cls.user_no_branch = cls._make_branch_user("p4r3-no-branch-user@ury.test", None)

		# getBranch() (ury/ury_pos/api.py) unconditionally requires a
		# 'URY User' branch-assignment row for ANY caller, including a
		# System Manager -- there is no role-based bypass of that lookup
		# itself, only of the cross-branch REQUEST check further down in
		# resolve_branch_operational_state(). So the System Manager test
		# user must also be assigned to a (home) branch, distinct from the
		# one it will cross into.
		cls.sys_manager = cls._make_branch_user("p4r3-sysmgr@ury.test", cls.branch_a.name)
		frappe.get_doc("User", cls.sys_manager).add_roles("System Manager")

	@staticmethod
	def _make_branch_user(email, branch_name):
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		user = frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": "P4R3Branch",
			"send_welcome_email": 0,
			"enabled": 1,
		}).insert(ignore_permissions=True)
		if branch_name:
			# Mirrors `getBranch()`'s join: a `URY User` child row on the
			# `Branch.user` table field whose `user` column is this user's name.
			branch = frappe.get_doc("Branch", branch_name)
			branch.append("user", {"user": email})
			branch.save(ignore_permissions=True)
		return email

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_no_branch_assignment_fails_closed(self):
		# getBranch() itself (ury/ury_pos/api.py) throws its own generic
		# frappe.throw() -- which defaults to ValidationError, not
		# PermissionError -- before resolve_branch_operational_state()'s own
		# branch-scope PermissionError check is ever reached. Confirmed by
		# running this test against a real bench: asserting PermissionError
		# here fails with an uncaught ValidationError. This is still a
		# fail-closed outcome (no operational-state data is ever returned to
		# an unassigned user), just via a different, real exception type --
		# documented here rather than assumed.
		frappe.set_user(self.user_no_branch)
		with self.assertRaises(frappe.ValidationError):
			resolve_branch_operational_state()

	def test_cross_branch_request_rejected_for_non_privileged_user(self):
		frappe.set_user(self.user_a)
		with self.assertRaises(frappe.PermissionError):
			resolve_branch_operational_state(branch=self.branch_b.name)

	def test_own_branch_request_does_not_raise_permission_error(self):
		frappe.set_user(self.user_a)
		# No operating schedule fixture exists for this branch, so the module
		# fails open to a "NOT_CONFIGURED" snapshot rather than raising --
		# the assertion here is specifically that no PermissionError is
		# raised for a user requesting their OWN branch.
		result = resolve_branch_operational_state(branch=self.branch_a.name)
		self.assertEqual(result["branch"], self.branch_a.name)
		self.assertEqual(result["primary_phase"], "NOT_CONFIGURED")

	def test_implicit_own_branch_default_does_not_raise(self):
		frappe.set_user(self.user_a)
		result = resolve_branch_operational_state()
		self.assertEqual(result["branch"], self.branch_a.name)

	def test_system_manager_may_cross_tenant_boundary(self):
		frappe.set_user(self.sys_manager)
		result = resolve_branch_operational_state(branch=self.branch_b.name)
		self.assertEqual(result["branch"], self.branch_b.name)

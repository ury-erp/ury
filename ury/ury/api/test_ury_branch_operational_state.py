import unittest
from datetime import datetime
from unittest.mock import patch

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

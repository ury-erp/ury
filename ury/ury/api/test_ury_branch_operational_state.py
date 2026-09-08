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
		frappe_mock.db.get_value.side_effect = [{"name": "Main", "enabled": 1}, None]
		frappe_mock.get_all.return_value = [{"service_name": "Lunch", "open_time": "10:00:00", "close_time": "14:00:00", "enabled": 1}]
		result = resolve_branch_operational_state(at=datetime(2026, 9, 7, 12))
		self.assertTrue(result["is_open"])
		self.assertEqual(result["active_services"], ["Lunch"])
		self.assertEqual(result["primary_phase"], "SERVICE_OPEN")

	@patch("ury.ury.api.ury_branch_operational_state.getBranch", return_value="Main")
	@patch("ury.ury.api.ury_branch_operational_state.frappe")
	def test_closed_exception_wins(self, frappe_mock, _get_branch):
		frappe_mock.db.get_value.side_effect = [{"name": "Main", "enabled": 1}, {"is_closed": 1, "reason": "Holiday"}]
		result = resolve_branch_operational_state(at=datetime(2026, 9, 7, 12))
		self.assertEqual(result["state"], "OFF_HOURS")
		self.assertEqual(result["reason"], "Holiday")

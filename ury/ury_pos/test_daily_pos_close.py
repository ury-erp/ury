"""Daily-close business-day regressions; persistence is mocked, not time math."""

import unittest
from datetime import datetime
from unittest.mock import patch

from ury.ury.api import ury_dashboard
from ury.ury_pos import api


class TestDailyPOSClose(unittest.TestCase):
    def setUp(self):
        self.frappe = self.enterContext(patch("ury.ury_pos.api.frappe"))
        self.enterContext(patch("ury.ury.api.ury_dashboard.frappe", self.frappe))
        self.enterContext(patch(
            "ury.ury.api.ury_dashboard.get_datetime", side_effect=self._datetime,
        ))
        self.enterContext(patch(
            "ury.ury.api.ury_dashboard.today", side_effect=lambda: self.now.date().isoformat(),
        ))
        self.now = datetime(2026, 10, 2, 6)
        self.enabled = 1
        self.branch = "Branch A"
        self.hours = {"Branch A": None, "Branch B": 7}
        self.openings = []
        self.frappe.utils.now_datetime.side_effect = lambda: self.now
        self.frappe.db.get_value.side_effect = self._get_value
        self.frappe.db.exists.side_effect = self._exists

    def _datetime(self, value=None):
        return self.now if value is None else datetime.fromisoformat(value)

    def _get_value(self, doctype, filters, field):
        if doctype == "POS Profile":
            self.assertEqual(filters, "Till A")
            if field == "custom_daily_pos_close":
                return self.enabled
            self.assertEqual(field, "branch")
            return self.branch
        self.assertEqual(doctype, "URY Report Settings")
        self.assertEqual(field, "hours")
        return self.hours.get(filters["branch"])

    def _exists(self, doctype, filters):
        self.assertEqual(doctype, "POS Opening Entry")
        for opening in self.openings:
            for field, condition in filters.items():
                value = opening[field]
                if isinstance(condition, (list, tuple)):
                    operator, operand = condition
                    self.assertEqual(operator, "<")
                    if not value < operand:
                        break
                elif value != condition:
                    break
            else:
                return opening["name"]
        return None

    def _opening(self, stamp, **values):
        started = datetime.fromisoformat(stamp)
        opening = {
            "name": "OPEN-1", "pos_profile": "Till A", "status": "Open",
            "docstatus": 1, "period_start_date": started, "posting_date": started.date(),
        }
        opening.update(values)
        self.openings.append(opening)

    def test_session_two_business_days_old_blocks(self):
        self._opening("2026-09-30 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Failed")

    def test_session_opened_after_midnight_is_same_business_day(self):
        self.now = datetime(2026, 10, 2, 1)
        self._opening("2026-10-02 00:30:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_yesterday_evening_blocks_after_default_boundary(self):
        self._opening("2026-10-01 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Failed")

    def test_yesterday_evening_is_same_business_day_before_default_boundary(self):
        self.now = datetime(2026, 10, 2, 4)
        self._opening("2026-10-01 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_disabled_flag_preserves_success_without_checking_sessions(self):
        self.enabled = 0
        self._opening("2026-09-30 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Success")
        self.frappe.db.exists.assert_not_called()
        self.frappe.utils.now_datetime.assert_not_called()

    def test_closed_session_is_ignored(self):
        self._opening("2026-10-01 22:00:00", status="Closed")
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_draft_session_is_ignored(self):
        self._opening("2026-10-01 22:00:00", docstatus=0)
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_cancelled_session_is_ignored(self):
        self._opening("2026-10-01 22:00:00", docstatus=2)
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_other_profile_is_ignored(self):
        self._opening("2026-10-01 22:00:00", pos_profile="Till B")
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_current_business_day_session_is_allowed(self):
        self._opening("2026-10-02 05:30:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_session_at_business_day_start_is_allowed(self):
        self._opening("2026-10-02 05:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_session_one_microsecond_before_business_day_start_blocks(self):
        self._opening("2026-10-02 04:59:59.999999")
        self.assertEqual(api.validate_pos_close("Till A"), "Failed")

    def test_current_business_day_changes_at_exact_boundary(self):
        self.now = datetime(2026, 10, 2, 5)
        self._opening("2026-10-01 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Failed")

    def test_period_start_not_posting_date_determines_staleness(self):
        self._opening("2026-09-30 22:00:00", posting_date=self.now.date())
        self.assertEqual(api.validate_pos_close("Till A"), "Failed")

    def test_later_branch_boundary_keeps_yesterday_evening_current(self):
        self.hours["Branch A"] = 7
        self._opening("2026-10-01 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_earlier_branch_boundary_blocks_yesterday_evening(self):
        self.hours["Branch A"] = 3
        self.now = datetime(2026, 10, 2, 4)
        self._opening("2026-10-01 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Failed")

    def test_zero_hour_setting_is_a_midnight_boundary(self):
        self.hours["Branch A"] = 0
        self.now = datetime(2026, 10, 2, 1)
        self._opening("2026-10-01 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Failed")

    def test_settings_belong_to_the_profile_branch_not_another_branch(self):
        self._opening("2026-10-01 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Failed")

    def test_missing_profile_branch_uses_default_boundary(self):
        self.branch = None
        self.now = datetime(2026, 10, 2, 4)
        self._opening("2026-10-01 22:00:00")
        self.assertEqual(api.validate_pos_close("Till A"), "Success")

    def test_dashboard_without_settings_keeps_its_midnight_default(self):
        self.now = datetime(2026, 10, 2, 4)
        self.assertEqual(ury_dashboard._business_day_bounds("Branch A"), (
            datetime(2026, 10, 2), datetime(2026, 10, 3),
        ))


if __name__ == "__main__":
    unittest.main()

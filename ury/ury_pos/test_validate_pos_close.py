"""Focused regression tests for validate_pos_close daily-close gate.

Covers the 05:00 business-day boundary and older unclosed sessions
(equality-on-yesterday missed multi-day-open openings like Aug 31 on Sep 8).
"""

from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import patch

from ury.ury_pos.api import validate_pos_close


PROFILE = "Demo Branch POS Profile"


class TestValidatePosClose(unittest.TestCase):
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.db.get_value")
    def test_disabled_option_always_success(self, mock_get_value, mock_exists):
        mock_get_value.return_value = 0

        self.assertEqual(validate_pos_close(PROFILE), "Success")
        mock_exists.assert_not_called()

    @patch("ury.ury_pos.api.frappe.utils.now_datetime")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.db.get_value")
    def test_after_5am_older_unclosed_session_fails(
        self, mock_get_value, mock_exists, mock_now
    ):
        """Sep 8 after 05:00 must fail when Aug 31 (or any prior day) is still open."""
        mock_get_value.return_value = 1
        mock_now.return_value = datetime(2026, 9, 8, 10, 0, 0)
        mock_exists.return_value = "POS-OPE-2026-00003"

        self.assertEqual(validate_pos_close(PROFILE), "Failed")
        mock_exists.assert_called_once_with(
            "POS Opening Entry",
            {
                "posting_date": ["<", datetime(2026, 9, 8).date()],
                "status": "Open",
                "pos_profile": PROFILE,
                "docstatus": 1,
            },
        )

    @patch("ury.ury_pos.api.frappe.utils.now_datetime")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.db.get_value")
    def test_after_5am_yesterday_unclosed_still_fails(
        self, mock_get_value, mock_exists, mock_now
    ):
        mock_get_value.return_value = 1
        mock_now.return_value = datetime(2026, 9, 8, 10, 0, 0)
        mock_exists.return_value = "POS-OPE-YESTERDAY"

        self.assertEqual(validate_pos_close(PROFILE), "Failed")
        filters = mock_exists.call_args[0][1]
        self.assertEqual(filters["posting_date"], ["<", datetime(2026, 9, 8).date()])

    @patch("ury.ury_pos.api.frappe.utils.now_datetime")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.db.get_value")
    def test_after_5am_no_stale_session_succeeds(
        self, mock_get_value, mock_exists, mock_now
    ):
        mock_get_value.return_value = 1
        mock_now.return_value = datetime(2026, 9, 8, 10, 0, 0)
        mock_exists.return_value = None

        self.assertEqual(validate_pos_close(PROFILE), "Success")

    @patch("ury.ury_pos.api.frappe.utils.now_datetime")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.db.get_value")
    def test_before_5am_uses_prior_business_day_cutoff(
        self, mock_get_value, mock_exists, mock_now
    ):
        """Before 05:00 on Sep 8, business day is still Sep 7; stale is posting_date < Sep 7."""
        mock_get_value.return_value = 1
        mock_now.return_value = datetime(2026, 9, 8, 4, 30, 0)
        mock_exists.return_value = "POS-OPE-2026-00003"

        self.assertEqual(validate_pos_close(PROFILE), "Failed")
        mock_exists.assert_called_once_with(
            "POS Opening Entry",
            {
                "posting_date": ["<", datetime(2026, 9, 7).date()],
                "status": "Open",
                "pos_profile": PROFILE,
                "docstatus": 1,
            },
        )

    @patch("ury.ury_pos.api.frappe.utils.now_datetime")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.db.get_value")
    def test_before_5am_yesterdays_open_session_still_allowed(
        self, mock_get_value, mock_exists, mock_now
    ):
        """Grace until 05:00: an open session dated yesterday is still current business day."""
        mock_get_value.return_value = 1
        mock_now.return_value = datetime(2026, 9, 8, 4, 30, 0)
        mock_exists.return_value = None

        self.assertEqual(validate_pos_close(PROFILE), "Success")
        filters = mock_exists.call_args[0][1]
        self.assertEqual(filters["posting_date"], ["<", datetime(2026, 9, 7).date()])

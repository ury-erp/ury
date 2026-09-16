import unittest
import json
from datetime import datetime
from dateutil.relativedelta import relativedelta
from unittest.mock import patch, MagicMock

import frappe

from ury.ury.api.minimal.setup_organization import (
    get_setup_defaults,
    get_country_defaults,
    _normalize_setup_payload,
    get_setup_progress_steps,
    _progress_cache_key,
    _remember_setup_task,
    _run_setup_complete,
    get_setup_progress_status,
    submit_setup,
    complete_wizard_setup,
    get_wizard_status,
)


class TestGetSetupDefaults(unittest.TestCase):
    """Guard added to get_setup_defaults(): reject Guest callers.

    Happy path returns languages, countries, currencies, and timezones.
    Tests use mocks to avoid dependency on frappe.geo and pytz data.
    """

    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_guest_user_is_rejected(self, mock_session):
        mock_session.user = "Guest"
        with self.assertRaises(frappe.exceptions.ValidationError) as ctx:
            get_setup_defaults()
        self.assertIn("Not permitted", str(ctx.exception))

    @patch("ury.ury.api.minimal.setup_organization.get_all")
    @patch("ury.ury.api.minimal.setup_organization.load_country")
    @patch("ury.ury.api.minimal.setup_organization.load_languages")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_authenticated_user_gets_setup_defaults(
        self, mock_session, mock_load_languages, mock_load_country, mock_get_all
    ):
        mock_session.user = "test@example.com"
        mock_load_languages.return_value = ["en", "es"]
        mock_load_country.return_value = "United States"
        mock_get_all.return_value = {
            "United States": {"currency": "USD", "currency_symbol": "$"},
            "India": {"currency": "INR", "currency_symbol": "₹"},
        }
        with patch("ury.ury.api.minimal.setup_organization.pytz") as mock_pytz:
            mock_pytz.all_timezones = ["UTC"]
            result = get_setup_defaults()
        self.assertEqual(result["detected_country"], "United States")
        self.assertEqual(result["languages"], ["en", "es"])

    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_guest_country_defaults_rejected(self, mock_session):
        mock_session.user = "Guest"
        with self.assertRaises(frappe.exceptions.ValidationError):
            get_country_defaults("US")

    @patch("ury.ury.api.minimal.setup_organization.get_charts_for_country")
    @patch("ury.ury.api.minimal.setup_organization.get_country_info")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_country_defaults_success(self, mock_session, mock_info, mock_charts):
        mock_session.user = "test@example.com"
        mock_info.return_value = {"currency": "USD", "timezones": ["EST"]}
        mock_charts.return_value = ["Standard"]
        result = get_country_defaults("US")
        self.assertEqual(result["currency"], "USD")

    @patch("ury.setup.setup_wizard._wants_ury_demo")
    def test_normalize_dict_payload(self, mock_wants):
        mock_wants.return_value = False
        payload = {"company": "Test", "email": "a@b.com"}
        result = _normalize_setup_payload(payload)
        self.assertNotIn("email", result)
        self.assertEqual(result["setup_ury_demo"], 0)

    @patch("ury.setup.setup_wizard._wants_ury_demo")
    def test_normalize_fy_date_full(self, mock_wants):
        mock_wants.return_value = False
        payload = {"fy_start_date": "2024-04-01"}
        result = _normalize_setup_payload(payload)
        self.assertEqual(result["fy_start_date"], "2024-04-01")
        self.assertEqual(result["fy_end_date"], "2025-03-31")

    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_progress_cache_key(self, mock_session):
        mock_session.user = "test@example.com"
        key = _progress_cache_key()
        self.assertEqual(key, "ury_setup_progress:test@example.com")

    @patch("ury.ury.api.minimal.setup_organization.frappe.cache")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_remember_dict_message(self, mock_session, mock_cache):
        mock_session.user = "test@example.com"
        msg = {"status": "ok"}
        _remember_setup_task(msg)
        mock_cache.set_value.assert_called_once()

    @patch("ury.ury.api.minimal.setup_organization.frappe.cache")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_remember_ignores_non_dict(self, mock_session, mock_cache):
        mock_session.user = "test@example.com"
        _remember_setup_task("string")
        mock_cache.set_value.assert_not_called()

    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_wizard_status_guest_rejected(self, mock_session):
        mock_session.user = "Guest"
        with self.assertRaises(frappe.exceptions.ValidationError):
            get_wizard_status()

    @patch("frappe.db.exists")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_wizard_status_both_incomplete(self, mock_session, mock_db_exists):
        mock_session.user = "test@example.com"
        mock_db_exists.return_value = False
        result = get_wizard_status()
        self.assertFalse(result["step1_complete"])
        self.assertFalse(result["step2_complete"])

    @patch("frappe.db.exists")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_wizard_status_both_complete(self, mock_session, mock_db_exists):
        mock_session.user = "test@example.com"
        mock_db_exists.return_value = True
        result = get_wizard_status()
        self.assertTrue(result["step1_complete"])
        self.assertTrue(result["step2_complete"])

    @patch("ury.ury.api.minimal.setup_organization.setup_complete")
    def test_run_setup_complete_success(self, mock_setup):
        mock_setup.return_value = {"status": "done"}
        result = _run_setup_complete({"company": "Test"})
        self.assertEqual(result, {"status": "done"})

    @patch("time.sleep")
    @patch("ury.ury.api.minimal.setup_organization.frappe.db")
    @patch("ury.ury.api.minimal.setup_organization.setup_complete")
    def test_run_setup_retry_deadlock(self, mock_setup, mock_db, mock_sleep):
        err = frappe.QueryDeadlockError("deadlock")
        mock_setup.side_effect = [err, err, {"status": "ok"}]
        result = _run_setup_complete({})
        self.assertEqual(result, {"status": "ok"})
        self.assertEqual(mock_setup.call_count, 3)

    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_progress_status_guest_rejected(self, mock_session):
        mock_session.user = "Guest"
        with self.assertRaises(frappe.exceptions.ValidationError):
            get_setup_progress_status()

    @patch("ury.ury.api.minimal.setup_organization.frappe.cache")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_progress_status_returns_cached(self, mock_session, mock_cache):
        mock_session.user = "test@example.com"
        expected = {"status": "step2"}
        mock_cache.get_value.return_value = expected
        result = get_setup_progress_status()
        self.assertEqual(result, expected)

    @patch("ury.ury.api.minimal.setup_organization.frappe.cache")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_progress_status_empty_when_none(self, mock_session, mock_cache):
        mock_session.user = "test@example.com"
        mock_cache.get_value.return_value = None
        result = get_setup_progress_status()
        self.assertEqual(result, {})

    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_progress_steps_guest_rejected(self, mock_session):
        mock_session.user = "Guest"
        with self.assertRaises(frappe.exceptions.ValidationError):
            get_setup_progress_steps()

    @patch("ury.setup.setup_wizard._wants_ury_demo")
    @patch("frappe.desk.page.setup_wizard.setup_wizard.get_setup_stages")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_progress_steps_returns_list(self, mock_session, mock_stages, mock_wants):
        mock_session.user = "test@example.com"
        mock_wants.return_value = False
        mock_stages.return_value = [{"status": "s1", "tasks": [{"app_name": "ury"}]}]
        result = get_setup_progress_steps()
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["app"], "ury")

    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_submit_setup_guest_rejected(self, mock_session):
        mock_session.user = "Guest"
        with self.assertRaises(frappe.exceptions.ValidationError):
            submit_setup({})

    @patch("frappe.db.get_single_value")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_submit_setup_already_complete(self, mock_session, mock_get_single):
        mock_session.user = "test@example.com"
        mock_get_single.return_value = 1
        with self.assertRaises(frappe.exceptions.ValidationError) as ctx:
            submit_setup({})
        self.assertIn("already completed", str(ctx.exception).lower())

    @patch("ury.ury.api.minimal.setup_organization._run_setup_complete")
    @patch("ury.ury.api.minimal.setup_organization._normalize_setup_payload")
    @patch("ury.ury.api.minimal.setup_organization.frappe.db")
    @patch("ury.ury.api.minimal.setup_organization.frappe.session")
    def test_submit_setup_success(self, mock_session, mock_db, mock_norm, mock_run):
        mock_session.user = "test@example.com"
        mock_db.get_single_value.return_value = 0
        mock_norm.return_value = {"company": "Test"}
        mock_run.return_value = {"status": "ok"}
        with patch("ury.ury.api.minimal.setup_organization.frappe"):
            result = submit_setup({})
        self.assertEqual(result, {"status": "ok"})

    @patch("ury.ury.api.minimal.setup_organization.submit_setup")
    def test_complete_wizard_calls_submit(self, mock_submit):
        mock_submit.return_value = {"status": "ok"}
        result = complete_wizard_setup(payload={})
        mock_submit.assert_called_once()
        self.assertEqual(result, {"status": "ok"})


if __name__ == "__main__":
    unittest.main()

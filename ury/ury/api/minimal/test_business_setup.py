import unittest
from unittest.mock import patch

import frappe

from ury.ury.api.minimal.business_setup import submit_configure_data


class TestSubmitConfigureDataGuard(unittest.TestCase):
    """Guard added to submit_configure_data(): reject Guest callers, and
    reject any call once System Settings.setup_complete is already 1.

    These are mock-based unit tests -- consistent with the existing
    convention in ury/ury_pos/test_api.py (see TestMergeBillsSEC07) -- so
    they don't require a live Frappe site/bench to reason about, though
    they run under `bench run-tests` like the rest of this codebase's
    test suite.
    """

    @patch("ury.ury.api.minimal.business_setup.frappe.db.get_single_value")
    def test_guest_user_is_rejected(self, mock_get_single_value):
        # Guest guard must fire before the setup_complete check even runs.
        with patch.object(frappe.session, "user", "Guest"):
            with self.assertRaises(frappe.exceptions.ValidationError) as ctx:
                submit_configure_data(data="{}")

        self.assertIn("Not permitted", str(ctx.exception))
        mock_get_single_value.assert_not_called()

    @patch("ury.ury.api.minimal.business_setup.frappe.db.get_single_value")
    def test_setup_already_completed_is_rejected(self, mock_get_single_value):
        mock_get_single_value.return_value = 1

        with patch.object(frappe.session, "user", "test@example.com"):
            with self.assertRaises(frappe.exceptions.ValidationError) as ctx:
                submit_configure_data(data="{}")

        self.assertIn("Setup already completed", str(ctx.exception))
        mock_get_single_value.assert_called_once_with("System Settings", "setup_complete")

    @patch("ury.ury.api.minimal.business_setup.frappe.db.get_single_value")
    def test_setup_not_completed_and_authenticated_user_passes_guard(
        self, mock_get_single_value
    ):
        # setup_complete == 0 and a real user must clear the guard and reach
        # _run_configure_data (mocked here so this stays a guard-only test).
        mock_get_single_value.return_value = 0

        with patch.object(frappe.session, "user", "test@example.com"):
            with patch(
                "ury.ury.api.minimal.business_setup._run_configure_data"
            ) as mock_run:
                mock_run.return_value = {"status": "success", "results": {}}
                result = submit_configure_data(data="{}")

        mock_run.assert_called_once()
        self.assertEqual(result, {"status": "success", "results": {}})


class TestSubmitConfigureDataRollback(unittest.TestCase):
    """Transaction safety: submit_configure_data() wraps the whole configure
    flow (via the private _run_configure_data helper) in try/except and
    calls frappe.db.rollback() on any failure, matching the convention in
    ury/ury_pos/api.py (see TestMergeBillsSEC07.test_merge_bills_different_branches
    in ury/ury_pos/test_api.py).

    We assert on frappe.db.rollback() being invoked rather than checking
    real DocType rows for Branch/Room/Table, because this worktree has no
    runnable Frappe site/bench available (no `bench start`/site config in
    this checkout) to actually insert and roll back real documents against
    a live database. The mock-based assertion still exercises the exact
    guard added in business_setup.py: the except block around
    _run_configure_data() unconditionally calls frappe.db.rollback() before
    re-raising, for both frappe.PermissionError and any other Exception.
    """

    @patch("ury.ury.api.minimal.business_setup.frappe.db.get_single_value")
    @patch("ury.ury.api.minimal.business_setup.frappe.db.rollback")
    @patch("ury.ury.api.minimal.business_setup._run_configure_data")
    def test_generic_failure_partway_through_triggers_rollback(
        self, mock_run, mock_rollback, mock_get_single_value
    ):
        mock_get_single_value.return_value = 0
        mock_run.side_effect = Exception("boom while creating URY Table")

        with patch.object(frappe.session, "user", "test@example.com"):
            with patch(
                "ury.ury.api.minimal.business_setup.frappe.log_error"
            ) as mock_log_error:
                with self.assertRaises(Exception) as ctx:
                    submit_configure_data(data="{}")

        self.assertIn("boom while creating URY Table", str(ctx.exception))
        mock_rollback.assert_called_once()
        mock_log_error.assert_called_once()

    @patch("ury.ury.api.minimal.business_setup.frappe.db.get_single_value")
    @patch("ury.ury.api.minimal.business_setup.frappe.db.rollback")
    @patch("ury.ury.api.minimal.business_setup._run_configure_data")
    def test_permission_error_partway_through_triggers_rollback_and_reraises(
        self, mock_run, mock_rollback, mock_get_single_value
    ):
        mock_get_single_value.return_value = 0
        mock_run.side_effect = frappe.PermissionError("no permission for Branch")

        with patch.object(frappe.session, "user", "test@example.com"):
            with self.assertRaises(frappe.PermissionError):
                submit_configure_data(data="{}")

        mock_rollback.assert_called_once()

    @patch("ury.ury.api.minimal.business_setup.frappe.db.get_single_value")
    @patch("ury.ury.api.minimal.business_setup.frappe.db.rollback")
    @patch("ury.ury.api.minimal.business_setup._run_configure_data")
    def test_success_path_never_rolls_back(
        self, mock_run, mock_rollback, mock_get_single_value
    ):
        mock_get_single_value.return_value = 0
        mock_run.return_value = {"status": "success", "results": {"branch": "Main"}}

        with patch.object(frappe.session, "user", "test@example.com"):
            result = submit_configure_data(data="{}")

        self.assertEqual(result, {"status": "success", "results": {"branch": "Main"}})
        mock_rollback.assert_not_called()


if __name__ == "__main__":
    unittest.main()

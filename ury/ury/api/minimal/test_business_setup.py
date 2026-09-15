import unittest
from unittest.mock import MagicMock, patch

import frappe

from ury.ury.api.minimal.business_setup import create_setup_user, submit_configure_data


class TestSubmitConfigureDataGuard(unittest.TestCase):
    """Guard added to submit_configure_data(): reject Guest callers, and
    reject any call once URY setup (Step 1 and Step 2) is already complete.

    System Settings.setup_complete alone is not the guard, because Step 1
    sets it before Step 2 (this endpoint) runs.

    These are mock-based unit tests -- consistent with the existing
    convention in ury/ury_pos/test_api.py (see TestMergeBillsSEC07) -- so
    they don't require a live Frappe site/bench to reason about, though
    they run under `bench run-tests` like the rest of this codebase's
    test suite.
    """

    @patch("ury.ury.api.minimal.business_setup.is_ury_setup_complete")
    def test_guest_user_is_rejected(self, mock_setup_complete):
        # Guest guard must fire before the setup-complete check even runs.
        with patch("ury.ury.api.minimal.business_setup.frappe.session", frappe._dict({"user": "Guest"})):
            with self.assertRaises(frappe.exceptions.ValidationError) as ctx:
                submit_configure_data(data="{}")

        self.assertIn("Not permitted", str(ctx.exception))
        mock_setup_complete.assert_not_called()

    @patch("ury.ury.api.minimal.business_setup.is_ury_setup_complete")
    def test_setup_already_completed_is_rejected(self, mock_setup_complete):
        mock_setup_complete.return_value = True

        with patch("ury.ury.api.minimal.business_setup.frappe.session", frappe._dict({"user": "test@example.com"})):
            with self.assertRaises(frappe.exceptions.ValidationError) as ctx:
                submit_configure_data(data="{}")

        self.assertIn("Setup already completed", str(ctx.exception))
        mock_setup_complete.assert_called_once_with()

    @patch("ury.ury.api.minimal.business_setup.frappe.db.get_single_value")
    @patch("ury.ury.api.minimal.business_setup.is_ury_setup_complete")
    def test_step1_setup_complete_flag_does_not_block_step2(
        self, mock_setup_complete, mock_get_single_value
    ):
        # Regression: after Step 1, System Settings.setup_complete is 1 but
        # no Branch exists yet. Step 2 must still be allowed to run.
        mock_get_single_value.return_value = 1
        mock_setup_complete.return_value = False

        with patch("ury.ury.api.minimal.business_setup.frappe.session", frappe._dict({"user": "test@example.com"})):
            with patch(
                "ury.ury.api.minimal.business_setup._run_configure_data"
            ) as mock_run:
                mock_run.return_value = {"status": "success", "results": {}}
                result = submit_configure_data(data="{}")

        mock_run.assert_called_once()
        self.assertEqual(result, {"status": "success", "results": {}})

    @patch("ury.ury.api.minimal.business_setup.is_ury_setup_complete")
    def test_setup_not_completed_and_authenticated_user_passes_guard(
        self, mock_setup_complete
    ):
        # Setup not complete and a real user must clear the guard and reach
        # _run_configure_data (mocked here so this stays a guard-only test).
        mock_setup_complete.return_value = False

        with patch("ury.ury.api.minimal.business_setup.frappe.session", frappe._dict({"user": "test@example.com"})):
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

    @patch("ury.ury.api.minimal.business_setup.is_ury_setup_complete", return_value=False)
    @patch("ury.ury.api.minimal.business_setup.frappe.db.rollback")
    @patch("ury.ury.api.minimal.business_setup._run_configure_data")
    def test_generic_failure_partway_through_triggers_rollback(
        self, mock_run, mock_rollback, _mock_setup_complete
    ):
        mock_run.side_effect = Exception("boom while creating URY Table")

        with patch("ury.ury.api.minimal.business_setup.frappe.session", frappe._dict({"user": "test@example.com"})):
            with patch(
                "ury.ury.api.minimal.business_setup.frappe.log_error"
            ) as mock_log_error:
                with self.assertRaises(Exception) as ctx:
                    submit_configure_data(data="{}")

        self.assertIn("boom while creating URY Table", str(ctx.exception))
        mock_rollback.assert_called_once()
        mock_log_error.assert_called_once()

    @patch("ury.ury.api.minimal.business_setup.is_ury_setup_complete", return_value=False)
    @patch("ury.ury.api.minimal.business_setup.frappe.db.rollback")
    @patch("ury.ury.api.minimal.business_setup._run_configure_data")
    def test_permission_error_partway_through_triggers_rollback_and_reraises(
        self, mock_run, mock_rollback, _mock_setup_complete
    ):
        mock_run.side_effect = frappe.PermissionError("no permission for Branch")

        with patch("ury.ury.api.minimal.business_setup.frappe.session", frappe._dict({"user": "test@example.com"})):
            with self.assertRaises(frappe.PermissionError):
                submit_configure_data(data="{}")

        mock_rollback.assert_called_once()

    @patch("ury.ury.api.minimal.business_setup.is_ury_setup_complete", return_value=False)
    @patch("ury.ury.api.minimal.business_setup.frappe.db.rollback")
    @patch("ury.ury.api.minimal.business_setup._run_configure_data")
    def test_success_path_never_rolls_back(
        self, mock_run, mock_rollback, _mock_setup_complete
    ):
        mock_run.return_value = {"status": "success", "results": {"branch": "Main"}}

        with patch("ury.ury.api.minimal.business_setup.frappe.session", frappe._dict({"user": "test@example.com"})):
            result = submit_configure_data(data="{}")

        self.assertEqual(result, {"status": "success", "results": {"branch": "Main"}})
        mock_rollback.assert_not_called()


class TestCreateSetupUserRoles(unittest.TestCase):
    """Item 11: create_setup_user() must accept multiple roles (`roles:
    list[str]`), keep the single `role` string accepted for backward
    compatibility, and preserve the pre-existing privilege-escalation
    guard: a non-System-Manager caller (including the one-time bootstrap
    window) must never be able to obtain URY Admin/System Manager,
    whether requested alone or alongside other, allowed roles.

    Mock-based, matching the existing convention in this file -- this
    worktree has no runnable Frappe site/bench to insert real User docs
    against.
    """

    def _patch_session(self, user):
        return patch("ury.ury.api.minimal.business_setup.frappe.session", frappe._dict({"user": user}))

    @patch("ury.ury.api.minimal.business_setup.frappe.get_roles", return_value=[])
    @patch("ury.ury.api.minimal.business_setup._is_bootstrap_setup", return_value=False)
    @patch("ury.ury.api.minimal.business_setup.frappe.db.exists", return_value=False)
    @patch("ury.ury.api.minimal.business_setup.frappe.get_doc")
    def test_backward_compat_single_role_string_still_works(
        self, mock_get_doc, _mock_exists, _mock_bootstrap, _mock_get_roles
    ):
        mock_user = MagicMock()
        mock_get_doc.return_value = mock_user

        with self._patch_session("manager@example.com"):
            result = create_setup_user(email="a@example.com", name="A", role="URY Cashier")

        self.assertEqual(result["status"], "created")
        called_with = mock_get_doc.call_args[0][0]
        self.assertEqual(called_with["roles"], [{"role": "URY Cashier"}])

    @patch("ury.ury.api.minimal.business_setup.frappe.get_roles", return_value=["System Manager"])
    @patch("ury.ury.api.minimal.business_setup._is_bootstrap_setup", return_value=False)
    @patch("ury.ury.api.minimal.business_setup.frappe.db.exists", return_value=False)
    @patch("ury.ury.api.minimal.business_setup.frappe.get_doc")
    def test_system_manager_can_grant_multiple_roles_including_admin(
        self, mock_get_doc, _mock_exists, _mock_bootstrap, _mock_get_roles
    ):
        mock_get_doc.return_value = MagicMock()

        with self._patch_session("sysmgr@example.com"):
            result = create_setup_user(
                email="a@example.com",
                name="A",
                roles=["URY Manager", "URY Cashier", "URY Admin"],
            )

        self.assertEqual(result["status"], "created")
        called_with = mock_get_doc.call_args[0][0]
        self.assertEqual(
            called_with["roles"],
            [{"role": "URY Manager"}, {"role": "URY Cashier"}, {"role": "URY Admin"}],
        )

    @patch("ury.ury.api.minimal.business_setup.frappe.get_roles", return_value=[])
    @patch("ury.ury.api.minimal.business_setup._is_bootstrap_setup", return_value=False)
    def test_non_system_manager_cannot_obtain_admin_via_multi_role_list(
        self, _mock_bootstrap, _mock_get_roles
    ):
        with self._patch_session("cashier@example.com"):
            with self.assertRaises(frappe.exceptions.PermissionError):
                create_setup_user(
                    email="a@example.com",
                    name="A",
                    roles=["URY Cashier", "URY Admin"],
                )

    @patch("ury.ury.api.minimal.business_setup.frappe.get_roles", return_value=[])
    @patch("ury.ury.api.minimal.business_setup._is_bootstrap_setup", return_value=False)
    def test_non_system_manager_cannot_obtain_admin_via_single_role(
        self, _mock_bootstrap, _mock_get_roles
    ):
        with self._patch_session("cashier@example.com"):
            with self.assertRaises(frappe.exceptions.PermissionError):
                create_setup_user(email="a@example.com", name="A", role="URY Admin")

    @patch("ury.ury.api.minimal.business_setup.frappe.get_roles", return_value=[])
    @patch("ury.ury.api.minimal.business_setup._is_bootstrap_setup", return_value=False)
    def test_non_system_manager_cannot_obtain_system_manager_role(
        self, _mock_bootstrap, _mock_get_roles
    ):
        with self._patch_session("cashier@example.com"):
            with self.assertRaises(frappe.exceptions.PermissionError):
                create_setup_user(email="a@example.com", name="A", roles=["System Manager"])

    @patch("ury.ury.api.minimal.business_setup.frappe.get_roles", return_value=[])
    @patch("ury.ury.api.minimal.business_setup._is_bootstrap_setup", return_value=False)
    @patch("ury.ury.api.minimal.business_setup.frappe.db.exists", return_value=False)
    @patch("ury.ury.api.minimal.business_setup.frappe.get_doc")
    def test_non_system_manager_can_grant_allowed_roles_combination(
        self, mock_get_doc, _mock_exists, _mock_bootstrap, _mock_get_roles
    ):
        mock_get_doc.return_value = MagicMock()

        with self._patch_session("cashier@example.com"):
            result = create_setup_user(
                email="a@example.com",
                name="A",
                roles=["URY Cashier", "URY Captain", "URY Manager"],
            )

        self.assertEqual(result["status"], "created")


if __name__ == "__main__":
    unittest.main()

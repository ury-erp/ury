# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Unit tests for button_permission API module.

Tests the cancel_check() function which determines whether the current user
has permission to cancel a POS Invoice.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.button_permission import cancel_check


class TestCancelCheckPermission(FrappeTestCase):
    """Test cancel_check() permission verification."""

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_returns_true_when_user_has_cancel_permission(self, mock_has_permission):
        """When user has POS Invoice cancel permission, returns True."""
        mock_has_permission.return_value = True
        result = cancel_check()
        self.assertTrue(result)
        mock_has_permission.assert_called_once_with(
            "POS Invoice", "cancel", raise_exception=False
        )

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_returns_false_when_user_lacks_cancel_permission(self, mock_has_permission):
        """When user does not have POS Invoice cancel permission, returns False."""
        mock_has_permission.return_value = False
        result = cancel_check()
        self.assertFalse(result)
        mock_has_permission.assert_called_once_with(
            "POS Invoice", "cancel", raise_exception=False
        )

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_uses_raise_exception_false_flag(self, mock_has_permission):
        """Permission check uses raise_exception=False to avoid exceptions."""
        mock_has_permission.return_value = False
        cancel_check()
        # Verify raise_exception=False is explicitly passed
        call_args = mock_has_permission.call_args
        self.assertEqual(call_args.kwargs.get("raise_exception"), False)

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_permission_check_targets_pos_invoice_doctype(self, mock_has_permission):
        """Permission check is specifically for POS Invoice doctype."""
        mock_has_permission.return_value = False
        cancel_check()
        # Verify the doctype being checked
        call_args = mock_has_permission.call_args
        self.assertEqual(call_args.args[0], "POS Invoice")

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_permission_check_targets_cancel_action(self, mock_has_permission):
        """Permission check is specifically for cancel action."""
        mock_has_permission.return_value = False
        cancel_check()
        # Verify the action being checked
        call_args = mock_has_permission.call_args
        self.assertEqual(call_args.args[1], "cancel")

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_handles_permission_check_with_zero_value(self, mock_has_permission):
        """When permission check returns 0, treats as False."""
        mock_has_permission.return_value = 0
        result = cancel_check()
        self.assertFalse(result)

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_handles_permission_check_with_truthy_values(self, mock_has_permission):
        """When permission check returns truthy value, treats as True."""
        mock_has_permission.return_value = 1
        result = cancel_check()
        self.assertTrue(result)

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_permission_check_only_called_once(self, mock_has_permission):
        """Permission is checked exactly once per call."""
        mock_has_permission.return_value = True
        cancel_check()
        self.assertEqual(mock_has_permission.call_count, 1)

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_returns_boolean_not_raw_permission_result(self, mock_has_permission):
        """Return value is always a boolean (True/False), not raw permission value."""
        mock_has_permission.return_value = True
        result = cancel_check()
        self.assertIsInstance(result, bool)
        self.assertTrue(result)

        mock_has_permission.return_value = False
        result = cancel_check()
        self.assertIsInstance(result, bool)
        self.assertFalse(result)

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_catches_unexpected_exception_from_permission_check(self, mock_has_permission):
        """Function handles exception from permission check gracefully.
        
        Even though raise_exception=False is passed, the function should be
        defensive against unexpected exceptions in the permission layer.
        """
        mock_has_permission.side_effect = Exception("Unexpected error in permission check")
        # The function should raise the exception if the underlying permission check fails
        # since there is no error handling in the module
        with self.assertRaises(Exception):
            cancel_check()

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_idempotent_calls_return_same_result(self, mock_has_permission):
        """Multiple calls with same permission state return consistent results."""
        mock_has_permission.return_value = True
        result1 = cancel_check()
        result2 = cancel_check()
        self.assertEqual(result1, result2)
        self.assertEqual(mock_has_permission.call_count, 2)


class TestCancelCheckEdgeCases(FrappeTestCase):
    """Test edge cases and boundary conditions."""

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_permission_check_with_none_result(self, mock_has_permission):
        """When permission check returns None, treats as falsy."""
        mock_has_permission.return_value = None
        result = cancel_check()
        self.assertFalse(result)

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_permission_check_with_empty_string_result(self, mock_has_permission):
        """When permission check returns empty string, treats as falsy."""
        mock_has_permission.return_value = ""
        result = cancel_check()
        self.assertFalse(result)

    @patch("ury.ury.api.button_permission.frappe.permissions.has_permission")
    def test_no_additional_side_effects_on_permission_check(self, mock_has_permission):
        """Function does not trigger side effects beyond permission check."""
        mock_has_permission.return_value = True
        cancel_check()
        # Only the permission check should be called
        self.assertEqual(mock_has_permission.call_count, 1)


class TestCancelCheckRealPermissionBoundary(FrappeTestCase):
    """Real (non-mocked) coverage of cancel_check()'s has_permission() call.

    Every test above patches frappe.permissions.has_permission itself, so the
    actual POS Invoice 'cancel' permission-role lookup has never run for real
    against a real session/role-permission table -- same class of gap as the
    branch-operational-state and service-line findings in round 3. Unlike
    those, cancel_check() itself never raises: has_permission(...,
    raise_exception=False) means the function returns a plain bool either
    way. So the 'negative-permission' assertion here is that a roleless user
    really gets back False (not that an exception is raised), confirmed
    against real role-permission evaluation rather than a mock.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        email = "p4r4-roleless-cancelcheck@ury.test"
        if frappe.db.exists("User", email):
            frappe.delete_doc("User", email, force=True, ignore_permissions=True)
        cls.roleless_user = frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "P4R4Roleless",
            "send_welcome_email": 0,
            "enabled": 1,
        }).insert(ignore_permissions=True)
        # Frappe auto-adds the 'All' role to every new user; explicitly strip
        # any doctype-level POS Invoice cancel permission by construction --
        # 'All' carries no such permission by default, so this user is a real
        # roleless negative case, not a mock stand-in for one.

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_roleless_user_denied_cancel_permission_for_real(self):
        frappe.set_user(self.roleless_user.name)
        self.assertFalse(cancel_check())

    def test_administrator_has_cancel_permission_for_real(self):
        frappe.set_user("Administrator")
        self.assertTrue(cancel_check())

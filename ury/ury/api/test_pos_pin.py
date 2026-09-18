# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import unittest
from unittest.mock import MagicMock, call, patch

import frappe

from ury.ury.api import pos_pin
from ury.ury.api.pos_pin import (
	_find_user_for_pin,
	_register_terminal_failure,
	enroll_terminal,
	get_pin_login_status,
	login_with_pin,
)
from ury.ury.doctype.ury_pos_pin_settings.ury_pos_pin_settings import validate_pin_format


MOD = "ury.ury.api.pos_pin"


def _terminal(terminal_id="T1", branch="Main"):
	terminal = MagicMock()
	terminal.terminal_id = terminal_id
	terminal.branch = branch
	terminal.name = terminal_id
	return terminal


class _FakeCache:
	"""Minimal in-memory stand-in for frappe.cache() (ignores TTL)."""

	def __init__(self):
		self.store = {}

	def get_value(self, key):
		return self.store.get(key)

	def set_value(self, key, value, expires_in_sec=None):
		self.store[key] = value

	def delete_value(self, key):
		self.store.pop(key, None)


class TestPOSPinStatus(unittest.TestCase):
	def test_status_requires_enrollment_when_no_terminal(self):
		with patch(f"{MOD}._resolve_terminal_from_cookie", return_value=None), patch(
			f"{MOD}.frappe.session", MagicMock(user="Guest")
		):
			result = get_pin_login_status()

		self.assertEqual(
			result,
			{
				"enabled": False,
				"authenticated": False,
				"enrollment_required": True,
				"min_length": 4,
				"max_length": 6,
			},
		)
		self.assertNotIn("users", result)

	def test_status_offers_keypad_on_enrolled_terminal(self):
		with patch(f"{MOD}._resolve_terminal_from_cookie", return_value=_terminal()), patch(
			f"{MOD}._eligible_settings",
			return_value=[frappe._dict({"name": "c@example.com", "user": "c@example.com"})],
		), patch(f"{MOD}.frappe.session", MagicMock(user="Guest")):
			result = get_pin_login_status()

		self.assertTrue(result["enabled"])
		self.assertFalse(result["enrollment_required"])


class TestPOSPinLogin(unittest.TestCase):
	@patch(f"{MOD}.check_password")
	@patch(f"{MOD}._eligible_settings")
	def test_pin_lookup_checks_hashes_until_it_finds_a_match(self, mock_settings, mock_check):
		mock_settings.return_value = [
			frappe._dict({"name": "first@example.com", "user": "first@example.com"}),
			frappe._dict({"name": "second@example.com", "user": "second@example.com"}),
		]
		mock_check.side_effect = [frappe.AuthenticationError(), None]

		self.assertEqual(_find_user_for_pin("2468", "Main"), "second@example.com")
		mock_settings.assert_called_once_with("Main")
		self.assertEqual(
			mock_check.call_args_list,
			[
				call(
					"first@example.com",
					"2468",
					doctype="URY POS PIN Settings",
					fieldname="pos_pin",
					delete_tracker_cache=False,
				),
				call(
					"second@example.com",
					"2468",
					doctype="URY POS PIN Settings",
					fieldname="pos_pin",
					delete_tracker_cache=False,
				),
			],
		)

	@patch(f"{MOD}._find_user_for_pin")
	@patch(f"{MOD}._reject_pin_login", side_effect=frappe.AuthenticationError())
	@patch(f"{MOD}._resolve_terminal_from_cookie", return_value=None)
	def test_login_without_enrolled_terminal_is_rejected(self, _mock_resolve, _mock_reject, mock_find):
		with patch(f"{MOD}.frappe.session", MagicMock(user="Guest")):
			with self.assertRaises(frappe.AuthenticationError):
				login_with_pin("2468")

		mock_find.assert_not_called()

	@patch(f"{MOD}._find_user_for_pin")
	@patch(f"{MOD}._register_terminal_failure")
	@patch(f"{MOD}._reject_pin_login", side_effect=frappe.AuthenticationError())
	@patch(f"{MOD}._is_terminal_locked", return_value=False)
	@patch(f"{MOD}._resolve_terminal_from_cookie")
	def test_invalid_format_is_rejected_before_hash_lookup(
		self, mock_resolve, _mock_locked, _mock_reject, _mock_fail, mock_find
	):
		mock_resolve.return_value = _terminal()
		with patch(f"{MOD}.frappe.session", MagicMock(user="Guest")):
			with self.assertRaises(frappe.AuthenticationError):
				login_with_pin("12ab")

		mock_find.assert_not_called()

	@patch(f"{MOD}._find_user_for_pin")
	@patch(f"{MOD}._reject_pin_login", side_effect=frappe.AuthenticationError())
	@patch(f"{MOD}._is_terminal_locked", return_value=True)
	@patch(f"{MOD}._resolve_terminal_from_cookie")
	def test_locked_terminal_is_rejected_before_hash_lookup(
		self, mock_resolve, _mock_locked, _mock_reject, mock_find
	):
		mock_resolve.return_value = _terminal()
		with patch(f"{MOD}.frappe.session", MagicMock(user="Guest")):
			with self.assertRaises(frappe.AuthenticationError):
				login_with_pin("2468")

		mock_find.assert_not_called()

	@patch(f"{MOD}._record_audit")
	@patch(f"{MOD}._record_login")
	@patch(f"{MOD}.LoginManager")
	@patch(f"{MOD}._clear_terminal_failures")
	@patch(f"{MOD}.is_user_in_branch", return_value=True)
	@patch(f"{MOD}.is_eligible_pos_user", return_value=True)
	@patch(f"{MOD}._find_user_for_pin", return_value="cashier@example.com")
	@patch(f"{MOD}._is_terminal_locked", return_value=False)
	@patch(f"{MOD}._resolve_terminal_from_cookie")
	def test_successful_login_creates_session_and_clears_lock(
		self,
		mock_resolve,
		_mock_locked,
		_mock_find,
		_mock_eligible,
		_mock_branch,
		mock_clear,
		mock_login_manager,
		_mock_record_login,
		_mock_audit,
	):
		terminal = _terminal()
		mock_resolve.return_value = terminal
		manager_instance = MagicMock()
		mock_login_manager.return_value = manager_instance

		with patch(f"{MOD}.frappe.session", MagicMock(user="Guest")), patch(
			f"{MOD}.frappe.local", MagicMock(login_manager=None)
		), patch(f"{MOD}.frappe.utils.get_fullname", return_value="Cashier"):
			result = login_with_pin("2468")

		manager_instance.login_as.assert_called_once_with("cashier@example.com")
		mock_clear.assert_called_once_with("T1")
		terminal.touch_last_seen.assert_called_once()
		self.assertEqual(result["user"], "cashier@example.com")
		self.assertEqual(result["redirect_to"], "/pos")

	def test_authenticated_user_cannot_switch_without_logout(self):
		with patch(f"{MOD}.frappe.session", MagicMock(user="cashier@example.com")):
			with self.assertRaises(frappe.PermissionError):
				login_with_pin("2468")


class TestPOSPinLockout(unittest.TestCase):
	def test_repeated_failures_lock_the_terminal(self):
		cache = _FakeCache()
		with patch(f"{MOD}.frappe.cache", return_value=cache), patch(
			f"{MOD}.frappe.scrub", side_effect=lambda value: value
		):
			for _ in range(pos_pin.LOCK_FAIL_THRESHOLD):
				_register_terminal_failure("T1")

			self.assertTrue(pos_pin._is_terminal_locked("T1"))

	def test_clear_removes_lock_state(self):
		cache = _FakeCache()
		with patch(f"{MOD}.frappe.cache", return_value=cache), patch(
			f"{MOD}.frappe.scrub", side_effect=lambda value: value
		):
			for _ in range(pos_pin.LOCK_FAIL_THRESHOLD):
				_register_terminal_failure("T1")
			pos_pin._clear_terminal_failures("T1")

			self.assertFalse(pos_pin._is_terminal_locked("T1"))


class TestTerminalEnrollment(unittest.TestCase):
	@patch(f"{MOD}.frappe.db")
	def test_enroll_rejects_unknown_terminal(self, mock_db):
		mock_db.get_value.return_value = None
		with self.assertRaises(frappe.AuthenticationError):
			enroll_terminal("ghost", "code123")

	@patch(f"{MOD}._set_terminal_cookie")
	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.frappe.db")
	def test_enroll_with_valid_code_issues_credential_and_cookie(
		self, mock_db, mock_get_doc, mock_cookie
	):
		mock_db.get_value.return_value = "T1"
		terminal = _terminal()
		terminal.verify_enrollment_code.return_value = True
		terminal.issue_credential.return_value = "raw-credential"
		terminal.terminal_name = "Front Till"
		mock_get_doc.return_value = terminal

		result = enroll_terminal("T1", "good-code")

		terminal.issue_credential.assert_called_once()
		mock_cookie.assert_called_once_with("raw-credential")
		self.assertEqual(result["terminal_id"], "T1")

	@patch(f"{MOD}.frappe.get_doc")
	@patch(f"{MOD}.frappe.db")
	def test_enroll_rejects_bad_code(self, mock_db, mock_get_doc):
		mock_db.get_value.return_value = "T1"
		terminal = _terminal()
		terminal.verify_enrollment_code.return_value = False
		mock_get_doc.return_value = terminal

		with self.assertRaises(frappe.AuthenticationError):
			enroll_terminal("T1", "bad-code")


class TestPOSPinSettingsValidation(unittest.TestCase):
	def test_pin_format_accepts_four_to_six_digits(self):
		self.assertEqual(validate_pin_format("1234"), "1234")
		self.assertEqual(validate_pin_format("123456"), "123456")

	def test_pin_format_rejects_short_long_and_non_numeric_values(self):
		for value in ("123", "1234567", "12ab"):
			with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
				validate_pin_format(value)

# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import unittest
from unittest.mock import MagicMock, call, patch

import frappe

from ury.ury.api.pos_pin import _find_user_for_pin, get_pin_login_status, login_with_pin
from ury.ury.doctype.ury_pos_pin_settings.ury_pos_pin_settings import validate_pin_format


MOD = "ury.ury.api.pos_pin"


class TestPOSPinLogin(unittest.TestCase):
	@patch(f"{MOD}.is_eligible_pos_user", return_value=True)
	@patch(f"{MOD}.frappe.get_all")
	def test_status_exposes_capability_without_user_enumeration(self, mock_get_all, _mock_eligible):
		mock_get_all.return_value = [
			frappe._dict({"name": "cashier@example.com", "user": "cashier@example.com"})
		]

		with patch(f"{MOD}.frappe.session", MagicMock(user="Guest")):
			result = get_pin_login_status()

		self.assertEqual(
			result,
			{
				"enabled": True,
				"authenticated": False,
				"min_length": 4,
				"max_length": 6,
			},
		)
		self.assertNotIn("users", result)

	@patch(f"{MOD}.check_password")
	@patch(f"{MOD}._eligible_settings")
	def test_pin_lookup_checks_hashes_until_it_finds_a_match(self, mock_settings, mock_check):
		mock_settings.return_value = [
			frappe._dict({"name": "first@example.com", "user": "first@example.com"}),
			frappe._dict({"name": "second@example.com", "user": "second@example.com"}),
		]
		mock_check.side_effect = [frappe.AuthenticationError(), None]

		self.assertEqual(_find_user_for_pin("2468"), "second@example.com")
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
	def test_invalid_format_is_rejected_before_hash_lookup(self, _mock_reject, mock_find):
		with patch(f"{MOD}.frappe.session", MagicMock(user="Guest")):
			with self.assertRaises(frappe.AuthenticationError):
				login_with_pin("12ab")

		mock_find.assert_not_called()


class TestPOSPinSettingsValidation(unittest.TestCase):
	def test_pin_format_accepts_four_to_six_digits(self):
		self.assertEqual(validate_pin_format("1234"), "1234")
		self.assertEqual(validate_pin_format("123456"), "123456")

	def test_pin_format_rejects_short_long_and_non_numeric_values(self):
		for value in ("123", "1234567", "12ab"):
			with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
				validate_pin_format(value)

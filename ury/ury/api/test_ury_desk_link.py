"""Tests for ury_desk_link API module.

This module provides a batched, doctype-level permission probe for the
frontend's "Open in Desk" links. Tests cover the parsing logic and the
main permission-checking endpoint.
"""

import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_desk_link import (
	MAX_DOCTYPES_PER_CALL,
	_parse_doctypes,
	get_desk_permissions,
)


class TestParseDoctypes(FrappeTestCase):
	"""Tests for _parse_doctypes normalisation function."""

	def test_parse_single_string_doctype(self):
		"""Single doctype name as string input."""
		result = _parse_doctypes("POS Invoice")
		self.assertEqual(result, ["POS Invoice"])

	def test_parse_whitespace_stripped(self):
		"""Whitespace around doctype names is trimmed."""
		result = _parse_doctypes("  POS Invoice  ")
		self.assertEqual(result, ["POS Invoice"])

	def test_parse_python_list(self):
		"""Python list of doctype names."""
		result = _parse_doctypes(["POS Invoice", "Work Order"])
		self.assertEqual(result, ["POS Invoice", "Work Order"])

	def test_parse_python_tuple(self):
		"""Python tuple of doctype names."""
		result = _parse_doctypes(("POS Invoice", "Work Order"))
		self.assertEqual(result, ["POS Invoice", "Work Order"])

	def test_parse_json_array_string(self):
		"""JSON array encoded as a string (how frappe.call serialises it)."""
		json_str = json.dumps(["POS Invoice", "Work Order"])
		result = _parse_doctypes(json_str)
		self.assertEqual(result, ["POS Invoice", "Work Order"])

	def test_parse_json_array_with_whitespace(self):
		"""JSON array string with surrounding whitespace."""
		json_str = f"  {json.dumps(['POS Invoice', 'Work Order'])}  "
		result = _parse_doctypes(json_str)
		self.assertEqual(result, ["POS Invoice", "Work Order"])

	def test_parse_deduplicates_repeated_doctypes(self):
		"""Repeated doctypes appear only once in output."""
		result = _parse_doctypes(["POS Invoice", "Work Order", "POS Invoice"])
		self.assertEqual(result, ["POS Invoice", "Work Order"])

	def test_parse_truncates_at_max_doctypes(self):
		"""Exceeding MAX_DOCTYPES_PER_CALL truncates the result."""
		doctypes = [f"Doctype{i}" for i in range(MAX_DOCTYPES_PER_CALL + 5)]
		result = _parse_doctypes(doctypes)
		self.assertEqual(len(result), MAX_DOCTYPES_PER_CALL)
		self.assertEqual(result, doctypes[:MAX_DOCTYPES_PER_CALL])

	def test_parse_skips_non_string_entries_in_list(self):
		"""Non-string entries in list input are skipped."""
		result = _parse_doctypes(["POS Invoice", 123, None, "Work Order", {}])
		self.assertEqual(result, ["POS Invoice", "Work Order"])

	def test_parse_skips_empty_strings(self):
		"""Empty strings and whitespace-only strings are skipped."""
		result = _parse_doctypes(["POS Invoice", "", "   ", "Work Order"])
		self.assertEqual(result, ["POS Invoice", "Work Order"])

	def test_parse_non_list_input_returns_empty(self):
		"""Non-string, non-list input returns empty list."""
		self.assertEqual(_parse_doctypes(123), [])
		self.assertEqual(_parse_doctypes({"key": "value"}), [])
		self.assertEqual(_parse_doctypes(None), [])

	def test_parse_invalid_json_string_treated_as_plain_string(self):
		"""String that looks like JSON but isn't valid is treated as a plain doctype name."""
		result = _parse_doctypes("[not valid json")
		self.assertEqual(result, ["[not valid json"])

	def test_parse_empty_json_array(self):
		"""Empty JSON array string."""
		result = _parse_doctypes("[]")
		self.assertEqual(result, [])

	def test_parse_empty_list(self):
		"""Empty Python list."""
		result = _parse_doctypes([])
		self.assertEqual(result, [])


class TestGetDeskPermissions(FrappeTestCase):
	"""Tests for the get_desk_permissions endpoint."""

	@patch("ury.ury.api.ury_desk_link.frappe.session")
	@patch("ury.ury.api.ury_desk_link.frappe.throw")
	def test_rejects_guest_user(self, mock_throw, mock_session):
		"""Guest user is rejected with PermissionError."""
		mock_session.user = "Guest"
		get_desk_permissions("POS Invoice")
		mock_throw.assert_called_once()
		call_args = mock_throw.call_args
		self.assertIn("Not permitted", str(call_args))

	@patch("ury.ury.api.ury_desk_link.frappe.session")
	@patch("ury.ury.api.ury_desk_link.frappe.throw")
	def test_rejects_none_user(self, mock_throw, mock_session):
		"""None user is rejected with PermissionError."""
		mock_session.user = None
		get_desk_permissions("POS Invoice")
		mock_throw.assert_called_once()

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_returns_read_and_write_permissions(self, mock_session, mock_has_perm):
		"""Returns both read and write permission flags for each doctype."""
		mock_session.user = "test_user"
		mock_has_perm.side_effect = [True, True]  # read=True, write=True

		result = get_desk_permissions("POS Invoice")

		self.assertEqual(result, {"POS Invoice": {"read": True, "write": True}})
		self.assertEqual(mock_has_perm.call_count, 2)

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_returns_false_for_no_permissions(self, mock_session, mock_has_perm):
		"""Returns False/False when user has no permissions."""
		mock_session.user = "test_user"
		mock_has_perm.side_effect = [False, False]

		result = get_desk_permissions("POS Invoice")

		self.assertEqual(result, {"POS Invoice": {"read": False, "write": False}})

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_returns_asymmetric_permissions(self, mock_session, mock_has_perm):
		"""Correctly reports read-only (no write) permission."""
		mock_session.user = "test_user"
		mock_has_perm.side_effect = [True, False]  # read=True, write=False

		result = get_desk_permissions("POS Invoice")

		self.assertEqual(result, {"POS Invoice": {"read": True, "write": False}})

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_multiple_doctypes_in_batch(self, mock_session, mock_has_perm):
		"""Batches multiple doctype permission checks."""
		mock_session.user = "test_user"
		# POS Invoice: read=True, write=True
		# Work Order: read=True, write=False
		# Stock Movement: read=False, write=False
		mock_has_perm.side_effect = [
			True, True,   # POS Invoice
			True, False,  # Work Order
			False, False, # Stock Movement
		]

		result = get_desk_permissions(
			["POS Invoice", "Work Order", "Stock Movement"]
		)

		self.assertEqual(
			result,
			{
				"POS Invoice": {"read": True, "write": True},
				"Work Order": {"read": True, "write": False},
				"Stock Movement": {"read": False, "write": False},
			}
		)

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_unknown_doctype_returns_false_false(self, mock_session, mock_has_perm):
		"""Unknown/non-existent doctype returns False/False, not error."""
		mock_session.user = "test_user"
		# has_permission raises for unknown doctype
		mock_has_perm.side_effect = Exception("DocType NotReal not found")

		result = get_desk_permissions("NotReal")

		self.assertEqual(result, {"NotReal": {"read": False, "write": False}})

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_fails_closed_on_has_permission_hook_error(
		self, mock_session, mock_has_perm
	):
		"""When has_permission hook raises, entry fails closed to False/False."""
		mock_session.user = "test_user"
		mock_has_perm.side_effect = Exception("Permission hook error")

		result = get_desk_permissions("POS Invoice")

		self.assertEqual(result, {"POS Invoice": {"read": False, "write": False}})

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_batch_partial_failure_continues(self, mock_session, mock_has_perm):
		"""If one doctype fails, batch continues with other doctypes."""
		mock_session.user = "test_user"
		# POS Invoice OK: read=True, write=True
		# Work Order fails
		# Stock Movement OK: read=False, write=False
		mock_has_perm.side_effect = [
			True, True,  # POS Invoice
			Exception("DocType error"),  # Work Order read fails
			False, False,  # Stock Movement
		]

		result = get_desk_permissions(
			["POS Invoice", "Work Order", "Stock Movement"]
		)

		self.assertEqual(
			result,
			{
				"POS Invoice": {"read": True, "write": True},
				"Work Order": {"read": False, "write": False},
				"Stock Movement": {"read": False, "write": False},
			}
		)

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_coerces_permissions_to_bool(self, mock_session, mock_has_perm):
		"""Permission values are always coerced to strict boolean."""
		mock_session.user = "test_user"
		# Simulating has_permission returning truthy/falsy values instead of bools
		mock_has_perm.side_effect = [
			1,  # truthy but not True
			"write",  # truthy but not True
		]

		result = get_desk_permissions("POS Invoice")

		self.assertIs(result["POS Invoice"]["read"], True)
		self.assertIs(result["POS Invoice"]["write"], True)

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_accepts_json_array_string_input(self, mock_session, mock_has_perm):
		"""Accepts JSON array format (how frappe.call sends lists from JS)."""
		mock_session.user = "test_user"
		mock_has_perm.side_effect = [True, True, True, True]

		json_input = json.dumps(["POS Invoice", "Work Order"])
		result = get_desk_permissions(json_input)

		self.assertIn("POS Invoice", result)
		self.assertIn("Work Order", result)

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_respects_max_doctypes_limit(self, mock_session, mock_has_perm):
		"""Batch is silently truncated at MAX_DOCTYPES_PER_CALL."""
		mock_session.user = "test_user"
		# Return enough permission pairs for only the first MAX_DOCTYPES
		mock_has_perm.side_effect = (
			[True, False] * MAX_DOCTYPES_PER_CALL
		)

		# Request more than the limit
		doctypes = [f"Doctype{i}" for i in range(MAX_DOCTYPES_PER_CALL + 5)]
		result = get_desk_permissions(doctypes)

		# Only the first MAX_DOCTYPES_PER_CALL should be in result
		self.assertEqual(len(result), MAX_DOCTYPES_PER_CALL)

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_deduplicates_repeated_doctypes_in_batch(
		self, mock_session, mock_has_perm
	):
		"""Duplicate doctype names in input are de-duplicated."""
		mock_session.user = "test_user"
		# Only check permissions twice (once per unique doctype)
		mock_has_perm.side_effect = [True, False, True, False]

		result = get_desk_permissions(
			["POS Invoice", "Work Order", "POS Invoice"]
		)

		# Result should have only 2 entries (deduped)
		self.assertEqual(len(result), 2)
		self.assertIn("POS Invoice", result)
		self.assertIn("Work Order", result)
		# has_permission should only be called 4 times (2 doctypes * 2 permissions)
		self.assertEqual(mock_has_perm.call_count, 4)

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_handles_empty_doctype_list(self, mock_session, mock_has_perm):
		"""Empty input results in empty output, not error."""
		mock_session.user = "test_user"

		result = get_desk_permissions([])

		self.assertEqual(result, {})
		mock_has_perm.assert_not_called()

	@patch("ury.ury.api.ury_desk_link.frappe.has_permission")
	@patch("ury.ury.api.ury_desk_link.frappe.session")
	def test_handles_whitespace_only_doctype_names(
		self, mock_session, mock_has_perm
	):
		"""Whitespace-only doctype names are filtered out."""
		mock_session.user = "test_user"
		mock_has_perm.side_effect = [True, False]

		result = get_desk_permissions(["  ", "POS Invoice", "\t"])

		self.assertEqual(result, {"POS Invoice": {"read": True, "write": False}})
		# Only one doctype should be checked
		self.assertEqual(mock_has_perm.call_count, 2)

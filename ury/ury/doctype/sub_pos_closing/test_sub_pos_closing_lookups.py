# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# See license.txt
"""Tests for the two whitelisted lookup helpers in sub_pos_closing.py that
had no test reference anywhere in the suite (COVERAGE_GAP_ANALYSIS.md Table
1, "cashier/payment reconciliation" priority): `get_pos_profile` and
`get_cashiers`. Both are thin read-only wrappers, mocked per this track's
mock-for-read-paths convention (see test_sub_pos_closing.py alongside this
file for the same pattern applied to `get_pos_invoices`).
"""

from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.sub_pos_closing.sub_pos_closing import (
	get_cashiers,
	get_pos_profile,
)

MODULE = "ury.ury.doctype.sub_pos_closing.sub_pos_closing"


class TestGetPosProfile(FrappeTestCase):
	def test_resolves_pos_profile_for_session_branch(self):
		with patch(f"{MODULE}.getBranch", return_value="Branch A") as mock_get_branch, \
			patch(f"{MODULE}.frappe.db.get_value", return_value="POS-A") as mock_get_value:
			result = get_pos_profile()

		mock_get_branch.assert_called_once()
		mock_get_value.assert_called_once_with(
			"POS Profile", {"branch": "Branch A"}, "name"
		)
		self.assertEqual(result, "POS-A")

	def test_returns_none_when_no_pos_profile_for_branch(self):
		with patch(f"{MODULE}.getBranch", return_value="Branch Z"), \
			patch(f"{MODULE}.frappe.db.get_value", return_value=None):
			result = get_pos_profile()
		self.assertIsNone(result)


class TestGetCashiers(FrappeTestCase):
	def test_returns_users_from_pos_profile_user(self):
		with patch(
			f"{MODULE}.frappe.get_all",
			return_value=[["cashier1@test.com"], ["cashier2@test.com"]],
		) as mock_get_all:
			result = get_cashiers(
				doctype="User",
				txt="",
				searchfield="name",
				start=0,
				page_len=20,
				filters={"pos_profile": "POS-A"},
			)

		mock_get_all.assert_called_once_with(
			"POS Profile User",
			filters={"pos_profile": "POS-A"},
			fields=["user"],
			as_list=1,
		)
		self.assertEqual(result, [["cashier1@test.com"], ["cashier2@test.com"]])

	def test_returns_empty_list_when_no_cashiers(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=[]):
			result = get_cashiers(
				doctype="User",
				txt="",
				searchfield="name",
				start=0,
				page_len=20,
				filters={"pos_profile": "POS-EMPTY"},
			)
		self.assertEqual(result, [])

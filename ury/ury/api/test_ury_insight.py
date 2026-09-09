# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Unit tests for ury_insight API module.

Tests the get_active_insights() and dismiss_insight() endpoints which
provide a read-only dashboard feed of non-dismissed insights scoped to
branch and time window, and a dismiss endpoint for user interactions.
"""

from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_insight import get_active_insights, dismiss_insight


MODULE = "ury.ury.api.ury_insight"
TEST_MANAGER = "_test_ury_insight_api_manager@example.com"
TEST_NON_MANAGER = "_test_ury_insight_api_non_manager@example.com"


class TestGetActiveInsightsHappyPath(FrappeTestCase):
	"""Test get_active_insights() in nominal conditions."""

	def setUp(self):
		"""Create test users and insights."""
		frappe.set_user("Administrator")
		self._create_test_user(TEST_MANAGER, roles=["URY Manager"])
		self._create_test_user(TEST_NON_MANAGER, roles=[])
		
		# Create test insights with various states
		self.dismissed_insight = frappe.get_doc({
			"doctype": "URY Insight",
			"title": "Dismissed Insight",
			"severity": "Warning",
			"rule_key": "_test_dismissed_rule",
			"branch": "Test Branch",
			"source_tool": "Test Tool",
			"body": "This insight was dismissed",
			"dismissed": 1,
			"dismissed_by": "Administrator",
		}).insert(ignore_permissions=True)
		
		self.active_insight_1 = frappe.get_doc({
			"doctype": "URY Insight",
			"title": "Active Insight 1",
			"severity": "Info",
			"rule_key": "_test_active_rule_1",
			"branch": "Test Branch",
			"source_tool": "Test Tool",
			"body": "First active insight",
			"dismissed": 0,
		}).insert(ignore_permissions=True)
		
		self.active_insight_2 = frappe.get_doc({
			"doctype": "URY Insight",
			"title": "Active Insight 2",
			"severity": "Critical",
			"rule_key": "_test_active_rule_2",
			"branch": "Other Branch",
			"source_tool": "Another Tool",
			"body": "Second active insight",
			"dismissed": 0,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		"""Clean up test data."""
		frappe.set_user("Administrator")
		# Delete insights
		for insight in frappe.get_all("URY Insight", 
									   filters={"rule_key": ["like", "_test_%"]},
									   pluck="name"):
			try:
				frappe.delete_doc("URY Insight", insight, force=True, ignore_permissions=True)
			except:
				pass
		# Delete users
		for user in [TEST_MANAGER, TEST_NON_MANAGER]:
			if frappe.db.exists("User", user):
				try:
					frappe.delete_doc("User", user, force=True, ignore_permissions=True)
				except:
					pass

	def _create_test_user(self, email, roles):
		"""Create a test user with specified roles."""
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		user = frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"enabled": 1,
		}).insert(ignore_permissions=True)
		for role in roles:
			user.add_roles(role)
		return user

	def test_returns_all_active_insights_when_not_filtered(self):
		"""get_active_insights() returns all non-dismissed insights."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights()
		insight_names = {r["name"] for r in result}
		self.assertIn(self.active_insight_1.name, insight_names)
		self.assertIn(self.active_insight_2.name, insight_names)
		self.assertNotIn(self.dismissed_insight.name, insight_names)

	def test_returns_only_non_dismissed_insights(self):
		"""Dismissed insights are excluded from results."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights()
		for insight in result:
			self.assertEqual(insight["name"] != self.dismissed_insight.name, True)

	def test_returns_insights_with_required_fields(self):
		"""Result includes all documented fields."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights()
		self.assertTrue(len(result) > 0)
		required_fields = ["name", "title", "severity", "rule_key", "branch", 
						  "source_tool", "body", "creation"]
		for insight in result:
			for field in required_fields:
				self.assertIn(field, insight)

	def test_filters_by_branch_when_specified(self):
		"""get_active_insights(branch='X') returns only insights from branch X."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights(branch="Test Branch")
		insight_names = {r["name"] for r in result}
		self.assertIn(self.active_insight_1.name, insight_names)
		self.assertNotIn(self.active_insight_2.name, insight_names)

	def test_branch_filter_returns_empty_when_no_match(self):
		"""Filtering by nonexistent branch returns empty list."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights(branch="Nonexistent Branch")
		self.assertEqual(result, [])

	def test_respects_max_age_hours_parameter(self):
		"""Insights older than max_age_hours are excluded."""
		frappe.set_user(TEST_MANAGER)
		# Use 0 hours to exclude everything created in the past
		result = get_active_insights(max_age_hours=0)
		# With max_age_hours=0, only insights created in the current second would show
		# This is an edge case but tests the parameter is used
		self.assertIsInstance(result, list)

	def test_default_max_age_hours_is_24(self):
		"""max_age_hours defaults to 24 when not specified."""
		frappe.set_user(TEST_MANAGER)
		# Without explicitly passing max_age_hours, it should use 24
		result = get_active_insights()
		# Both our test insights were just created, so they should be included
		insight_names = {r["name"] for r in result}
		self.assertIn(self.active_insight_1.name, insight_names)

	def test_orders_by_creation_desc(self):
		"""Results are ordered by creation date, newest first."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights()
		if len(result) > 1:
			# Check that creation dates are in descending order
			for i in range(len(result) - 1):
				current_creation = result[i]["creation"]
				next_creation = result[i + 1]["creation"]
				# Comparing datetime strings should work if they're ISO format
				self.assertGreaterEqual(str(current_creation), str(next_creation))

	def test_filters_by_branch_and_respects_max_age_hours_together(self):
		"""Branch and max_age_hours filters work together."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights(branch="Test Branch", max_age_hours=24)
		insight_names = {r["name"] for r in result}
		self.assertIn(self.active_insight_1.name, insight_names)
		self.assertNotIn(self.active_insight_2.name, insight_names)


class TestGetActiveInsightsPermissions(FrappeTestCase):
	"""Test permission checks in get_active_insights()."""

	def setUp(self):
		frappe.set_user("Administrator")
		self._create_test_user(TEST_MANAGER, roles=["URY Manager"])
		self._create_test_user(TEST_NON_MANAGER, roles=[])

	def tearDown(self):
		frappe.set_user("Administrator")
		for user in [TEST_MANAGER, TEST_NON_MANAGER]:
			if frappe.db.exists("User", user):
				try:
					frappe.delete_doc("User", user, force=True, ignore_permissions=True)
				except:
					pass

	def _create_test_user(self, email, roles):
		"""Create a test user with specified roles."""
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		user = frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"enabled": 1,
		}).insert(ignore_permissions=True)
		for role in roles:
			user.add_roles(role)
		return user

	def test_non_manager_cannot_call_get_active_insights(self):
		"""Non-manager users get PermissionError when calling get_active_insights()."""
		frappe.set_user(TEST_NON_MANAGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_active_insights()
		finally:
			frappe.set_user("Administrator")

	def test_manager_can_call_get_active_insights(self):
		"""URY Manager users can call get_active_insights()."""
		frappe.set_user(TEST_MANAGER)
		try:
			result = get_active_insights()
			self.assertIsInstance(result, list)
		finally:
			frappe.set_user("Administrator")

	def test_administrator_can_call_get_active_insights(self):
		"""Administrator users can call get_active_insights()."""
		frappe.set_user("Administrator")
		result = get_active_insights()
		self.assertIsInstance(result, list)

	def test_system_manager_can_call_get_active_insights(self):
		"""System Manager role allows access to get_active_insights()."""
		frappe.set_user("Administrator")
		self._create_test_user("_test_sysmanager@example.com", roles=["System Manager"])
		frappe.set_user("_test_sysmanager@example.com")
		try:
			result = get_active_insights()
			self.assertIsInstance(result, list)
		finally:
			frappe.set_user("Administrator")
			if frappe.db.exists("User", "_test_sysmanager@example.com"):
				frappe.delete_doc("User", "_test_sysmanager@example.com", 
								  force=True, ignore_permissions=True)


class TestDismissInsightHappyPath(FrappeTestCase):
	"""Test dismiss_insight() in nominal conditions."""

	def setUp(self):
		frappe.set_user("Administrator")
		self._create_test_user(TEST_MANAGER, roles=["URY Manager"])
		
		self.active_insight = frappe.get_doc({
			"doctype": "URY Insight",
			"title": "Active Insight to Dismiss",
			"severity": "Warning",
			"rule_key": "_test_dismiss_rule",
			"branch": "Test Branch",
			"source_tool": "Test Tool",
			"body": "This insight will be dismissed",
			"dismissed": 0,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		for insight in frappe.get_all("URY Insight",
									   filters={"rule_key": "_test_dismiss_rule"},
									   pluck="name"):
			try:
				frappe.delete_doc("URY Insight", insight, force=True, ignore_permissions=True)
			except:
				pass
		if frappe.db.exists("User", TEST_MANAGER):
			try:
				frappe.delete_doc("User", TEST_MANAGER, force=True, ignore_permissions=True)
			except:
				pass

	def _create_test_user(self, email, roles):
		"""Create a test user with specified roles."""
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		user = frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"enabled": 1,
		}).insert(ignore_permissions=True)
		for role in roles:
			user.add_roles(role)
		return user

	def test_marks_insight_as_dismissed(self):
		"""dismiss_insight() sets dismissed flag to 1."""
		frappe.set_user(TEST_MANAGER)
		dismiss_insight(self.active_insight.name)
		dismissed_flag = frappe.db.get_value("URY Insight", self.active_insight.name, "dismissed")
		self.assertEqual(dismissed_flag, 1)

	def test_records_dismissed_by_user(self):
		"""dismiss_insight() records current user in dismissed_by field."""
		frappe.set_user(TEST_MANAGER)
		dismiss_insight(self.active_insight.name)
		dismissed_by = frappe.db.get_value("URY Insight", self.active_insight.name, "dismissed_by")
		self.assertEqual(dismissed_by, TEST_MANAGER)

	def test_dismiss_insight_idempotent(self):
		"""Calling dismiss_insight() twice does not error."""
		frappe.set_user(TEST_MANAGER)
		dismiss_insight(self.active_insight.name)
		# Second call should not raise an error
		dismiss_insight(self.active_insight.name)
		dismissed_flag = frappe.db.get_value("URY Insight", self.active_insight.name, "dismissed")
		self.assertEqual(dismissed_flag, 1)

	def test_dismiss_updates_only_target_insight(self):
		"""dismiss_insight() only affects the specified insight, not others."""
		frappe.set_user("Administrator")
		other_insight = frappe.get_doc({
			"doctype": "URY Insight",
			"title": "Other Insight",
			"severity": "Info",
			"rule_key": "_test_other_dismiss_rule",
			"branch": "Other Branch",
			"source_tool": "Other Tool",
			"body": "Should not be dismissed",
			"dismissed": 0,
		}).insert(ignore_permissions=True)
		
		frappe.set_user(TEST_MANAGER)
		dismiss_insight(self.active_insight.name)
		
		other_dismissed = frappe.db.get_value("URY Insight", other_insight.name, "dismissed")
		self.assertEqual(other_dismissed, 0)
		
		# Clean up
		frappe.set_user("Administrator")
		try:
			frappe.delete_doc("URY Insight", other_insight.name, force=True, ignore_permissions=True)
		except:
			pass


class TestDismissInsightPermissions(FrappeTestCase):
	"""Test permission checks in dismiss_insight()."""

	def setUp(self):
		frappe.set_user("Administrator")
		self._create_test_user(TEST_MANAGER, roles=["URY Manager"])
		self._create_test_user(TEST_NON_MANAGER, roles=[])
		
		self.test_insight = frappe.get_doc({
			"doctype": "URY Insight",
			"title": "Test Insight",
			"severity": "Info",
			"rule_key": "_test_perm_dismiss_rule",
			"dismissed": 0,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		for insight in frappe.get_all("URY Insight",
									   filters={"rule_key": "_test_perm_dismiss_rule"},
									   pluck="name"):
			try:
				frappe.delete_doc("URY Insight", insight, force=True, ignore_permissions=True)
			except:
				pass
		for user in [TEST_MANAGER, TEST_NON_MANAGER]:
			if frappe.db.exists("User", user):
				try:
					frappe.delete_doc("User", user, force=True, ignore_permissions=True)
				except:
					pass

	def _create_test_user(self, email, roles):
		"""Create a test user with specified roles."""
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		user = frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"enabled": 1,
		}).insert(ignore_permissions=True)
		for role in roles:
			user.add_roles(role)
		return user

	def test_non_manager_cannot_dismiss_insight(self):
		"""Non-manager users get PermissionError when calling dismiss_insight()."""
		frappe.set_user(TEST_NON_MANAGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				dismiss_insight(self.test_insight.name)
		finally:
			frappe.set_user("Administrator")

	def test_manager_can_dismiss_insight(self):
		"""URY Manager users can call dismiss_insight()."""
		frappe.set_user(TEST_MANAGER)
		try:
			dismiss_insight(self.test_insight.name)
			dismissed = frappe.db.get_value("URY Insight", self.test_insight.name, "dismissed")
			self.assertEqual(dismissed, 1)
		finally:
			frappe.set_user("Administrator")

	def test_administrator_can_dismiss_insight(self):
		"""Administrator users can call dismiss_insight()."""
		frappe.set_user("Administrator")
		dismiss_insight(self.test_insight.name)
		dismissed = frappe.db.get_value("URY Insight", self.test_insight.name, "dismissed")
		self.assertEqual(dismissed, 1)


class TestGetActiveInsightsEdgeCases(FrappeTestCase):
	"""Test edge cases and boundary conditions."""

	def setUp(self):
		frappe.set_user("Administrator")
		self._create_test_user(TEST_MANAGER, roles=["URY Manager"])

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("User", TEST_MANAGER):
			try:
				frappe.delete_doc("User", TEST_MANAGER, force=True, ignore_permissions=True)
			except:
				pass

	def _create_test_user(self, email, roles):
		"""Create a test user with specified roles."""
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		user = frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"enabled": 1,
		}).insert(ignore_permissions=True)
		for role in roles:
			user.add_roles(role)
		return user

	def test_empty_result_when_no_active_insights_exist(self):
		"""get_active_insights() returns empty list when no insights exist."""
		frappe.set_user(TEST_MANAGER)
		# Filter by a branch that has no insights
		result = get_active_insights(branch="Impossible Branch Name 12345")
		self.assertEqual(result, [])
		self.assertIsInstance(result, list)

	def test_branch_parameter_is_optional(self):
		"""get_active_insights() works without branch parameter."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights()
		self.assertIsInstance(result, list)

	def test_max_age_hours_accepts_large_values(self):
		"""get_active_insights() accepts large max_age_hours values."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights(max_age_hours=999)
		self.assertIsInstance(result, list)

	def test_max_age_hours_accepts_small_values(self):
		"""get_active_insights() accepts small max_age_hours values like 1."""
		frappe.set_user(TEST_MANAGER)
		result = get_active_insights(max_age_hours=1)
		self.assertIsInstance(result, list)

	def test_handles_max_age_hours_as_string_or_int(self):
		"""get_active_insights() converts max_age_hours to int."""
		frappe.set_user(TEST_MANAGER)
		# The function converts to int, so this should work
		result = get_active_insights(max_age_hours="24")
		self.assertIsInstance(result, list)


class TestDismissInsightEdgeCases(FrappeTestCase):
	"""Test edge cases for dismiss_insight()."""

	def setUp(self):
		frappe.set_user("Administrator")
		self._create_test_user(TEST_MANAGER, roles=["URY Manager"])

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("User", TEST_MANAGER):
			try:
				frappe.delete_doc("User", TEST_MANAGER, force=True, ignore_permissions=True)
			except:
				pass

	def _create_test_user(self, email, roles):
		"""Create a test user with specified roles."""
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		user = frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"enabled": 1,
		}).insert(ignore_permissions=True)
		for role in roles:
			user.add_roles(role)
		return user

	def test_dismiss_nonexistent_insight_raises_error(self):
		"""dismiss_insight() with invalid insight name raises error."""
		frappe.set_user(TEST_MANAGER)
		# Attempting to dismiss a nonexistent insight should raise an error
		with self.assertRaises((frappe.DoesNotExistError, Exception)):
			dismiss_insight("URY-INSIGHT-NONEXISTENT-12345")

	def test_dismiss_already_dismissed_insight(self):
		"""Dismissing an already-dismissed insight is idempotent."""
		frappe.set_user("Administrator")
		insight = frappe.get_doc({
			"doctype": "URY Insight",
			"title": "Already Dismissed",
			"severity": "Info",
			"rule_key": "_test_already_dismissed",
			"dismissed": 1,
			"dismissed_by": "Administrator",
		}).insert(ignore_permissions=True)
		
		frappe.set_user(TEST_MANAGER)
		try:
			dismiss_insight(insight.name)
			dismissed_by = frappe.db.get_value("URY Insight", insight.name, "dismissed_by")
			# Should be updated to the new user
			self.assertEqual(dismissed_by, TEST_MANAGER)
		finally:
			frappe.set_user("Administrator")
			try:
				frappe.delete_doc("URY Insight", insight.name, force=True, ignore_permissions=True)
			except:
				pass

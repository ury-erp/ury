# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Unit tests for ury_menu_course_validation API module.

Tests the priority validation hook that ensures no two URY Menu Course
documents share the same custom_serving_priority value.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_menu_course_validation import validate_priority


class TestValidatePriority(FrappeTestCase):
	"""Tests for validate_priority function that enforces unique priorities."""

	def test_priority_validation_passes_when_priority_is_unique(self):
		"""Happy path: new priority doesn't conflict with any existing course."""
		doc = frappe._dict({
			"name": "Appetizers",
			"course": "Appetizers",
			"custom_serving_priority": 1
		})

		with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists", return_value=None):
			# Must not raise when priority is unique
			validate_priority(doc, "validate")

	def test_priority_validation_raises_when_priority_exists_on_other_course(self):
		"""Error case: priority is already assigned to another course."""
		doc = frappe._dict({
			"name": "Appetizers",
			"course": "Appetizers",
			"custom_serving_priority": 1
		})

		with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists", return_value="Main Course"):
			with self.assertRaises(frappe.ValidationError) as context:
				validate_priority(doc, "validate")

			self.assertIn("Priority 1 is already assigned", str(context.exception))

	def test_priority_validation_allows_updating_same_course_with_same_priority(self):
		"""Edge case: updating an existing course with its current priority should pass."""
		doc = frappe._dict({
			"name": "Appetizers",
			"course": "Appetizers",
			"custom_serving_priority": 1
		})

		# When a course updates with the same priority, db.exists checks
		# for records with the same priority but different name -- should return None
		with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists", return_value=None):
			validate_priority(doc, "validate")

	def test_priority_validation_handles_none_priority(self):
		"""Edge case: None/null priority should not trigger validation."""
		doc = frappe._dict({
			"name": "Appetizers",
			"course": "Appetizers",
			"custom_serving_priority": None
		})

		with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists") as mock_exists:
			# None priority should still call db.exists to be safe
			# but should not raise an error when no conflict is found
			mock_exists.return_value = None
			validate_priority(doc, "validate")
			mock_exists.assert_called_once()

	def test_priority_validation_checks_correct_doctype_and_fields(self):
		"""Verify that validation queries the correct DocType and filters."""
		doc = frappe._dict({
			"name": "Appetizers",
			"course": "Appetizers",
			"custom_serving_priority": 2
		})

		with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists") as mock_exists:
			mock_exists.return_value = None
			validate_priority(doc, "validate")

			# Verify db.exists was called with URY Menu Course doctype
			args, kwargs = mock_exists.call_args
			self.assertEqual(args[0], "URY Menu Course")

			# Verify the filter includes priority and excludes current record
			filter_dict = args[1]
			self.assertEqual(filter_dict["custom_serving_priority"], 2)
			self.assertIn("name", filter_dict)
			# The filter should have name != doc.name
			self.assertEqual(filter_dict["name"], ["!=", "Appetizers"])

	def test_priority_validation_multiple_courses_with_different_priorities(self):
		"""Multiple courses scenario: each with unique priority should pass."""
		priorities = [1, 2, 3, 4]
		course_names = ["Appetizers", "Main Course", "Dessert", "Beverage"]

		for priority, course_name in zip(priorities, course_names):
			doc = frappe._dict({
				"name": course_name,
				"course": course_name,
				"custom_serving_priority": priority
			})

			with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists", return_value=None):
				# Each course with unique priority should pass
				validate_priority(doc, "validate")

	def test_priority_validation_error_message_includes_priority_value(self):
		"""Error message should clearly indicate which priority caused the conflict."""
		doc = frappe._dict({
			"name": "Appetizers",
			"course": "Appetizers",
			"custom_serving_priority": 5
		})

		with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists", return_value="Drinks"):
			with self.assertRaises(frappe.ValidationError) as context:
				validate_priority(doc, "validate")

			error_msg = str(context.exception)
			self.assertIn("5", error_msg)
			self.assertIn("Priority", error_msg)

	def test_priority_validation_zero_as_valid_priority(self):
		"""Edge case: zero can be a valid priority value."""
		doc = frappe._dict({
			"name": "Appetizers",
			"course": "Appetizers",
			"custom_serving_priority": 0
		})

		with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists", return_value=None):
			# Zero should be treated as a valid priority, not skipped
			validate_priority(doc, "validate")

	def test_priority_validation_large_priority_value(self):
		"""Edge case: large integer priority values should work."""
		doc = frappe._dict({
			"name": "Appetizers",
			"course": "Appetizers",
			"custom_serving_priority": 9999
		})

		with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists", return_value=None):
			validate_priority(doc, "validate")

	def test_priority_validation_duplicate_error_suggests_different_priority(self):
		"""Error message should help user understand the action needed."""
		doc = frappe._dict({
			"name": "Appetizers",
			"course": "Appetizers",
			"custom_serving_priority": 1
		})

		with patch("ury.ury.api.ury_menu_course_validation.frappe.db.exists", return_value="Main Course"):
			with self.assertRaises(frappe.ValidationError) as context:
				validate_priority(doc, "validate")

			error_msg = str(context.exception)
			self.assertIn("choose a different priority", error_msg.lower())


class TestValidatePriorityIntegration(FrappeTestCase):
	"""Integration-style tests that create actual documents."""

	def test_priority_validation_prevents_duplicate_on_insert(self):
		"""Integration test: inserting a course with duplicate priority fails."""
		# Create first course with priority 1
		course1 = frappe.get_doc({
			"doctype": "URY Menu Course",
			"course": "Test_Appetizers",
			"custom_serving_priority": 1
		})
		course1.insert(ignore_permissions=True)
		self.addCleanup(course1.delete)

		# Attempt to create second course with same priority should fail
		course2 = frappe.get_doc({
			"doctype": "URY Menu Course",
			"course": "Test_MainCourse",
			"custom_serving_priority": 1
		})

		with self.assertRaises(frappe.ValidationError) as context:
			course2.insert(ignore_permissions=True)

		self.assertIn("Priority 1 is already assigned", str(context.exception))

	def test_priority_validation_allows_duplicate_on_same_course_update(self):
		"""Integration test: updating a course's own priority should pass."""
		course = frappe.get_doc({
			"doctype": "URY Menu Course",
			"course": "Test_Dessert",
			"custom_serving_priority": 2
		})
		course.insert(ignore_permissions=True)
		self.addCleanup(course.delete)

		# Update the same course with its current priority should pass
		course.custom_serving_priority = 2
		course.save()  # Should not raise

	def test_priority_validation_allows_different_priorities(self):
		"""Integration test: courses with different priorities coexist."""
		course1 = frappe.get_doc({
			"doctype": "URY Menu Course",
			"course": "Test_Apps",
			"custom_serving_priority": 1
		})
		course1.insert(ignore_permissions=True)
		self.addCleanup(course1.delete)

		course2 = frappe.get_doc({
			"doctype": "URY Menu Course",
			"course": "Test_Mains",
			"custom_serving_priority": 2
		})
		course2.insert(ignore_permissions=True)
		self.addCleanup(course2.delete)

		# Both should exist without conflict
		self.assertEqual(course1.custom_serving_priority, 1)
		self.assertEqual(course2.custom_serving_priority, 2)

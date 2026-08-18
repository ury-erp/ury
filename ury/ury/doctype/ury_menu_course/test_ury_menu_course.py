# Copyright (c) 2024, Tridz Technologies Pvt. Ltd and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury_pos.api import getMenuCourses


class TestURYMenuCourse(FrappeTestCase):
	def test_get_menu_courses_returns_icon(self):
		for course in getMenuCourses():
			self.assertIn("icon", course)

	def test_get_menu_courses_returns_custom_icon(self):
		course = frappe.get_doc(
			{"doctype": "URY Menu Course", "course": "Test Pizza Course", "icon": "Pizza"}
		).insert(ignore_permissions=True)
		self.addCleanup(course.delete)

		courses = {c["name"]: c for c in getMenuCourses()}
		self.assertEqual(courses.get("Test Pizza Course", {}).get("icon"), "Pizza")

	def test_get_menu_courses_returns_empty_icon_when_not_set(self):
		course = frappe.get_doc(
			{"doctype": "URY Menu Course", "course": "Test Plain Course"}
		).insert(ignore_permissions=True)
		self.addCleanup(course.delete)

		courses = {c["name"]: c for c in getMenuCourses()}
		self.assertIn("icon", courses.get("Test Plain Course", {}))
		self.assertFalse(courses["Test Plain Course"]["icon"])

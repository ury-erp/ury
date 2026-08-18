# Copyright (c) 2024, Tridz Technologies Pvt. Ltd and Contributors
# See license.txt

from frappe.tests.utils import FrappeTestCase

from ury.ury_pos.api import getMenuCourses


class TestURYMenuCourse(FrappeTestCase):
	def test_get_menu_courses_returns_icon(self):
		for course in getMenuCourses():
			self.assertIn("icon", course)

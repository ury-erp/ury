# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Department scoping for the Chef UI, with real users and User Permissions.

Uses ``unittest.TestCase`` (not ``FrappeTestCase``) because ``bench
run-tests`` cannot preload ERPNext test records on the dev site (Fiscal Year
overlap); see track ``sa-batch-production-release-1``. Records are created
inside the test transaction and rolled back.
"""

import unittest

import frappe

from ury.patches.v3_47.add_department_head_role_permissions import ensure_role
from ury.ury.tests.factories import make_branch, make_user
from ury.ury.utils.department_scope import (
	DEPARTMENT_HEAD_ROLE,
	assert_department_access,
	get_allowed_departments,
	has_chef_ui_access,
)

DEPARTMENT = "URY Production Department"


def _make_department(name, branch, company, warehouse, cost_center, enabled=1):
	if frappe.db.exists(DEPARTMENT, name):
		frappe.delete_doc(DEPARTMENT, name, force=True, ignore_permissions=True)
	return frappe.get_doc(
		{
			"doctype": DEPARTMENT,
			"department_name": name,
			"enabled": enabled,
			"company": company,
			"branch": branch,
			"department_warehouse": warehouse,
			"cost_center": cost_center,
		}
	).insert(ignore_permissions=True, ignore_links=True)


def _user(roles):
	email = f"scope-{frappe.generate_hash(length=8)}@example.com"
	return make_user(email=email, roles=roles, first_name="Scope").name


def _user_permission(user, allow, value):
	frappe.get_doc(
		{"doctype": "User Permission", "user": user, "allow": allow, "for_value": value, "apply_to_all_doctypes": 1}
	).insert(ignore_permissions=True)


class TestDepartmentScope(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		frappe.set_user("Administrator")
		ensure_role()
		cls.company = frappe.get_all("Company", pluck="name", limit=1)[0]
		cls.warehouse = frappe.get_all(
			"Warehouse", filters={"is_group": 0, "company": cls.company}, pluck="name", limit=1
		)[0]
		cls.cost_center = frappe.get_all(
			"Cost Center", filters={"is_group": 0, "company": cls.company}, pluck="name", limit=1
		)[0]
		cls.branch_a = make_branch(branch="ZZ Scope Branch A").name
		cls.branch_b = make_branch(branch="ZZ Scope Branch B").name
		cls.kitchen = _make_department("ZZ Scope Kitchen", cls.branch_a, cls.company, cls.warehouse, cls.cost_center).name
		cls.bakery = _make_department("ZZ Scope Bakery", cls.branch_a, cls.company, cls.warehouse, cls.cost_center).name
		cls.disabled = _make_department(
			"ZZ Scope Disabled", cls.branch_a, cls.company, cls.warehouse, cls.cost_center, enabled=0
		).name
		cls.other_branch = _make_department("ZZ Scope Other", cls.branch_b, cls.company, cls.warehouse, cls.cost_center).name

	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def tearDown(self):
		frappe.set_user("Administrator")

	def _head(self):
		return _user([DEPARTMENT_HEAD_ROLE])

	def test_restricted_to_one_department(self):
		user = self._head()
		_user_permission(user, DEPARTMENT, self.kitchen)
		self.assertEqual(get_allowed_departments(user), [self.kitchen])
		assert_department_access(self.kitchen, user)
		with self.assertRaises(frappe.PermissionError):
			assert_department_access(self.bakery, user)

	def test_restricted_to_two_departments(self):
		user = self._head()
		_user_permission(user, DEPARTMENT, self.kitchen)
		_user_permission(user, DEPARTMENT, self.bakery)
		self.assertEqual(get_allowed_departments(user), sorted([self.kitchen, self.bakery]))

	def test_restriction_never_crosses_requested_branch(self):
		user = self._head()
		_user_permission(user, DEPARTMENT, self.other_branch)
		self.assertEqual(get_allowed_departments(user, branch=self.branch_a), [])
		self.assertEqual(get_allowed_departments(user, branch=self.branch_b), [self.other_branch])

	def test_disabled_department_excluded_even_when_permitted(self):
		user = self._head()
		_user_permission(user, DEPARTMENT, self.disabled)
		self.assertEqual(get_allowed_departments(user), [])

	def test_no_department_restriction_sees_whole_branch(self):
		user = self._head()
		_user_permission(user, "Branch", self.branch_a)
		allowed = get_allowed_departments(user)
		self.assertIn(self.kitchen, allowed)
		self.assertIn(self.bakery, allowed)
		self.assertNotIn(self.disabled, allowed)
		self.assertNotIn(self.other_branch, allowed)

	def test_no_branch_and_no_restriction_sees_nothing(self):
		user = self._head()
		self.assertEqual(get_allowed_departments(user), [])
		with self.assertRaises(frappe.PermissionError):
			assert_department_access(self.kitchen, user)

	def test_elevated_roles_are_unrestricted(self):
		manager = _user(["URY Manager"])
		_user_permission(manager, DEPARTMENT, self.kitchen)
		self.assertIsNone(get_allowed_departments(manager))
		assert_department_access(self.bakery, manager)

	def test_chef_ui_access_by_role(self):
		self.assertTrue(has_chef_ui_access(self._head()))
		self.assertTrue(has_chef_ui_access(_user(["URY Manager"])))
		self.assertFalse(has_chef_ui_access(_user(["URY Cashier"])))

# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.tests.factories import make_menu, make_restaurant


class TestURYRestaurant(FrappeTestCase):
	"""`ury_restaurant.py`'s `URYRestaurant` controller is a bare
	`Document` subclass -- no `validate()` or any other lifecycle hook -- so
	there are no doctype-level business rules to exercise beyond the plain
	mandatory-field validation the doctype JSON declares (`company`,
	`invoice_series_prefix`, `branch`, `default_room` are all `reqd`).
	"""

	def test_creation_with_required_links(self):
		restaurant = make_restaurant()

		self.assertTrue(frappe.db.exists("URY Restaurant", restaurant.name))
		self.assertTrue(frappe.db.exists("Branch", restaurant.branch))
		self.assertTrue(frappe.db.exists("URY Room", restaurant.default_room))
		self.assertTrue(frappe.db.exists("Company", restaurant.company))
		self.assertTrue(restaurant.invoice_series_prefix)

		# default_room must belong to the same branch as the restaurant --
		# _make_room() (the private helper make_restaurant() delegates to)
		# is built to guarantee this, not merely to create *some* room.
		room_branch = frappe.db.get_value("URY Room", restaurant.default_room, "branch")
		self.assertEqual(room_branch, restaurant.branch)

	def test_creation_missing_required_field_raises(self):
		branch = make_restaurant().branch  # any existing branch is fine here

		with self.assertRaises(frappe.MandatoryError):
			frappe.get_doc(
				{
					"doctype": "URY Restaurant",
					"name": "Test Restaurant Missing Fields",
					"branch": branch,
					# company, invoice_series_prefix, default_room deliberately omitted
				}
			).insert()

	def test_factory_is_idempotent(self):
		first = make_restaurant(name="Test Restaurant Idempotent")
		second = make_restaurant(name="Test Restaurant Idempotent")

		self.assertEqual(first.name, second.name)
		self.assertEqual(
			frappe.db.count("URY Restaurant", {"name": "Test Restaurant Idempotent"}),
			1,
		)
		# second call must be a plain lookup, not a second insert attempt
		# with an already-used name (which would raise DuplicateEntryError)
		self.assertEqual(second.branch, first.branch)

	def test_factory_defaults_are_independent_across_calls(self):
		first = make_restaurant()
		second = make_restaurant()

		self.assertNotEqual(first.name, second.name)
		self.assertNotEqual(first.branch, second.branch)
		self.assertNotEqual(first.default_room, second.default_room)

	def test_menu_with_items_attached_to_restaurant(self):
		restaurant = make_restaurant()
		menu = make_menu(branch=restaurant.branch)

		restaurant.active_menu = menu.name
		restaurant.save()
		restaurant.reload()

		self.assertEqual(restaurant.active_menu, menu.name)
		self.assertEqual(menu.branch, restaurant.branch)
		self.assertTrue(menu.items)
		self.assertTrue(all(row.item for row in menu.items))

	def test_menu_factory_is_idempotent_by_name(self):
		first = make_menu(name="Test Menu Idempotent")
		second = make_menu(name="Test Menu Idempotent")

		self.assertEqual(first.name, second.name)
		self.assertEqual(
			frappe.db.count("URY Menu", {"name": "Test Menu Idempotent"}),
			1,
		)

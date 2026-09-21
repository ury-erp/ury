# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Doctype-level coverage for URY Table.

TRACK.md Phase 2 item 2 / COVERAGE_GAP_ANALYSIS.md Table 3: the doctype had
no test file at all. Unlike its sibling stubs (`URY Room`, `URY Restaurant`,
which are bare `pass` controllers with no logic to test beyond framework
CRUD), `URYTable.autoname()` has real logic: it slugifies the linked
restaurant's name (collapsing repeated "-" from spaces) and appends a
running counter via `make_autoname`. That naming scheme drives every
table-scoped reference in the order/KOT flow, so a regression here (e.g. a
restaurant name change breaking the slug) would be silent everywhere else.

`restaurant`/`restaurant_room` are mandatory Links; building real `URY
Restaurant`/`URY Room` fixtures is unavoidable here (unlike the
payment-terminal-transaction and self-ordering-profile tests in this same
phase) because the autoname logic under test directly reads
`self.restaurant`'s *name*, which only exists once a document is created.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.tests.factories import make_branch


class TestURYTable(FrappeTestCase):
	def tearDown(self):
		frappe.db.rollback()

	def _make_room(self, branch):
		room = frappe.get_doc({
			"doctype": "URY Room",
			# autoname is "Prompt" -- URY Room's controller is a bare `pass`,
			# so Frappe requires an explicit `name`.
			"name": frappe.generate_hash(length=8),
			"branch": branch.name,
		})
		room.insert(ignore_permissions=True, ignore_mandatory=True)
		return room

	def _make_restaurant(self, branch, room, restaurant_name):
		company = frappe.db.get_value("Company", {}, "name") or "_Test Company"
		restaurant = frappe.get_doc({
			"doctype": "URY Restaurant",
			"name": restaurant_name,
			"company": company,
			"invoice_series_prefix": frappe.generate_hash(length=4).upper(),
			"branch": branch.name,
			"default_room": room.name,
		})
		restaurant.insert(ignore_permissions=True, ignore_mandatory=True)
		return restaurant

	def _make_table(self, restaurant, room, branch):
		table = frappe.get_doc({
			"doctype": "URY Table",
			"restaurant": restaurant.name,
			"restaurant_room": room.name,
			"branch": branch.name,
		})
		table.insert(ignore_permissions=True, ignore_mandatory=True)
		return table

	def test_autoname_uses_restaurant_name_as_prefix(self):
		branch = make_branch()
		room = self._make_room(branch)
		restaurant = self._make_restaurant(branch, room, "Grillax Downtown")
		table = self._make_table(restaurant, room, branch)
		self.assertTrue(table.name.startswith("Grillax-Downtown-"))

	def test_autoname_collapses_repeated_dashes_from_spaces(self):
		# restaurant.replace(" ", "-") on a name with multiple consecutive
		# spaces would otherwise leave "--" in the slug; re.sub("-+", "-", ...)
		# is supposed to collapse that.
		branch = make_branch()
		room = self._make_room(branch)
		restaurant = self._make_restaurant(branch, room, "Grillax  Multi   Space")
		table = self._make_table(restaurant, room, branch)
		self.assertNotIn("--", table.name)
		self.assertTrue(table.name.startswith("Grillax-Multi-Space-"))

	def test_two_tables_for_same_restaurant_get_distinct_names(self):
		branch = make_branch()
		room = self._make_room(branch)
		restaurant = self._make_restaurant(branch, room, "Grillax Distinct Names")
		table_a = self._make_table(restaurant, room, branch)
		table_b = self._make_table(restaurant, room, branch)
		self.assertNotEqual(table_a.name, table_b.name)

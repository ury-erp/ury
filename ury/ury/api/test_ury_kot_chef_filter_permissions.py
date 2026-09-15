"""Real (non-mock), live-DB negative-permission tests for
`get_filtered_kot_list()` in `ury_kot_chef_filter.py` (Phase 4 round 4).

This module implements a fail-closed, non-throwing access-control contract
(see the module's own docstring): a caller with no chef/manager relationship
to any branch must get an EMPTY result, not an exception and not another
user's data. These tests exercise that contract against a real site/DB using
`frappe.set_user()`, not mocks -- there is no `frappe.has_permission` gate to
assert a raised exception on here, so the negative-permission assertion is
"returns nothing", which is exactly what the module's docstring says a
probing client must observe.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_chef_filter import get_filtered_kot_list

PLAIN_USER = "phase4-r4-chef-filter-plain-user@ury.test"


class TestGetFilteredKotListFailsClosed(FrappeTestCase):
	"""A user with zero role/unit relationship anywhere must never see any
	branch's KOT board, no matter what branch/company/production_unit hints
	they pass -- the server-derived scope resolution must win over client
	hints, and must fail closed (empty result) rather than raise."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", PLAIN_USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": PLAIN_USER,
					"first_name": "Phase4R4",
					"last_name": "ChefFilterPlain",
					"send_welcome_email": 0,
					"roles": [{"role": "Employee"}] if frappe.db.exists("Role", "Employee") else [],
				}
			).insert(ignore_permissions=True, ignore_mandatory=True)

	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		super().tearDownClass()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_plain_user_with_no_branch_hint_gets_empty_result(self):
		frappe.set_user(PLAIN_USER)
		result = get_filtered_kot_list()
		self.assertEqual(result["KOT"], [])
		self.assertEqual(result["ProductionUnits"], [])
		self.assertIsNone(result["Company"])

	def test_plain_user_cannot_use_branch_hint_to_expand_scope(self):
		# A cashier/POS-type user with no Production Unit relationship must
		# not be able to see another branch's board just by naming it in the
		# request -- the server resolves permitted branch independently of
		# this hint (see `_resolve_permitted_branch`).
		frappe.set_user(PLAIN_USER)
		result = get_filtered_kot_list(branch="Some Other Branch", company="Some Other Company")
		self.assertEqual(result["KOT"], [])
		self.assertEqual(result["ProductionUnits"], [])

	def test_plain_user_cannot_use_production_unit_hint_to_expand_scope(self):
		frappe.set_user(PLAIN_USER)
		result = get_filtered_kot_list(production_unit="SOME-UNIT-NAME")
		self.assertEqual(result["KOT"], [])

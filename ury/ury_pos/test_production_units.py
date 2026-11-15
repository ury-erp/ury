"""The POS asks for its branch's production units to listen for KOT errors."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury_pos.api import get_production_units_for_branch


class TestProductionUnitsForBranch(FrappeTestCase):
	def test_lists_the_branch_units_only(self):
		branches = frappe.get_all("URY Production Unit", pluck="branch", distinct=True)
		if not branches:
			self.skipTest("Needs at least one URY Production Unit")
		branch = branches[0]
		expected = sorted(frappe.get_all("URY Production Unit", filters={"branch": branch}, pluck="name"))

		with patch("ury.ury_pos.api.getBranch", return_value=branch):
			result = get_production_units_for_branch()

		self.assertEqual(result, {"production_units": expected})

	def test_user_without_a_branch_gets_an_empty_list(self):
		def no_branch():
			frappe.throw("User is not Associated with any Branch.")

		with patch("ury.ury_pos.api.getBranch", side_effect=no_branch):
			self.assertEqual(get_production_units_for_branch(), {"production_units": []})

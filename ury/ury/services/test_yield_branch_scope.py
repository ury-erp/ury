# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching test_bom_cost_resolver.py's
# convention). Verifies the corrected BOM-anchored branch scoping used by
# both get_due_yield_checks (yield_check_reminders.py) and
# get_yield_check_compliance (ury_yield_variance.py): active IPC rows for a
# branch -> their BOM -> that BOM's component items (BOM Item rows).

import unittest
from unittest.mock import patch

from ury.ury.services.yield_branch_scope import branch_item_codes

MOD = "ury.ury.services.yield_branch_scope"


class TestBranchItemCodes(unittest.TestCase):
	def test_returns_none_when_branch_is_falsy(self):
		"""No branch filter requested -> None, distinguishing "no filter"
		from "branch resolved to nothing"."""
		self.assertIsNone(branch_item_codes(None))
		self.assertIsNone(branch_item_codes(""))

	@patch(f"{MOD}.frappe.get_all")
	def test_returns_empty_set_when_no_active_ipc_rows(self, mock_get_all):
		mock_get_all.return_value = []  # no IPC rows with a bom for this branch

		result = branch_item_codes("Test Branch")

		self.assertEqual(result, set())

	@patch(f"{MOD}.frappe.get_all")
	def test_resolves_bom_components_via_ipc_bom_field(self, mock_get_all):
		"""A sellable item's IPC row -> its BOM -> that BOM's raw-ingredient
		component rows are the items "used at" the branch. This is the
		anchor a raw ingredient (yield-tracked) can actually reach, unlike a
		direct IPC.item match (IPC never has a row on a raw ingredient)."""

		def get_all_side_effect(doctype, **kwargs):
			if doctype == "URY Item Production Configuration":
				self.assertEqual(
					kwargs.get("filters"),
					{"branch": "Test Branch", "active": 1, "bom": ["is", "set"]},
				)
				return ["BOM-CHICKEN-BURGER-001"]
			if doctype == "BOM Item":
				self.assertEqual(
					kwargs.get("filters"),
					{
						"parent": ["in", ["BOM-CHICKEN-BURGER-001"]],
						"parenttype": "BOM",
						"docstatus": ["<", 2],
					},
				)
				# Raw ingredients used in the Chicken Burger BOM.
				return ["Chicken Boneless Breast", "Burger Bun", "Onion"]
			raise AssertionError(f"unexpected get_all doctype: {doctype}")

		mock_get_all.side_effect = get_all_side_effect

		result = branch_item_codes("Test Branch")

		self.assertEqual(
			result, {"Chicken Boneless Breast", "Burger Bun", "Onion"}
		)

	@patch(f"{MOD}.frappe.get_all")
	def test_returns_empty_set_when_ipc_bom_has_no_components(self, mock_get_all):
		def get_all_side_effect(doctype, **kwargs):
			if doctype == "URY Item Production Configuration":
				return ["BOM-EMPTY-001"]
			if doctype == "BOM Item":
				return []
			raise AssertionError(f"unexpected get_all doctype: {doctype}")

		mock_get_all.side_effect = get_all_side_effect

		result = branch_item_codes("Test Branch")

		self.assertEqual(result, set())


if __name__ == "__main__":
	unittest.main()

"""Tests for the food cost report.

The property that matters most is the one a comfortable report gets wrong:
a dish nobody has costed must not be reported as a dish with a 100% margin.
That single choice decides whether the page shows the kitchen its problems
or hides them behind its best-looking numbers.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch

from ury.ury.api.food_cost import _summarise, get_plate_costs

MOD = "ury.ury.api.food_cost"


class TestPlateCosts(FrappeTestCase):

    def _rows(self, items):
        return [frappe._dict(r) for r in items]

    @patch(f"{MOD}._bom_cost_map", return_value={})
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value", return_value="Default Menu")
    @patch(f"{MOD}.getBranch", return_value="Branch A")
    def test_an_uncosted_dish_reports_no_margin_not_a_perfect_one(
        self, mock_branch, mock_get_value, mock_get_all, mock_bom
    ):
        mock_get_all.return_value = self._rows(
            [{"item": "Pizza", "item_name": "Pizza", "rate": 250, "plate_cost": 0, "course": None}]
        )

        row = get_plate_costs()["items"][0]

        self.assertIsNone(row["cost"])
        self.assertIsNone(row["margin"])
        self.assertIsNone(row["food_cost_percent"])
        self.assertEqual(row["cost_source"], "none")

    @patch(f"{MOD}._bom_cost_map", return_value={})
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value", return_value="Default Menu")
    @patch(f"{MOD}.getBranch", return_value="Branch A")
    def test_a_manual_plate_cost_is_used_and_labelled(
        self, mock_branch, mock_get_value, mock_get_all, mock_bom
    ):
        mock_get_all.return_value = self._rows(
            [{"item": "Pizza", "item_name": "Pizza", "rate": 250, "plate_cost": 100, "course": None}]
        )

        row = get_plate_costs()["items"][0]

        self.assertEqual(row["cost"], 100)
        self.assertEqual(row["cost_source"], "manual")
        self.assertEqual(row["margin"], 150)
        self.assertEqual(row["food_cost_percent"], 40)

    @patch(f"{MOD}._bom_cost_map", return_value={"Pizza": 80})
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value", return_value="Default Menu")
    @patch(f"{MOD}.getBranch", return_value="Branch A")
    def test_a_recipe_beats_a_typed_number(
        self, mock_branch, mock_get_value, mock_get_all, mock_bom
    ):
        """The BOM moves when ingredient prices move; a number typed into the
        menu a year ago does not."""
        mock_get_all.return_value = self._rows(
            [{"item": "Pizza", "item_name": "Pizza", "rate": 250, "plate_cost": 100, "course": None}]
        )

        row = get_plate_costs()["items"][0]

        self.assertEqual(row["cost"], 80)
        self.assertEqual(row["cost_source"], "bom")

    @patch(f"{MOD}._bom_cost_map", return_value={})
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value", return_value="Default Menu")
    @patch(f"{MOD}.getBranch", return_value="Branch A")
    def test_a_free_dish_does_not_divide_by_zero(
        self, mock_branch, mock_get_value, mock_get_all, mock_bom
    ):
        mock_get_all.return_value = self._rows(
            [{"item": "Water", "item_name": "Water", "rate": 0, "plate_cost": 10, "course": None}]
        )

        row = get_plate_costs()["items"][0]

        self.assertIsNone(row["food_cost_percent"])
        self.assertEqual(row["margin"], -10)


class TestSummary(FrappeTestCase):

    def test_the_average_covers_only_costed_dishes_and_says_so(self):
        """An average over half a menu is a different claim from the same
        number over all of it, and the gap is the work still to do."""
        rows = [
            {"food_cost_percent": 30, "cost_source": "bom"},
            {"food_cost_percent": 40, "cost_source": "manual"},
            {"food_cost_percent": None, "cost_source": "none"},
            {"food_cost_percent": None, "cost_source": "none"},
        ]

        summary = _summarise(rows)

        self.assertEqual(summary["average_food_cost_percent"], 35)
        self.assertEqual(summary["costed_items"], 2)
        self.assertEqual(summary["uncosted_items"], 2)
        self.assertEqual(summary["from_bom"], 1)
        self.assertEqual(summary["from_manual"], 1)

    def test_a_menu_with_no_costs_at_all_has_no_average(self):
        summary = _summarise([{"food_cost_percent": None, "cost_source": "none"}])
        self.assertIsNone(summary["average_food_cost_percent"])

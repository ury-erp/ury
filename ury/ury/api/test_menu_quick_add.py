"""Tests for the dashboard's one-step menu.

What matters is the thing the old dashboard flow got wrong: a dish added
from the dashboard must be reachable from every place that reads it — the
POS grid (URY Menu Item, grouped by Item Group), billing (Item Price), and
the kitchen (an Item Group some URY Production Unit lists).
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.menu_quick_add import ensure_category, get_menu_page, quick_add_item, update_menu_item

BRANCH = "_Test Quick Add Branch"
ROOM = "_Test Quick Add Room"
RESTAURANT = "_Test Quick Add Restaurant"
KITCHEN = "_Test Quick Add Kitchen"


class TestQuickAddItem(FrappeTestCase):

    def setUp(self):
        # Per test, not per class: tearDown rolls back, fixtures included.
        if not frappe.db.exists("Branch", BRANCH):
            frappe.get_doc(
                {"doctype": "Branch", "branch": BRANCH, "user": [{"user": "Administrator"}]}
            ).insert(ignore_permissions=True)
        if not frappe.db.exists("URY Room", ROOM):
            frappe.get_doc({"doctype": "URY Room", "branch": BRANCH}).insert(ignore_permissions=True, set_name=ROOM)
        if not frappe.db.exists("URY Restaurant", RESTAURANT):
            frappe.get_doc({
                "doctype": "URY Restaurant",
                "company": frappe.db.get_value("Company", {}),
                "invoice_series_prefix": "QADD",
                "branch": BRANCH,
                "default_room": ROOM,
            }).insert(ignore_permissions=True, set_name=RESTAURANT)

    def tearDown(self):
        frappe.db.rollback()

    def _add(self, name="_Test Tikka", category="_Test Grills", **kwargs):
        return quick_add_item(BRANCH, name, kwargs.pop("rate", 7500), category, **kwargs)

    def _menu(self):
        return frappe.db.get_value("URY Restaurant", RESTAURANT, "active_menu")

    def _make_kitchen(self, name=KITCHEN):
        if not frappe.db.exists("URY Production Unit", name):
            frappe.get_doc({"doctype": "URY Production Unit", "production": name, "branch": BRANCH}).insert(
                ignore_permissions=True
            )

    def test_the_first_dish_creates_the_branch_menu_and_makes_it_active(self):
        self.assertIsNone(self._menu())
        self._add()
        self.assertTrue(self._menu())

    def test_a_new_dish_is_on_the_menu_priced_and_in_its_own_group(self):
        result = self._add()

        item = frappe.db.get_value("Item", result["item"], ["item_group", "is_stock_item"], as_dict=True)
        self.assertEqual(item.item_group, "_Test Grills")
        self.assertEqual(item.is_stock_item, 0)

        menu = self._menu()
        self.assertEqual(frappe.db.get_value("URY Menu Item", {"parent": menu, "item": result["item"]}, "rate"), 7500)
        price_list = frappe.db.get_value("URY Menu", menu, "price_list")
        self.assertEqual(
            frappe.db.get_value("Item Price", {"item_code": result["item"], "price_list": price_list}, "price_list_rate"),
            7500,
        )

    def test_the_page_lists_dishes_with_their_category(self):
        self._add()
        self._add("_Test Kebab")
        page = get_menu_page(BRANCH)
        self.assertEqual({i.item for i in page["items"]}, {"_Test Tikka", "_Test Kebab"})
        self.assertEqual(page["categories"], [{"name": "_Test Grills", "count": 2, "kitchens": []}])

    def test_a_branch_with_one_kitchen_routes_the_new_category_to_it(self):
        self._make_kitchen()
        self._add()
        self.assertTrue(
            frappe.db.exists("URY Production Item Groups", {"parent": KITCHEN, "item_group": "_Test Grills"})
        )

    def test_a_branch_with_several_kitchens_must_be_told_which(self):
        self._make_kitchen()
        self._make_kitchen("_Test Quick Add Bar")
        with self.assertRaises(frappe.ValidationError):
            self._add()
        self._add(kitchen="_Test Quick Add Bar")
        self.assertTrue(
            frappe.db.exists("URY Production Item Groups", {"parent": "_Test Quick Add Bar", "item_group": "_Test Grills"})
        )

    def test_the_same_dish_cannot_be_added_twice(self):
        self._add()
        with self.assertRaises(frappe.ValidationError):
            self._add(rate=9000)

    def test_bad_input_is_refused(self):
        for kwargs in ({"rate": 0}, {"name": "  "}, {"category": ""}, {"name": "_Test Grills"}):
            with self.assertRaises(frappe.ValidationError):
                self._add(**kwargs)
            frappe.clear_messages()

    def test_a_parent_item_group_is_not_a_category(self):
        root = frappe.db.get_value("Item Group", {"is_group": 1})
        with self.assertRaises(frappe.ValidationError):
            ensure_category(root)

    def test_editing_moves_the_dish_reprices_it_and_can_hide_it(self):
        result = self._add()

        update_menu_item(BRANCH, result["item"], "_Test Tikka", 8000, "_Test Starters", disabled=1)

        self.assertEqual(frappe.db.get_value("Item", result["item"], "item_group"), "_Test Starters")
        menu = self._menu()
        row = frappe.db.get_value("URY Menu Item", {"parent": menu, "item": result["item"]}, ["rate", "disabled"], as_dict=True)
        self.assertEqual((row.rate, row.disabled), (8000, 1))
        price_list = frappe.db.get_value("URY Menu", menu, "price_list")
        self.assertEqual(
            frappe.db.get_value("Item Price", {"item_code": result["item"], "price_list": price_list}, "price_list_rate"),
            8000,
        )

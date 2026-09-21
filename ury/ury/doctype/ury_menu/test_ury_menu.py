# Copyright (c) 2023, Tridz Technologies  and Contributors
# See license.txt

from unittest import mock

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.tests.factories import make_branch, make_item


class TestURYMenu(FrappeTestCase):
	def tearDown(self):
		for menu in frappe.get_all("URY Menu", filters={"name": ["like", "TEST-MENU-%"]}, pluck="name"):
			frappe.delete_doc("URY Menu", menu, force=1, ignore_permissions=True)
		frappe.db.commit()

	def _make_menu(self, name_suffix, items):
		branch = make_branch()
		doc = frappe.get_doc({
			"doctype": "URY Menu",
			"name": f"TEST-MENU-{name_suffix}",
			"branch": branch.name,
			"enabled": 1,
			"items": items,
		})
		doc.insert(ignore_permissions=True)
		return doc

	def test_validate_autofills_missing_rate_from_item_standard_rate(self):
		item = make_item(standard_rate=123)
		menu = self._make_menu(
			"RATE",
			[{"item": item.item_code, "item_name": item.item_name}],
		)
		self.assertEqual(menu.items[0].rate, 123)

	def test_validate_does_not_override_explicit_rate(self):
		item = make_item(standard_rate=123)
		menu = self._make_menu(
			"RATE2",
			[{"item": item.item_code, "item_name": item.item_name, "rate": 50}],
		)
		self.assertEqual(menu.items[0].rate, 50)

	def test_notify_newly_blocked_items_noop_when_no_alert_rule_configured(self):
		"""Alert Settings has no matching rule by default, so blocking an item
		must not raise or attempt to notify anyone -- get_alert_rule() returns
		None and notify_newly_blocked_items() should just return quietly."""
		item = make_item(standard_rate=10)
		menu = self._make_menu(
			"BLOCK",
			[{"item": item.item_code, "item_name": item.item_name, "disabled": 0}],
		)

		with mock.patch(
			"ury.ury.doctype.ury_menu.ury_menu.create_system_notification"
		) as mock_notify:
			menu.items[0].disabled = 1
			menu.save(ignore_permissions=True)
			mock_notify.assert_not_called()

	def test_notify_newly_blocked_items_skipped_on_new_document(self):
		"""is_new() guard: a freshly-inserted menu with an already-disabled
		item must not attempt notification (nothing "newly" changed)."""
		item = make_item(standard_rate=10)
		with mock.patch(
			"ury.ury.doctype.ury_menu.ury_menu.create_system_notification"
		) as mock_notify:
			self._make_menu(
				"BLOCKNEW",
				[{"item": item.item_code, "item_name": item.item_name, "disabled": 1}],
			)
			mock_notify.assert_not_called()

	def test_on_update_creates_price_list_and_item_price(self):
		item = make_item(standard_rate=10)
		menu = self._make_menu(
			"PRICELIST",
			[{"item": item.item_code, "item_name": item.item_name, "rate": 77}],
		)

		self.assertTrue(menu.price_list)
		self.assertTrue(frappe.db.exists("Price List", menu.price_list))
		item_price_rate = frappe.db.get_value(
			"Item Price",
			{"price_list": menu.price_list, "item_code": item.item_code},
			"price_list_rate",
		)
		self.assertEqual(item_price_rate, 77)

	def test_on_trash_clears_item_prices(self):
		item = make_item(standard_rate=10)
		menu = self._make_menu(
			"TRASH",
			[{"item": item.item_code, "item_name": item.item_name, "rate": 42}],
		)
		price_list_name = menu.price_list
		self.assertTrue(
			frappe.db.exists("Item Price", {"price_list": price_list_name, "item_code": item.item_code})
		)

		frappe.delete_doc("URY Menu", menu.name, force=1, ignore_permissions=True)

		self.assertFalse(
			frappe.db.exists("Item Price", {"price_list": price_list_name, "item_code": item.item_code})
		)

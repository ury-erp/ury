# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class URYMenu(Document):
    def validate(self):
        items_without_rate = [d for d in self.items if not d.rate]
        if items_without_rate:
            item_codes = list({d.item for d in items_without_rate})
            rates = {
                r[0]: r[1]
                for r in frappe.db.get_values(
                    "Item", {"name": ("in", item_codes)}, ["name", "standard_rate"]
                )
            }
            for d in items_without_rate:
                d.rate = rates.get(d.item)

    def on_update(self):
        """Sync Price List"""
        self.make_price_list()

    def on_trash(self):
        """clear prices"""
        self.clear_item_price()

    def clear_item_price(self, price_list=None):
        """clear all item prices for this menu"""
        if not price_list:
            price_list = self.get_price_list().name
        frappe.db.sql("delete from `tabItem Price` where price_list = %s", price_list)

    def make_price_list(self):
        # create price list for menu
        price_list_name = self.get_price_list()
        self.db_set("price_list", price_list_name)

        # delete old items
        self.clear_item_price(price_list_name)

        # batch insert item prices
        for d in self.items:
            frappe.get_doc(
                dict(
                    doctype="Item Price",
                    price_list=price_list_name,
                    item_code=d.item,
                    price_list_rate=d.rate,
                )
            ).insert(ignore_permissions=True)

    def get_price_list(self):
        """Return price list name; create if missing."""
        price_list_name = frappe.db.get_value(
            "Price List", dict(restaurant_menu=self.name)
        )
        if price_list_name:
            frappe.db.set_value("Price List", price_list_name, {"enabled": 1, "selling": 1})
            return price_list_name

        price_list = frappe.new_doc("Price List")
        price_list.restaurant_menu = self.name
        price_list.price_list_name = self.name
        price_list.enabled = 1
        price_list.selling = 1
        price_list.insert()

        return price_list.name

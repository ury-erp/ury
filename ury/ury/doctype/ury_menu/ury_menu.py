# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class URYMenu(Document):
    def validate(self):
        for d in self.items:
            if not d.rate:
                d.rate = frappe.db.get_value("Item", d.item, "standard_rate")

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
        price_list = self.get_price_list()
        self.db_set("price_list", price_list.name)

        # delete old items
        self.clear_item_price(price_list.name)

        for d in self.items:
            frappe.get_doc(
                dict(
                    doctype="Item Price",
                    price_list=price_list.name,
                    item_code=d.item,
                    price_list_rate=d.rate,
                )
            ).insert()

    def price_sync_report(self):
        """What the menu says vs. what its price list actually publishes.

        `make_price_list` only runs on save, so a menu whose rows were written
        any other way (an import, a setup script, a direct db write) ends up
        with prices on screen and an empty price list behind them — the POS
        grid and the self-ordering page both render `URY Menu Item.rate`, so
        nothing looks wrong until an order is priced.
        """
        price_list = frappe.db.get_value("Price List", dict(restaurant_menu=self.name))
        if not price_list:
            return {"price_list": None, "published": 0, "missing": [d.item for d in self.items], "stale": []}

        published = {
            row.item_code: row.price_list_rate
            for row in frappe.get_all(
                "Item Price",
                filters={"price_list": price_list},
                fields=["item_code", "price_list_rate"],
            )
        }

        missing, stale = [], []
        for d in self.items:
            if d.item not in published:
                missing.append(d.item)
            elif flt(published[d.item]) != flt(d.rate):
                stale.append(d.item)

        return {
            "price_list": price_list,
            "published": len(published),
            "missing": missing,
            "stale": stale,
        }

    def get_price_list(self):
        """Create price list for menu if missing"""
        price_list_name = frappe.db.get_value(
            "Price List", dict(restaurant_menu=self.name)
        )
        if price_list_name:
            price_list = frappe.get_doc("Price List", price_list_name)
        else:
            price_list = frappe.new_doc("Price List")
            price_list.restaurant_menu = self.name
            price_list.price_list_name = self.name

        price_list.enabled = 1
        price_list.selling = 1
        price_list.save()

        return price_list


@frappe.whitelist()
def sync_menu_prices(menu):
    """Republish a menu's rates to its price list, on demand.

    Exposed as a button because the repair is otherwise invisible: the only
    way to fix a menu whose prices never reached `Item Price` was to open it
    and save it, which is not something anyone thinks to do when the symptom
    is an order that refuses to price.
    """
    doc = frappe.get_doc("URY Menu", menu)
    if not frappe.has_permission("URY Menu", "write", doc):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    doc.make_price_list()
    report = doc.price_sync_report()

    return {
        "price_list": report["price_list"],
        "published": report["published"],
        "items": len(doc.items),
    }


@frappe.whitelist()
def get_menu_price_sync_status(menu):
    """Read-only version of the above, for the form to show on load."""
    doc = frappe.get_doc("URY Menu", menu)
    if not frappe.has_permission("URY Menu", "read", doc):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    return doc.price_sync_report()

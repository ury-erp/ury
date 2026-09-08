# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from ury.ury.api.ury_kot_notification import create_system_notification, get_users_with_role
from ury.ury.doctype.alert_settings.alert_settings import get_alert_rule


class URYMenu(Document):
    def validate(self):
        for d in self.items:
            if not d.rate:
                d.rate = frappe.db.get_value("Item", d.item, "standard_rate")

        self.notify_newly_blocked_items()

    def notify_newly_blocked_items(self):
        """Ported from grillax's `product_block_notification.js`.

        Detects URY Menu Item rows whose `disabled` flag transitioned to
        checked on this save (not rows that were already disabled) and, if
        the 'Product Block' Alert Rule is enabled for this menu's branch,
        notifies the configured roles that the item(s) were blocked.
        """
        if self.is_new():
            return

        before_save = self.get_doc_before_save()
        if not before_save:
            return

        previously_disabled = {d.name: d.disabled for d in before_save.items}

        newly_blocked = [
            d.item_name or d.item
            for d in self.items
            if d.disabled and not previously_disabled.get(d.name)
        ]

        if not newly_blocked:
            return

        try:
            self._send_product_block_notification(newly_blocked)
        except Exception:
            frappe.log_error(
                title="Product Block Notification Failed",
                message=frappe.get_traceback(),
            )

    def _send_product_block_notification(self, blocked_item_names):
        alert_rule = get_alert_rule("Product Block", branch=self.branch)
        if not alert_rule:
            return

        notify_roles = alert_rule.get("notify_roles")
        if not notify_roles:
            return

        subject = f"Item(s) Blocked - {self.name}"
        message = (
            f"The following item(s) on menu {self.name} have been marked "
            f"unavailable: {', '.join(blocked_item_names)}"
        )

        for role in notify_roles:
            role_name = role.get("role") if isinstance(role, dict) else getattr(role, "role", role)
            if not role_name:
                continue
            users = get_users_with_role(role_name, branch=self.branch)
            for user in users:
                create_system_notification(message, user.name, subject)

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

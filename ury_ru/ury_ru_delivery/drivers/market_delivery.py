"""Маркет Деливери (заглушка).

Реальная интеграция через API Маркет Деливери (ex. Delivery Club):
меню, приём заказов, статусы.
"""

import frappe
from frappe import _

from ury_ru.ury_ru_delivery.delivery import DeliveryProvider


class MarketDeliveryProvider(DeliveryProvider):
	name = "market_delivery"

	def __init__(self, api_key=None):
		self.api_key = api_key

	def sync_menu(self):
		frappe.throw(_("Маркет Деливери ещё не реализован."), NotImplementedError)

	def fetch_orders(self):
		frappe.throw(_("Маркет Деливери ещё не реализован."), NotImplementedError)

	def update_order_status(self, order_id, status):
		frappe.throw(_("Маркет Деливери ещё не реализован."), NotImplementedError)

	def accept_order(self, order_id):
		frappe.throw(_("Маркет Деливери ещё не реализован."), NotImplementedError)

	def reject_order(self, order_id, reason):
		frappe.throw(_("Маркет Деливери ещё не реализован."), NotImplementedError)

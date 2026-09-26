"""Яндекс Еда (заглушка).

Реальная интеграция через Яндекс Еда API для партнёров:
- меню-фид (JSON/YML), приём заказов, статусы, отмена.
"""

import frappe
from frappe import _

from ury_ru.ury_ru_delivery.delivery import DeliveryProvider


class YandexEdaDeliveryProvider(DeliveryProvider):
	name = "yandex_eda"

	def __init__(self, api_key=None):
		self.api_key = api_key

	def sync_menu(self):
		frappe.throw(_("Яндекс Еда ещё не реализована."), NotImplementedError)

	def fetch_orders(self):
		frappe.throw(_("Яндекс Еда ещё не реализована."), NotImplementedError)

	def update_order_status(self, order_id, status):
		frappe.throw(_("Яндекс Еда ещё не реализована."), NotImplementedError)

	def accept_order(self, order_id):
		frappe.throw(_("Яндекс Еда ещё не реализована."), NotImplementedError)

	def reject_order(self, order_id, reason):
		frappe.throw(_("Яндекс Еда ещё не реализована."), NotImplementedError)

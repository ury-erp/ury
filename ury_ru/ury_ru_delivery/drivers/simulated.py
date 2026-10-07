"""Эмулятор агрегатора доставки для тестов/демо."""

import frappe

from ury_ru.ury_ru_delivery.delivery import DeliveryProvider


class SimulatedDeliveryProvider(DeliveryProvider):
	name = "simulated"

	def sync_menu(self):
		return {"sent": 1}

	def fetch_orders(self):
		return []

	def update_order_status(self, order_id, status):
		return {"status": status}

	def accept_order(self, order_id):
		return {"status": "accepted"}

	def reject_order(self, order_id, reason):
		return {"status": "rejected", "reason": reason}

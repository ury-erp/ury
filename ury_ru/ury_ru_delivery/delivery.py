"""Агрегаторы доставки: провайдер + реестр.

Паттерн как у Fiscal/Payments. Поддерживаемые агрегаторы:
Яндекс Еда, Маркет Деливери.

Агрегатор присылает заказы (через API/вебхуки), мы отдаём меню-фиды
и статусы заказов. Заказ агрегатора ложится в URY RU Delivery Order,
затем конвертируется в POS Invoice (order_type = "Aggregators").
"""

import frappe
from frappe import _


class DeliveryProvider:
	"""Абстрактный интерфейс агрегатора доставки."""

	name = "abstract"

	def sync_menu(self):
		"""Отправить меню/фид в агрегатор."""
		raise NotImplementedError

	def fetch_orders(self):
		"""Забрать новые заказы из агрегатора."""
		raise NotImplementedError

	def update_order_status(self, order_id, status):
		"""Отправить статус заказа агрегатору."""
		raise NotImplementedError

	def accept_order(self, order_id):
		"""Принять заказ."""
		raise NotImplementedError

	def reject_order(self, order_id, reason):
		"""Отклонить заказ."""
		raise NotImplementedError


class NoOpDeliveryProvider(DeliveryProvider):
	name = "noop"

	def _throw(self):
		frappe.throw(_("Доставка не настроена. Укажите агрегатор в URY RU Delivery Settings."), frappe.ValidationError)

	def sync_menu(self):
		self._throw()

	def fetch_orders(self):
		self._throw()

	def update_order_status(self, order_id, status):
		self._throw()

	def accept_order(self, order_id):
		self._throw()

	def reject_order(self, order_id, reason):
		self._throw()


_delivery_provider = NoOpDeliveryProvider()


def register_delivery_provider(provider):
	global _delivery_provider
	if not isinstance(provider, DeliveryProvider):
		frappe.throw(_("Провайдер доставки должен наследовать DeliveryProvider"))
	_delivery_provider = provider


def get_delivery_provider():
	return _delivery_provider

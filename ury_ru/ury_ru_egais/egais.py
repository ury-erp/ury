"""ЕГАИС: провайдер + реестр.

Паттерн как у остальных RU-модулей. ЕГАИС — гос. система учёта оборота
алкоголя. Обмен идёт через УТМ (универсальный транспортный модуль),
который Росалкогольрегулирование ставит на объект.

Документы: ТТН (товарно-транспортные накладные, входящие/исходящие),
акты списания, запросы остатков.
"""

import frappe
from frappe import _


class EgaisProvider:
	"""Абстрактный интерфейс ЕГАИС (через УТМ)."""

	name = "abstract"

	def get_incoming_waybills(self):
		"""Получить входящие ТТН от поставщиков."""
		raise NotImplementedError

	def confirm_waybill(self, waybill_id):
		"""Подтвердить (акцептовать) ТТН."""
		raise NotImplementedError

	def send_outgoing_waybill(self, waybill):
		"""Отправить исходящую ТТН (перемещение/возврат)."""
		raise NotImplementedError

	def write_off(self, items, reason):
		"""Акт списания алкоголя."""
		raise NotImplementedError

	def get_remains(self):
		"""Запросить остатки алкоголя по регистру."""
		raise NotImplementedError


class NoOpEgaisProvider(EgaisProvider):
	name = "noop"

	def _throw(self):
		frappe.throw(_("ЕГАИС не настроен. Укажите провайдер в URY RU EGAIS Settings."), frappe.ValidationError)

	def get_incoming_waybills(self):
		self._throw()

	def confirm_waybill(self, waybill_id):
		self._throw()

	def send_outgoing_waybill(self, waybill):
		self._throw()

	def write_off(self, items, reason):
		self._throw()

	def get_remains(self):
		self._throw()


_egais_provider = NoOpEgaisProvider()


def register_egais_provider(provider):
	global _egais_provider
	if not isinstance(provider, EgaisProvider):
		frappe.throw(_("Провайдер ЕГАИС должен наследовать EgaisProvider"))
	_egais_provider = provider


def get_egais_provider():
	return _egais_provider

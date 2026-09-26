"""Маркировка (Честный знак): провайдер + реестр.

Паттерн как у Fiscal/Payments/Delivery. Честный знак — национальная система
маркировки товаров (ЦРПТ).

Сюда же относится **ФФД 1.2** (по решению владельца): фискализация
маркированных товаров требует формата 1.2, поэтому флаг фискального формата
переключается этим модулем при включении маркировки.
"""

import frappe
from frappe import _


class MarkingProvider:
	"""Абстрактный интерфейс системы маркировки."""

	name = "abstract"

	def get_codes(self, quantity, product_group, subject):
		"""Получить/эмитировать коды маркировки из системы."""
		raise NotImplementedError

	def register_emission(self, codes):
		"""Ввести коды в оборот (эмиссия)."""
		raise NotImplementedError

	def aggregate(self, codes, parent_code):
		"""Агрегировать коды (короб → паллета)."""
		raise NotImplementedError

	def write_off(self, codes, reason):
		"""Вывести коды из оборота (продажа/списание)."""
		raise NotImplementedError

	def verify(self, code):
		"""Проверить код."""
		raise NotImplementedError


class NoOpMarkingProvider(MarkingProvider):
	name = "noop"

	def _throw(self):
		frappe.throw(_("Маркировка не настроена. Укажите провайдер в URY RU Marking Settings."), frappe.ValidationError)

	def get_codes(self, quantity, product_group, subject):
		self._throw()

	def register_emission(self, codes):
		self._throw()

	def aggregate(self, codes, parent_code):
		self._throw()

	def write_off(self, codes, reason):
		self._throw()

	def verify(self, code):
		self._throw()


_marking_provider = NoOpMarkingProvider()


def register_marking_provider(provider):
	global _marking_provider
	if not isinstance(provider, MarkingProvider):
		frappe.throw(_("Провайдер маркировки должен наследовать MarkingProvider"))
	_marking_provider = provider


def get_marking_provider():
	return _marking_provider

"""Меркурий (ветеринарный учёт): провайдер + реестр.

Паттерн как у остальных RU-модулей. Меркурий — подсистема ФГИС «ВетИС»
(Россельхознадзор) для учёта подконтрольной продукции животного
происхождения. Документы — ветеринарные сопроводительные документы (ВСД/эВСД).

Обмен через ВетИС.API (REST, XML/JSON).
"""

import frappe
from frappe import _


class MercuryProvider:
	"""Абстрактный интерфейс Меркурий (ВетИС.API)."""

	name = "abstract"

	def get_incoming_vsd(self):
		"""Получить входящие ВСД от поставщиков."""
		raise NotImplementedError

	def accept_vsd(self, vsd_id):
		"""Гашение (приёмка) ВСД."""
		raise NotImplementedError

	def return_vsd(self, vsd_id):
		"""Возврат ВСД."""
		raise NotImplementedError

	def create_vsd(self, document):
		"""Создать исходящий ВСД (перемещение/продажа)."""
		raise NotImplementedError

	def get_products(self):
		"""Справочник подконтрольной продукции."""
		raise NotImplementedError


class NoOpMercuryProvider(MercuryProvider):
	name = "noop"

	def _throw(self):
		frappe.throw(_("Меркурий не настроен. Укажите провайдер в URY RU Mercury Settings."), frappe.ValidationError)

	def get_incoming_vsd(self):
		self._throw()

	def accept_vsd(self, vsd_id):
		self._throw()

	def return_vsd(self, vsd_id):
		self._throw()

	def create_vsd(self, document):
		self._throw()

	def get_products(self):
		self._throw()


_mercury_provider = NoOpMercuryProvider()


def register_mercury_provider(provider):
	global _mercury_provider
	if not isinstance(provider, MercuryProvider):
		frappe.throw(_("Провайдер Меркурий должен наследовать MercuryProvider"))
	_mercury_provider = provider


def get_mercury_provider():
	return _mercury_provider

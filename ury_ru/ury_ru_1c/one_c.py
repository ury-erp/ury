"""Обмен с 1С: провайдер + реестр.

Паттерн как у ury.ury.api.payment_terminal и у FiscalDriver:
сторонний адаптер регистрируется через register_1c_provider(), модуль
вызывает get_1c_provider(). По умолчанию NoOp — честная ошибка.

Транспорт обмена бывает разный (CommerceML/XML по файлам, REST/HTTP,
веб-сервисы), поэтому интерфейс строится вокруг операций обмена, а не
транспорта: конкретный провайдер сам решает, как таскать данные.
"""

import frappe
from frappe import _


class OneCProvider:
	"""Абстрактный интерфейс обмена с 1С."""

	name = "abstract"

	def import_items(self, data=None):
		"""Импорт номенклатуры (товары, группы, штрихкоды, ед. изм.).

		:return: dict {"created": int, "updated": int, "skipped": int}
		"""
		raise NotImplementedError

	def import_prices(self, data=None):
		"""Импорт цен (прайс-лист)."""
		raise NotImplementedError

	def import_stock(self, data=None):
		"""Импорт остатков по складам."""
		raise NotImplementedError

	def export_orders(self, orders):
		"""Выгрузка заказов/продаж в 1С."""
		raise NotImplementedError

	def export_revenue(self, revenue):
		"""Выгрузка выручки/закрытия смены в 1С."""
		raise NotImplementedError

	def sync(self):
		"""Полный цикл двусторонней синхронизации (удобно для cron)."""
		raise NotImplementedError


class NoOpOneCProvider(OneCProvider):
	name = "noop"

	def _throw(self):
		frappe.throw(_("Обмен с 1С не настроен. Укажите провайдер в URY RU 1C Settings."), frappe.ValidationError)

	def import_items(self, data=None):
		self._throw()

	def import_prices(self, data=None):
		self._throw()

	def import_stock(self, data=None):
		self._throw()

	def export_orders(self, orders):
		self._throw()

	def export_revenue(self, revenue):
		self._throw()

	def sync(self):
		self._throw()


_one_c_provider = NoOpOneCProvider()


def register_1c_provider(provider):
	global _one_c_provider
	if not isinstance(provider, OneCProvider):
		frappe.throw(_("1С провайдер должен наследовать OneCProvider"))
	_one_c_provider = provider


def get_1c_provider():
	return _one_c_provider

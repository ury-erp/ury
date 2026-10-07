"""Провайдер обмена с 1С по CommerceML/XML (заглушка).

Реальная реализация требует согласованного формата обмена (CommerceML 2
для каталога/цен/остатков, XML выгрузка заказов). Здесь — каркас с TODO.
"""

import frappe
from frappe import _

from ury_ru.ury_ru_1c.one_c import OneCProvider


class CommerceMLOneCProvider(OneCProvider):
	name = "commerceml"

	def __init__(self, exchange_dir=None):
		self.exchange_dir = exchange_dir  # каталог обмена файлами

	def import_items(self, data=None):
		# TODO(integrate): разобрать import.xml / offers.xml (CommerceML 2)
		frappe.throw(_("CommerceML-провайдер ещё не реализован."), NotImplementedError)

	def import_prices(self, data=None):
		frappe.throw(_("CommerceML-провайдер ещё не реализован."), NotImplementedError)

	def import_stock(self, data=None):
		frappe.throw(_("CommerceML-провайдер ещё не реализован."), NotImplementedError)

	def export_orders(self, orders):
		frappe.throw(_("CommerceML-провайдер ещё не реализован."), NotImplementedError)

	def export_revenue(self, revenue):
		frappe.throw(_("CommerceML-провайдер ещё не реализован."), NotImplementedError)

	def sync(self):
		self.import_items()
		self.import_prices()
		self.import_stock()

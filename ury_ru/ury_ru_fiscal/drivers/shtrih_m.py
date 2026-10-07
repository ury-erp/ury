"""Драйвер ШТРИХ-М (заглушка).

Реальная реализация требует драйвер «ШТРИХ-М: ККТ» или прямое общение
по протоколу ШТРИХ-М (TCP) и железо. Здесь — каркас с TODO.

Протокол ШТРИХ-М (упрощённо):
- транспорт: TCP к драйверу/ККТ (порт по умолчанию 7778 у некоторых моделей)
- команды: открыть/закрыть смену, пробить чек (продажа/возврат), отчёт
- ответ содержит номер фискального документа и фискальный признак
"""

import frappe
from frappe import _

from ury_ru.ury_ru_fiscal.fiscal_driver import FiscalDriver


class ShtrihMFiscalDriver(FiscalDriver):
	name = "shtrih-m"

	def __init__(self, host="127.0.0.1", port=7778):
		self.host = host
		self.port = port

	def register_receipt(self, receipt):
		# TODO(integrate): собрать команду по протоколу ШТРИХ-М и отправить
		frappe.throw(
			_("Драйвер ШТРИХ-М ещё не реализован (требуется драйвер и железо)."),
			NotImplementedError,
		)

	def get_receipt_status(self, receipt):
		frappe.throw(_("Драйвер ШТРИХ-М ещё не реализован."), NotImplementedError)

	def open_shift(self, cashier):
		frappe.throw(_("Драйвер ШТРИХ-М ещё не реализован."), NotImplementedError)

	def close_shift(self, cashier):
		frappe.throw(_("Драйвер ШТРИХ-М ещё не реализован."), NotImplementedError)

	def get_kkt_info(self):
		frappe.throw(_("Драйвер ШТРИХ-М ещё не реализован."), NotImplementedError)

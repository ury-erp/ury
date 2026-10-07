"""Драйвер АТОЛ (заглушка).

Реальная реализация требует Atol Driver 10.x (JSON-протокол DTO) и железо.
Здесь — честный каркас с интерфейсом и TODO по интеграции, чтобы точка
подключения была зафиксирована, а не выдумана.

Протокол (Atol Driver 10.x, единый DTO для всех моделей):
- транспорт: TCP/IP к службе драйвера (по умолчанию порт 16732) или HTTP
  для смарт-терминалов (АТОЛ 15Ф/17Ф/21Ф)
- команды (JSON): openShift, closeShift, registerReceipt (type=sell/sellReturn),
  getStatus
- ответ registerReceipt: {fiscalDocumentNumber, fiscalSign, total, ...}
"""

import frappe
from frappe import _

from ury_ru.ury_ru_fiscal.fiscal_driver import FiscalDriver


class AtolFiscalDriver(FiscalDriver):
	name = "atol"

	def __init__(self, host="127.0.0.1", port=16732):
		self.host = host
		self.port = port

	def register_receipt(self, receipt):
		# TODO(integrate): собрать JSON по DTO 10.x и отправить в драйвер
		#   payload = _build_dto_receipt(receipt)
		#   resp = _tcp_call(self.host, self.port, payload)
		#   return {"fiscal_document_number": resp["fiscalDocumentNumber"],
		#           "fiscal_sign": resp["fiscalSign"], ...}
		frappe.throw(
			_("Драйвер АТОЛ ещё не реализован (требуется Atol Driver 10.x и железо)."),
			NotImplementedError,
		)

	def get_receipt_status(self, receipt):
		frappe.throw(_("Драйвер АТОЛ ещё не реализован."), NotImplementedError)

	def open_shift(self, cashier):
		frappe.throw(_("Драйвер АТОЛ ещё не реализован."), NotImplementedError)

	def close_shift(self, cashier):
		frappe.throw(_("Драйвер АТОЛ ещё не реализован."), NotImplementedError)

	def get_kkt_info(self):
		frappe.throw(_("Драйвер АТОЛ ещё не реализован."), NotImplementedError)

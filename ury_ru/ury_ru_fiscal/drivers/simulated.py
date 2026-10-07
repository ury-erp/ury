"""Эмулятор ККТ для тестов и демо.

Никогда не регистрируется по умолчанию. Включается явно через
URY RU Fiscal Settings (driver = "Simulated") или в тестах через
register_fiscal_driver(SimulatedFiscalDriver()).

Возвращает детерминированные ФД/ФПД и пишет журнал — даёт сквозной
проход всего потока фискализации без железа.
"""

import frappe

from ury_ru.ury_ru_fiscal.fiscal_driver import FiscalDriver


class SimulatedFiscalDriver(FiscalDriver):
	name = "simulated"

	def register_receipt(self, receipt):
		# Детерминированный «фискальный документ» — предсказуем для тестов
		fd = frappe.utils.cint(frappe.db.count("URY RU Fiscal Receipt")) + 1
		return {
			"fiscal_document_number": fd,
			"fiscal_sign": frappe.generate_hash(length=10),
			"total": receipt.get("total"),
			"status": "Sent",
		}

	def get_receipt_status(self, receipt):
		return {"status": "Confirmed"}

	def open_shift(self, cashier):
		return {"shift": frappe.generate_hash(length=8), "status": "Opened"}

	def close_shift(self, cashier):
		return {"status": "Closed"}

	def register_correction(self, correction):
		fd = frappe.utils.cint(frappe.db.count("URY RU Fiscal Receipt")) + 1
		return {
			"fiscal_document_number": fd,
			"fiscal_sign": frappe.generate_hash(length=10),
			"total": correction.get("total"),
			"status": "Sent",
		}

	def get_kkt_info(self):
		return {
			"model": "Simulated KKT",
			"reg_number": "0000000000000000",
			"fiscal_format": "1.1",
			"status": "Ok",
		}

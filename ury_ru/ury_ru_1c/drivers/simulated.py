"""Эмулятор обмена с 1С для тестов/демо.

Никогда не регистрируется по умолчанию. Пишет строки в URY RU 1C Sync Log
и возвращает детерминированные счётчики, чтобы сквозной поток обмена
можно было прогнать без реального сервера 1С.
"""

import frappe

from ury_ru.ury_ru_1c.one_c import OneCProvider


def _log(operation, detail):
	doc = frappe.new_doc("URY RU 1C Sync Log")
	doc.operation = operation
	doc.detail = detail
	doc.status = "Success"
	doc.insert(ignore_permissions=True)


class SimulatedOneCProvider(OneCProvider):
	name = "simulated"

	def import_items(self, data=None):
		_log("import_items", "simulated")
		return {"created": 0, "updated": 0, "skipped": 0}

	def import_prices(self, data=None):
		_log("import_prices", "simulated")
		return {"updated": 0}

	def import_stock(self, data=None):
		_log("import_stock", "simulated")
		return {"updated": 0}

	def export_orders(self, orders):
		_log("export_orders", f"{len(orders or [])} orders")
		return {"exported": len(orders or [])}

	def export_revenue(self, revenue):
		_log("export_revenue", "simulated")
		return {"exported": 1}

	def sync(self):
		self.import_items()
		self.import_prices()
		self.import_stock()
		return {"status": "ok"}

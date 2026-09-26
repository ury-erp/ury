"""Контроллер URY RU Fiscal Correction.

Чек коррекции — ручная корректировка расчётов (ошибки кассира, сбои).
Пользователь создаёт документ из UI (Desk), заполняет тип/сумму/основание
и submit'ит — на submit драйвер пробивает чек коррекции на ККТ.
"""

import frappe
from frappe import _
from frappe.model.document import Document

from ury_ru.ury_ru_fiscal.fiscal_driver import get_fiscal_driver


class URYRUFiscalCorrection(Document):
	def validate(self):
		if not self.amount:
			frappe.throw(_("Сумма коррекции обязательна."))
		if not self.reason:
			frappe.throw(_("Укажите основание коррекции (обязательно по 54-ФЗ)."))

	def on_submit(self):
		"""Пробить чек коррекции на ККТ."""
		driver = get_fiscal_driver()
		correction = {
			"correction_type": self.correction_type,
			"amount": self.amount,
			"vat_rate": self.vat_rate or "none",
			"reason": self.reason,
			"pos_invoice": self.pos_invoice,
		}
		try:
			result = driver.register_correction(correction)
			self.fiscal_document_number = result.get("fiscal_document_number")
			self.fiscal_sign = result.get("fiscal_sign")
			self.status = "Sent"
		except Exception as e:
			self.status = "Failed"
			frappe.log_error(f"Fiscal correction failed: {e}", "URY RU Fiscal Correction")
			frappe.throw(_("Не удалось пробить чек коррекции: {0}").format(e))

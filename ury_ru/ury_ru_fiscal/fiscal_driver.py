"""Фискальный драйвер: абстрактный интерфейс + реестр.

Повторяет паттерн ury.ury.api.payment_terminal (PaymentTerminalProvider):
стороннее приложение регистрирует свой адаптер через register_fiscal_driver()
из собственного hooks.py, а модуль вызывает get_fiscal_driver().

По умолчанию установлен NoOpFiscalDriver — он честно падает с ошибкой,
а не молча притворяется, что ККТ есть.
"""

import frappe
from frappe import _


class FiscalDriver:
	"""Абстрактный интерфейс адаптера ККТ (АТОЛ, ШТРИХ-М, ...).

	Все методы получают уже собранный и валидированный чек (см. receipt.py).
	Адаптер не должен сам ходить в БД за заказом — он работает с каноническим
	представлением чека.
	"""

	#: Версия протокола/драйвера для диагностики
	name = "abstract"

	def register_receipt(self, receipt):
		"""Пробить чек (продажа/возврат).

		:param receipt: dict из receipt.build_receipt_from_invoice()
		:return: dict {"fiscal_document_number": int, "fiscal_sign": str,
		               "total": float, "status": str}
		"""
		raise NotImplementedError

	def get_receipt_status(self, receipt):
		"""Статус ранее отправленного чека (для ОФД-подтверждения)."""
		raise NotImplementedError

	def open_shift(self, cashier):
		"""Открыть смену на ККТ."""
		raise NotImplementedError

	def close_shift(self, cashier):
		"""Закрыть смену (Z-отчёт)."""
		raise NotImplementedError

	def register_correction(self, correction):
		"""Пробить чек коррекции (ручная корректировка расчётов).

		:param correction: dict из fiscal_correction.build_correction()
		:return: dict {"fiscal_document_number": int, "fiscal_sign": str, ...}
		"""
		raise NotImplementedError

	def get_kkt_info(self):
		"""Информация о ККТ: РНМ, ЗН, ФН, версия ФФД, статус."""
		raise NotImplementedError


class NoOpFiscalDriver(FiscalDriver):
	"""По умолчанию: честная ошибка вместо молчаливого бездействия."""

	name = "noop"

	def register_receipt(self, receipt):
		frappe.throw(
			_("Фискальный драйвер не настроен. Укажите драйвер ККТ в URY RU Fiscal Settings."),
			frappe.ValidationError,
		)

	def get_receipt_status(self, receipt):
		frappe.throw(_("Фискальный драйвер не настроен."), frappe.ValidationError)

	def open_shift(self, cashier):
		frappe.throw(_("Фискальный драйвер не настроен."), frappe.ValidationError)

	def close_shift(self, cashier):
		frappe.throw(_("Фискальный драйвер не настроен."), frappe.ValidationError)

	def register_correction(self, correction):
		frappe.throw(_("Фискальный драйвер не настроен."), frappe.ValidationError)

	def get_kkt_info(self):
		frappe.throw(_("Фискальный драйвер не настроен."), frappe.ValidationError)


_fiscal_driver = NoOpFiscalDriver()


def register_fiscal_driver(driver):
	"""Установить активный фискальный драйвер. Вызывать из hooks.py
	установленного приложения (аналог register_payment_terminal_provider)."""
	global _fiscal_driver
	if not isinstance(driver, FiscalDriver):
		frappe.throw(_("Фискальный драйвер должен наследовать FiscalDriver"))
	_fiscal_driver = driver


def get_fiscal_driver():
	return _fiscal_driver

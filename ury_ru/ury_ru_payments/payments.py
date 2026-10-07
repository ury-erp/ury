"""Эквайринг/платежи: провайдер + реестр.

Паттерн как у PaymentTerminalProvider и FiscalDriver. Поддерживаемые
провайдеры: Т-Банк, Сбер, СБП (Система быстрых платежей).

Платёж строится поверх ERPNext Payment Request (как это делает self_ordering
URY) — провайдер создаёт/резолвит платёжное поручение и получает статус.
"""

import frappe
from frappe import _


class PaymentProvider:
	"""Абстрактный интерфейс эквайринга."""

	name = "abstract"

	def create_payment(self, invoice_name, amount, method="card"):
		"""Создать платёж (ссылку/QR) для инвойса.

		:return: dict {"payment_id": str, "url": str, "status": str}
		"""
		raise NotImplementedError

	def get_payment_status(self, payment_id):
		"""Статус платежа: {"status": Pending/Paid/Failed/Cancelled, "reference": str}."""
		raise NotImplementedError

	def refund(self, payment_id, amount=None):
		"""Возврат (полный или частичный)."""
		raise NotImplementedError


class NoOpPaymentProvider(PaymentProvider):
	name = "noop"

	def create_payment(self, invoice_name, amount, method="card"):
		frappe.throw(_("Эквайринг не настроен. Укажите провайдер в URY RU Payments Settings."), frappe.ValidationError)

	def get_payment_status(self, payment_id):
		frappe.throw(_("Эквайринг не настроен."), frappe.ValidationError)

	def refund(self, payment_id, amount=None):
		frappe.throw(_("Эквайринг не настроен."), frappe.ValidationError)


_payment_provider = NoOpPaymentProvider()


def register_payment_provider(provider):
	global _payment_provider
	if not isinstance(provider, PaymentProvider):
		frappe.throw(_("Платёжный провайдер должен наследовать PaymentProvider"))
	_payment_provider = provider


def get_payment_provider():
	return _payment_provider

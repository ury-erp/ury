"""Эквайринг Т-Банк (заглушка).

Реальная интеграция через Т-Банк Бизнес API (эквайринг):
- создание платежа (QR/ссылка), получение статуса, возврат
- вебхуки на смену статуса
"""

import frappe
from frappe import _

from ury_ru.ury_ru_payments.payments import PaymentProvider


class TbankPaymentProvider(PaymentProvider):
	name = "tbank"

	def __init__(self, terminal_key=None, password=None):
		self.terminal_key = terminal_key
		self.password = password

	def create_payment(self, invoice_name, amount, method="card"):
		# TODO(integrate): Init / Charge API Т-Банк Бизнес
		frappe.throw(_("Эквайринг Т-Банк ещё не реализован."), NotImplementedError)

	def get_payment_status(self, payment_id):
		frappe.throw(_("Эквайринг Т-Банк ещё не реализован."), NotImplementedError)

	def refund(self, payment_id, amount=None):
		frappe.throw(_("Эквайринг Т-Банк ещё не реализован."), NotImplementedError)

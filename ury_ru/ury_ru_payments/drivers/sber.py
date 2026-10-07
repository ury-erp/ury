"""Эквайринг Сбер (заглушка).

Реальная интеграция через Сбер (ЮKassa / СберБизнес API):
- создание платежа, статус, возврат, вебхуки.
"""

import frappe
from frappe import _

from ury_ru.ury_ru_payments.payments import PaymentProvider


class SberPaymentProvider(PaymentProvider):
	name = "sber"

	def __init__(self, shop_id=None, secret_key=None):
		self.shop_id = shop_id
		self.secret_key = secret_key

	def create_payment(self, invoice_name, amount, method="card"):
		# TODO(integrate): ЮKassa / СберБизнес API
		frappe.throw(_("Эквайринг Сбер ещё не реализован."), NotImplementedError)

	def get_payment_status(self, payment_id):
		frappe.throw(_("Эквайринг Сбер ещё не реализован."), NotImplementedError)

	def refund(self, payment_id, amount=None):
		frappe.throw(_("Эквайринг Сбер ещё не реализован."), NotImplementedError)

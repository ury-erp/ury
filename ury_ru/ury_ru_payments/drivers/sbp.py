"""СБП — Система быстрых платежей (заглушка).

Реальная интеграция: QR-код СБП через банк-эквайер (НСПК).
- генерация QR, статус платежа, возврат.
"""

import frappe
from frappe import _

from ury_ru.ury_ru_payments.payments import PaymentProvider


class SbpPaymentProvider(PaymentProvider):
	name = "sbp"

	def __init__(self, merchant_id=None):
		self.merchant_id = merchant_id

	def create_payment(self, invoice_name, amount, method="sbp"):
		# TODO(integrate): QR СБП через НСПК/банк
		frappe.throw(_("СБП ещё не реализован."), NotImplementedError)

	def get_payment_status(self, payment_id):
		frappe.throw(_("СБП ещё не реализован."), NotImplementedError)

	def refund(self, payment_id, amount=None):
		frappe.throw(_("СБП ещё не реализован."), NotImplementedError)

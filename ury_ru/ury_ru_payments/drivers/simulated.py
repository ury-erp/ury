"""Эмулятор эквайринга для тестов/демо."""

import frappe

from ury_ru.ury_ru_payments.payments import PaymentProvider


class SimulatedPaymentProvider(PaymentProvider):
	name = "simulated"

	def create_payment(self, invoice_name, amount, method="card"):
		payment_id = frappe.generate_hash(length=12)
		doc = frappe.new_doc("URY RU Payment Transaction")
		doc.invoice = invoice_name
		doc.amount = amount
		doc.method = method
		doc.payment_id = payment_id
		doc.status = "Paid"
		doc.insert(ignore_permissions=True)
		return {"payment_id": payment_id, "url": f"https://pay.example/{payment_id}", "status": "Paid"}

	def get_payment_status(self, payment_id):
		status = frappe.db.get_value("URY RU Payment Transaction", {"payment_id": payment_id}, "status")
		return {"status": status or "Paid", "reference": payment_id}

	def refund(self, payment_id, amount=None):
		txn = frappe.db.get_value("URY RU Payment Transaction", {"payment_id": payment_id}, "name")
		if txn:
			frappe.db.set_value("URY RU Payment Transaction", txn, "status", "Refunded")
		return {"status": "Refunded"}

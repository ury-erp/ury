"""Хуки фискализации: встраивание в жизненный цикл POS Invoice.

Регистрируются через doc_events в ury_ru/hooks.py.

- on_submit  -> поставить фискализацию чека в очередь (продажа)
- on_cancel  -> фискализировать возврат (sell_return), если чек был пробит

Фискализация выполняется асинхронно (frappe.enqueue), чтобы не блокировать
кассира на время печати чека и обмена с ККТ.
"""

import frappe
from frappe import _

from ury_ru.ury_ru_fiscal.fiscal_driver import get_fiscal_driver
from ury_ru.ury_ru_fiscal import receipt as receipt_builder


def _fiscal_settings():
	"""Singleton-настройки модуля (создаются при install)."""
	name = "URY RU Fiscal Settings"
	if not frappe.db.exists("URY RU Fiscal Settings", name):
		return frappe._dict({
			"enabled": False,
			"driver": "Simulated",
			"offline_mode_enabled": True,
			"retry_count": 3,
		})
	return frappe.get_doc("URY RU Fiscal Settings", name)


def _fiscal_enabled():
	return bool(_fiscal_settings().get("enabled"))


def on_submit(doc, method):
	"""Провести фискализацию после submit инвойса (продажа)."""
	if not _fiscal_enabled():
		return
	# is_return у POS Invoice — возврат пробивается отдельно (on_cancel/return flow)
	if doc.get("is_return"):
		_enqueue_receipt(doc, "sell_return")
	else:
		_enqueue_receipt(doc, "sell")


def on_cancel(doc, method):
	"""Аннулирование инвойса — фискализируем возврат, если чек был пробит."""
	if not _fiscal_enabled():
		return
	if _was_fiscalized(doc.name):
		_enqueue_receipt(doc, "sell_return")


def _was_fiscalized(invoice_name):
	return frappe.db.exists("URY RU Fiscal Receipt", {
		"pos_invoice": invoice_name,
		"status": ("in", ("Sent", "Confirmed")),
	})


def _enqueue_receipt(invoice, receipt_type):
	"""Поставить сборку+фискализацию чека в фоновую очередь."""
	try:
		frappe.enqueue(
			"ury_ru.ury_ru_fiscal.fiscal_hooks.process_receipt",
			queue="long",
			timeout=120,
			invoice_name=invoice.name,
			receipt_type=receipt_type,
		)
	except Exception as e:
		frappe.log_error(f"Fiscal enqueue failed for {invoice.name}: {e}", "URY RU Fiscal")


def process_receipt(invoice_name, receipt_type):
	"""Фоновая задача: собрать чек, отправить в ККТ, сохранить журнал.

	Вызывается только через frappe.enqueue (см. _enqueue_receipt).
	"""
	settings = _fiscal_settings()
	if not settings.get("enabled"):
		return

	invoice = frappe.get_doc("POS Invoice", invoice_name)
	receipt = receipt_builder.build_receipt_from_invoice(invoice, receipt_type)

	driver = get_fiscal_driver()
	try:
		result = driver.register_receipt(receipt)
		_create_fiscal_receipt(invoice, receipt, result, status="Sent")
	except Exception as e:
		frappe.log_error(f"Fiscal register failed for {invoice_name}: {e}", "URY RU Fiscal")
		_create_fiscal_receipt(invoice, receipt, None, status="Failed", error=str(e))
		# TODO(retry): при offline_mode_enabled и retry_count > 0 — ретраи с backoff


def _create_fiscal_receipt(invoice, receipt, result, status, error=None):
	"""Записать строку в журнал URY RU Fiscal Receipt."""
	doc = frappe.new_doc("URY RU Fiscal Receipt")
	doc.pos_invoice = invoice.name
	doc.receipt_type = receipt.get("receipt_type")
	doc.amount = receipt.get("total")
	doc.status = status
	doc.error = error
	if result:
		doc.fiscal_document_number = result.get("fiscal_document_number")
		doc.fiscal_sign = result.get("fiscal_sign")
	doc.insert(ignore_permissions=True)

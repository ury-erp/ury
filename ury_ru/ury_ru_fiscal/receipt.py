"""Сборка фискального чека (ФФД) из POS Invoice.

Каноническое представление чека, которое понимают все драйверы.
Адаптер переводит его в конкретный протокол (АТОЛ DTO, ШТРИХ-М).

НДС маппинг: ERPNext хранит налоги строками Sales Taxes and Charges
(account_head + rate). Здесь они сопоставляются со ставками ФФД через
настройку URY RU Fiscal Settings (дочерняя таблица "НДС маппинг").
"""

import frappe
from frappe import _

# Ставки НДС по ФФД
VAT_RATES = ("vat20", "vat10", "vat0", "none", "vat20_120", "vat10_110")

# Признак способа расчёта (тег 1214) -> текстовые константы драйверов
PAYMENT_TYPES = {
	"cash": "cash",              # наличные
	"electronic": "electronic",  # электронные (карта, СБП)
	"prepaid": "prepaid",        # предоплата
	"credit": "credit",          # кредит
}


def _map_payment_type(mode_of_payment):
	"""Сопоставить способ оплаты URY/ERPNext с типом ФФД."""
	if not mode_of_payment:
		return "electronic"
	mp = mode_of_payment.lower()
	# Грубая эвристика; точный маппинг — в настройках модуля/платежей
	if "cash" in mp or "наличн" in mp:
		return "cash"
	if "credit" in mp or "кредит" in mp:
		return "credit"
	if "prepaid" in mp or "аванс" in mp or "предоплат" in mp:
		return "prepaid"
	return "electronic"


def _map_vat_rate(account_head, rate, vat_mapping):
	"""Сопоставить account_head/rate со ставкой ФФД.

	:param vat_mapping: dict {account_head: {"rate": "vat20", ...}} из настроек
	"""
	if vat_mapping:
		if account_head in vat_mapping:
			return vat_mapping[account_head]
		# фолбэк по числовой ставке
		for acct, mapped in vat_mapping.items():
			if mapped.get("rate") and float(mapped.get("rate", 0)) == float(rate or 0):
				return mapped
	if rate in (None, "", 0):
		return "none"
	rate = float(rate)
	if abs(rate - 20.0) < 0.01:
		return "vat20"
	if abs(rate - 10.0) < 0.01:
		return "vat10"
	if abs(rate) < 0.01:
		return "vat0"
	# расчётные ставки (НДС включён): 20/120, 10/110
	if abs(rate - 20.0 / 120.0 * 100) < 0.01:
		return "vat20_120"
	if abs(rate - 10.0 / 110.0 * 100) < 0.01:
		return "vat10_110"
	return "none"


def get_vat_mapping():
	"""Загрузить маппинг НДС из URY RU Fiscal Settings.

	Возвращает dict {account_head: {"rate": "vat20", "percent": 20.0}}.
	Если настроек нет — пустой dict (тогда все позиции -> "none").
	"""
	mapping = {}
	if frappe.db.exists("URY RU Fiscal Settings", "URY RU Fiscal Settings"):
		settings = frappe.get_doc("URY RU Fiscal Settings")
		for row in getattr(settings, "vat_mapping", []) or []:
			mapping[row.account_head] = {
				"rate": row.fiscal_vat_rate or "none",
				"percent": row.percent or 0,
			}
	return mapping


def build_receipt_from_invoice(invoice, receipt_type="sell"):
	"""Собрать канонический чек ФФД из POS Invoice.

	:param invoice: Document "POS Invoice"
	:param receipt_type: "sell" | "sell_return" | "correction"
	:return: dict с позициями, суммами, ставками НДС и типами оплат
	"""
	vat_mapping = get_vat_mapping()

	items = []
	for it in invoice.get("items", []) or []:
		rate = it.get("rate") or 0
		qty = it.get("qty") or 0
		items.append({
			"name": it.get("item_name") or it.get("item_code"),
			"qty": qty,
			"price": rate,
			"amount": round(rate * qty, 2),
			"vat_rate": _map_vat_rate(it.get("account_head"), _item_tax_rate(invoice, it), vat_mapping),
			"subject": getattr(it, "custom_fiscal_subject", "commodity"),
		})

	payments = []
	for p in invoice.get("payments", []) or []:
		payments.append({
			"type": _map_payment_type(p.get("mode_of_payment")),
			"amount": p.get("amount") or 0,
		})

	return {
		"receipt_type": receipt_type,
		"invoice": invoice.name,
		"total": invoice.get("grand_total") or 0,
		"items": items,
		"payments": payments,
		"cashier": invoice.get("modified_by") or frappe.session.user,
		"kkt_reg_number": None,  # подставляется драйвером/настройкой ККТ
	}


def _item_tax_rate(invoice, item):
	"""Найти числовую ставку налога для позиции из taxes-таблицы инвойса.

	ERPNext хранит налоги на уровне инвойса (Sales Taxes and Charges),
	привязанные к item tax template. Здесь — упрощённый фолбэк: берём
	account_head позиции, если он задан на item_row, иначе None.
	"""
	# Реальная реализация: resolve через Item Tax Template / item tax row.
	# Пока возвращаем None — маппинг решает по account_head.
	return None

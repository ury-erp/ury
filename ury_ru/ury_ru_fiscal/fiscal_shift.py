"""Смена кассы (своя модель).

Не переиспользуем POS Opening/Closing Entry — у фискализации своя смена,
жёстко привязанная к ККТ. Открытие/закрытие вызывает драйвер и пишет
статистику (число чеков, сумма) в URY RU Fiscal Shift.
"""

import frappe
from frappe import _

from ury_ru.ury_ru_fiscal.fiscal_driver import get_fiscal_driver


@frappe.whitelist()
def open_shift(kkt_name):
	"""Открыть смену на ККТ (создаёт URY RU Fiscal Shift)."""
	# Не даём открыть вторую открытую смену на той же ККТ
	existing = frappe.db.exists("URY RU Fiscal Shift", {
		"kkt": kkt_name, "status": "Open",
	})
	if existing:
		frappe.throw(_("На этой ККТ уже есть открытая смена."))

	driver = get_fiscal_driver()
	result = driver.open_shift(frappe.session.user)

	shift = frappe.new_doc("URY RU Fiscal Shift")
	shift.kkt = kkt_name
	shift.cashier = frappe.session.user
	shift.status = "Open"
	shift.opened_at = frappe.utils.now_datetime()
	shift.opening_fiscal_document = result.get("fiscal_document_number")
	shift.insert(ignore_permissions=True)
	return shift.name


@frappe.whitelist()
def close_shift(shift_name):
	"""Закрыть смену (Z-отчёт)."""
	shift = frappe.get_doc("URY RU Fiscal Shift", shift_name)
	if shift.status != "Open":
		frappe.throw(_("Смена уже закрыта."))

	driver = get_fiscal_driver()
	result = driver.close_shift(shift.cashier)

	# Статистика по смене из журнала чеков
	stats = frappe.db.sql(
		"""
		SELECT COUNT(*), COALESCE(SUM(amount), 0)
		FROM `tabURY RU Fiscal Receipt`
		WHERE shift = %s AND status IN ('Sent', 'Confirmed')
		""",
		shift_name,
		as_dict=True,
	)
	if stats:
		shift.receipts_count = stats[0].get("COUNT(*)", 0)
		shift.total_amount = stats[0].get("COALESCE(SUM(amount), 0)", 0)

	shift.status = "Closed"
	shift.closed_at = frappe.utils.now_datetime()
	shift.closing_fiscal_document = result.get("fiscal_document_number")
	shift.save(ignore_permissions=True)
	return shift.name

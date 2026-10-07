"""Рассылка отчётов в Telegram по расписанию (scheduler_events).

Периодичность берётся из настроек модуля. Каждая отправка пишет строку
в URY RU Telegram Log.
"""

import frappe
from frappe.utils import nowdate, now_datetime


def _settings():
	return frappe.get_cached_doc("URY RU Telegram Settings")


def _chats(settings):
	return [c for c in settings.get("chats", []) if c.get("chat_id")]


def run_daily_report():
	"""Отправить отчёт во все настроенные чаты (вызывается из cron)."""
	settings = _settings()
	if not settings.get("enabled"):
		return

	chats = _chats(settings)
	if not chats:
		return

	from ury_ru.ury_ru_telegram.telegram import get_telegram_provider
	from ury_ru.ury_ru_telegram.reports import build_report

	provider = get_telegram_provider()
	sections = []
	if settings.get("include_sales"):
		sections.append("sales")
	if settings.get("include_customers"):
		sections.append("customers")
	if settings.get("include_kitchen"):
		sections.append("kitchen")
	if settings.get("include_orders"):
		sections.append("orders")

	text = build_report(sections=sections, from_date=nowdate(), to_date=nowdate())

	for chat in chats:
		chat_id = chat.get("chat_id")
		try:
			provider.send_message(chat_id, text)
			_log(chat_id, "Success", text)
		except Exception as e:
			_log(chat_id, "Failed", text, error=str(e))
			frappe.log_error(frappe.get_traceback(), "URY RU Telegram: send failed")


def _log(chat_id, status, message, error=None):
	doc = frappe.new_doc("URY RU Telegram Log")
	doc.chat_id = chat_id
	doc.status = status
	doc.message = message
	if error:
		doc.error = error[:500]
	doc.insert(ignore_permissions=True)

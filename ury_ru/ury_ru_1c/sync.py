"""Периодический обмен с 1С (scheduler).

Вызывается из scheduler_events (cron) в ury_ru/hooks.py. Проверяет настройки
модуля: если периодичность позволяет и обмен включён — запускает sync().
"""

import frappe


@frappe.whitelist()
def run_sync_if_due():
	"""Запустить синхронизацию с 1С, если включена и подошёл интервал."""
	if not frappe.db.exists("URY RU 1C Settings", "URY RU 1C Settings"):
		return
	settings = frappe.get_doc("URY RU 1C Settings", "URY RU 1C Settings")
	if not settings.get("enabled"):
		return
	if settings.get("sync_interval") == "Manual":
		return

	from ury_ru.ury_ru_1c.one_c import get_1c_provider

	try:
		result = get_1c_provider().sync()
	except Exception as e:
		doc = frappe.new_doc("URY RU 1C Sync Log")
		doc.operation = "sync"
		doc.status = "Failed"
		doc.error = str(e)
		doc.insert(ignore_permissions=True)
		frappe.log_error(f"1C sync failed: {e}", "URY RU 1C")

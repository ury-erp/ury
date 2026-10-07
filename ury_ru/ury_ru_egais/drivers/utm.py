"""ЕГАИС через УТМ (заглушка).

Реальная интеграция: УТМ Росалкогольрегулирования (Java-модуль, обмен по
XML-подписанным документам через локальный сервис УТМ).
"""

import frappe
from frappe import _

from ury_ru.ury_ru_egais.egais import EgaisProvider


class UtmEgaisProvider(EgaisProvider):
	name = "utm"

	def __init__(self, utm_url=None, fsrar_id=None):
		self.utm_url = utm_url
		self.fsrar_id = fsrar_id

	def get_incoming_waybills(self):
		frappe.throw(_("ЕГАИС (УТМ) ещё не реализован."), NotImplementedError)

	def confirm_waybill(self, waybill_id):
		frappe.throw(_("ЕГАИС (УТМ) ещё не реализован."), NotImplementedError)

	def send_outgoing_waybill(self, waybill):
		frappe.throw(_("ЕГАИС (УТМ) ещё не реализован."), NotImplementedError)

	def write_off(self, items, reason):
		frappe.throw(_("ЕГАИС (УТМ) ещё не реализован."), NotImplementedError)

	def get_remains(self):
		frappe.throw(_("ЕГАИС (УТМ) ещё не реализован."), NotImplementedError)

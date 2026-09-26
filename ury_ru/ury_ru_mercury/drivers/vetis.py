"""Меркурий через ВетИС.API (заглушка).

Реальная интеграция: ВетИС.API (REST) Россельхознадзора, ЭЦП, обмен
XML/JSON документами ВСД.
"""

import frappe
from frappe import _

from ury_ru.ury_ru_mercury.mercury import MercuryProvider


class VetisMercuryProvider(MercuryProvider):
	name = "vetis"

	def __init__(self, api_url=None, login=None):
		self.api_url = api_url
		self.login = login

	def get_incoming_vsd(self):
		frappe.throw(_("Меркурий (ВетИС.API) ещё не реализован."), NotImplementedError)

	def accept_vsd(self, vsd_id):
		frappe.throw(_("Меркурий (ВетИС.API) ещё не реализован."), NotImplementedError)

	def return_vsd(self, vsd_id):
		frappe.throw(_("Меркурий (ВетИС.API) ещё не реализован."), NotImplementedError)

	def create_vsd(self, document):
		frappe.throw(_("Меркурий (ВетИС.API) ещё не реализован."), NotImplementedError)

	def get_products(self):
		frappe.throw(_("Меркурий (ВетИС.API) ещё не реализован."), NotImplementedError)

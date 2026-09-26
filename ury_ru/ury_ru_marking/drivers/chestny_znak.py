"""Честный знак (ЦРПТ) — заглушка.

Реальная интеграция через API Честного знака (ЦРПТ / ГИС МТ):
- эмиссия и получение кодов DataMatrix, агрегация, вывод из оборота,
  проверка, личный кабинет.
"""

import frappe
from frappe import _

from ury_ru.ury_ru_marking.marking import MarkingProvider


class ChestnyZnakMarkingProvider(MarkingProvider):
	name = "chestny_znak"

	def __init__(self, api_key=None, inn=None):
		self.api_key = api_key
		self.inn = inn

	def get_codes(self, quantity, product_group, subject):
		frappe.throw(_("Честный знак ещё не реализован."), NotImplementedError)

	def register_emission(self, codes):
		frappe.throw(_("Честный знак ещё не реализован."), NotImplementedError)

	def aggregate(self, codes, parent_code):
		frappe.throw(_("Честный знак ещё не реализован."), NotImplementedError)

	def write_off(self, codes, reason):
		frappe.throw(_("Честный знак ещё не реализован."), NotImplementedError)

	def verify(self, code):
		frappe.throw(_("Честный знак ещё не реализован."), NotImplementedError)

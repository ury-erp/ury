"""Эмулятор маркировки для тестов/демо."""

import frappe

from ury_ru.ury_ru_marking.marking import MarkingProvider


class SimulatedMarkingProvider(MarkingProvider):
	name = "simulated"

	def get_codes(self, quantity, product_group, subject):
		return [frappe.generate_hash(length=14).upper() for _ in range(quantity or 0)]

	def register_emission(self, codes):
		return {"registered": len(codes or [])}

	def aggregate(self, codes, parent_code):
		return {"aggregated": len(codes or [])}

	def write_off(self, codes, reason):
		return {"written_off": len(codes or [])}

	def verify(self, code):
		return {"valid": True}

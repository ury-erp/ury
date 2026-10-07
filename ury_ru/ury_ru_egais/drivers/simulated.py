"""Эмулятор ЕГАИС для тестов/демо."""

from ury_ru.ury_ru_egais.egais import EgaisProvider


class SimulatedEgaisProvider(EgaisProvider):
	name = "simulated"

	def get_incoming_waybills(self):
		return []

	def confirm_waybill(self, waybill_id):
		return {"status": "confirmed"}

	def send_outgoing_waybill(self, waybill):
		return {"waybill_id": "SIM-0001"}

	def write_off(self, items, reason):
		return {"written_off": len(items or [])}

	def get_remains(self):
		return {}

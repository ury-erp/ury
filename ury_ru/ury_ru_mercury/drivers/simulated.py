"""Эмулятор Меркурий для тестов/демо."""

from ury_ru.ury_ru_mercury.mercury import MercuryProvider


class SimulatedMercuryProvider(MercuryProvider):
	name = "simulated"

	def get_incoming_vsd(self):
		return []

	def accept_vsd(self, vsd_id):
		return {"status": "accepted"}

	def return_vsd(self, vsd_id):
		return {"status": "returned"}

	def create_vsd(self, document):
		return {"vsd_id": "SIM-VSD-0001"}

	def get_products(self):
		return {}

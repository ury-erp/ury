"""ИИ-аналитика: провайдер + реестр.

Паттерн как у остальных RU-модулей (1C, Fiscal, ...): сторонний адаптер
регистрируется через register_deepseek_provider(), модуль вызывает
get_deepseek_provider(). По умолчанию NoOp — честная ошибка.

Разделение ответственности:
- analytics.py собирает «сырые» показатели из БД (dict);
- predictions.py готовит историю/контекст для прогнозов;
- провайдер отвечает за «интеллектуальную» часть — превращение показателей
  в выводы/советы и численные прогнозы (LLM-вызов или эвристика).
"""

import frappe
from frappe import _


class DeepseekProvider:
	"""Абстрактный интерфейс ИИ-аналитики (DeepSeek или аналог)."""

	name = "abstract"

	def analyze(self, metrics):
		"""Превратить собранные показатели в выводы и советы по управлению.

		:param metrics: dict из analytics.gather_metrics()
		:return: dict {"conclusions": [str, ...], "advice": [str, ...],
		               "summary": str, "raw": str}
		"""
		raise NotImplementedError

	def predict_visitor_flow(self, history, days=7):
		"""Прогноз потока посетителей на `days` дней.

		:param history: list[dict] из predictions.visitor_flow_history()
		:return: list[dict] {"date": str, "guests": int, "confidence": float}
		"""
		raise NotImplementedError

	def predict_food_orders(self, history, days=7):
		"""Прогноз заказа продуктов/полуфабрикатов на `days` дней.

		:param history: dict из predictions.food_history()
		:return: list[dict] {"item_code": str, "item_name": str,
		                      "predicted_qty": float, "uom": str,
		                      "kind": "product"/"semi_finished"}
		"""
		raise NotImplementedError


class NoOpDeepseekProvider(DeepseekProvider):
	"""По умолчанию: честная ошибка вместо молчаливого бездействия."""

	name = "noop"

	def _throw(self):
		frappe.throw(
			_("ИИ-аналитика не настроена. Укажите провайдера в URY RU Deepseek Settings."),
			frappe.ValidationError,
		)

	def analyze(self, metrics):
		self._throw()

	def predict_visitor_flow(self, history, days=7):
		self._throw()

	def predict_food_orders(self, history, days=7):
		self._throw()


_deepseek_provider = NoOpDeepseekProvider()


def register_deepseek_provider(provider):
	global _deepseek_provider
	if not isinstance(provider, DeepseekProvider):
		frappe.throw(_("Провайдер ИИ должен наследовать DeepseekProvider"))
	_deepseek_provider = provider


def get_deepseek_provider():
	return _deepseek_provider

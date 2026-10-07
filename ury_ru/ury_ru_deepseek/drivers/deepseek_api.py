"""Драйвер DeepSeek API (реальный HTTP-клиент).

Отправляет запросы в OpenAI-совместимый эндпоинт DeepSeek
(https://api.deepseek.com/chat/completions). Требует API-ключ в настройках.

Использует стандартный `requests` (зависимость frappe). Если ключ не задан
или запрос не удался — честная ошибка.
"""

import frappe
import requests
from frappe import _

from ury_ru.ury_ru_deepseek.deepseek import DeepseekProvider


class DeepseekApiProvider(DeepseekProvider):
	name = "deepseek_api"

	def __init__(self, api_key=None, base_url=None, model=None):
		settings = frappe.get_cached_doc("URY RU Deepseek Settings")
		self.api_key = api_key or settings.get_password("api_key") or None
		self.base_url = (base_url or settings.get("base_url") or "https://api.deepseek.com").rstrip("/")
		self.model = model or settings.get("model") or "deepseek-chat"

	def _chat(self, system_prompt, user_prompt):
		if not self.api_key:
			frappe.throw(_("Не задан API-ключ DeepSeek в URY RU Deepseek Settings."), frappe.ValidationError)

		resp = requests.post(
			f"{self.base_url}/chat/completions",
			headers={
				"Authorization": f"Bearer {self.api_key}",
				"Content-Type": "application/json",
			},
			json={
				"model": self.model,
				"messages": [
					{"role": "system", "content": system_prompt},
					{"role": "user", "content": user_prompt},
				],
				"temperature": 0.4,
			},
			timeout=60,
		)
		if resp.status_code != 200:
			frappe.throw(
				_("DeepSeek API вернул {0}: {1}").format(resp.status_code, resp.text[:300]),
				frappe.ValidationError,
			)
		return resp.json()["choices"][0]["message"]["content"]

	def analyze(self, metrics):
		system = (
			"Ты — финансовый и операционный консультант ресторанного бизнеса. "
			"На основе показателей дай краткие выводы и конкретные советы по управлению. "
			"Отвечай на русском, строго по делу."
		)
		content = self._chat(system, frappe.as_json(metrics))
		return {"summary": content[:200], "conclusions": [content], "advice": [], "raw": content}

	def predict_visitor_flow(self, history, days=7):
		system = (
			"Ты — аналитик по прогнозированию спроса. На основе истории потока "
			"верни JSON-список прогноза на каждый день: [{\"date\": ..., \"guests\": int, "
			"\"confidence\": float}]. Отвечай только JSON."
		)
		raw = self._chat(system, frappe.as_json({"history": history, "days": days}))
		import json
		try:
			return json.loads(raw)
		except Exception:
			frappe.throw(_("Не удалось разобрать прогноз от DeepSeek: {0}").format(raw[:200]))

	def predict_food_orders(self, history, days=7):
		system = (
			"Ты — аналитик закупок для кухни. На основе истории расхода товаров "
			"верни JSON-список плана заказа: [{\"item_code\": ..., \"predicted_qty\": float}]. "
			"Отвечай только JSON."
		)
		raw = self._chat(system, frappe.as_json({"history": history, "days": days}))
		import json
		try:
			return json.loads(raw)
		except Exception:
			frappe.throw(_("Не удалось разобрать план заказа от DeepSeek: {0}").format(raw[:200]))

"""Эмулятор ИИ-аналитики для тестов/демо.

Никогда не регистрируется по умолчанию. Формирует детерминированные выводы
и прогнозы на основе переданных показателей — без вызова внешнего API.
"""

import frappe
from frappe.utils import flt, add_days, nowdate

from ury_ru.ury_ru_deepseek.deepseek import DeepseekProvider


def _log_insight(insight_type, summary, conclusions, advice, metrics=None):
	doc = frappe.new_doc("URY RU Deepseek Insight")
	doc.insight_type = insight_type
	doc.summary = summary
	doc.conclusions = "\n".join(conclusions)
	doc.advice = "\n".join(advice)
	doc.metrics_json = frappe.as_json(metrics or {})
	doc.status = "Success"
	doc.insert(ignore_permissions=True)


class SimulatedDeepseekProvider(DeepseekProvider):
	name = "simulated"

	def analyze(self, metrics):
		sales = metrics.get("sales", {})
		total = flt(sales.get("total", 0))
		orders = int(sales.get("orders", 0))
		avg = flt(sales.get("avg_check", 0))
		items = metrics.get("items", []) or []
		top = items[0] if items else None

		conclusions = [
			f"Выручка за период: {total:.2f} (чеков: {orders}).",
			f"Средний чек: {avg:.2f}.",
		]
		if top:
			conclusions.append(
				f"Топ-позиция: {top.get('item_name')} "
				f"(выручка {flt(top.get('revenue', 0)):.2f})."
			)

		advice = [
			"Проанализируйте часы пик и скорректируйте график персонала.",
			"Расширьте меню вокруг топовых позиций и уберите неликвид.",
		]
		if avg and avg < 500:
			advice.append("Средний чек низкий — рассмотрите допродажи и комбо.")

		summary = f"Продажи {total:.0f}, средний чек {avg:.0f}"
		_log_insight("Management", summary, conclusions, advice, metrics)
		return {"summary": summary, "conclusions": conclusions, "advice": advice, "raw": "simulated"}

	def predict_visitor_flow(self, history, days=7):
		from ury_ru.ury_ru_deepseek.predictions import predict_visitor_flow

		forecast = predict_visitor_flow(days=days)
		for row in forecast:
			doc = frappe.new_doc("URY RU Deepseek Forecast")
			doc.forecast_type = "Visitor Flow"
			doc.forecast_date = row["date"]
			doc.predicted_qty = row["guests"]
			doc.confidence = row["confidence"] * 100
			doc.insert(ignore_permissions=True)
		return forecast

	def predict_food_orders(self, history, days=7):
		from ury_ru.ury_ru_deepseek.predictions import predict_food_orders

		plan = predict_food_orders(days=days)
		for row in plan:
			doc = frappe.new_doc("URY RU Deepseek Forecast")
			doc.forecast_type = "Food Orders"
			doc.forecast_date = add_days(nowdate(), 1)
			doc.item_code = row["item_code"]
			doc.item_name = row["item_name"]
			doc.uom = row["uom"]
			doc.predicted_qty = row["predicted_qty"]
			doc.notes = row["kind"]
			doc.insert(ignore_permissions=True)
		return plan

"""Точки входа для расписания (scheduler_events) и ручного запуска.

Запускает полный цикл: анализ показателей + два прогноза. Пишет результаты
в doctype-журналы (Insight / Forecast).
"""

import frappe
from frappe.utils import flt, add_days, nowdate, getdate


def _settings():
	return frappe.get_cached_doc("URY RU Deepseek Settings")


def run_daily_analysis():
	"""Ежедневный цикл ИИ-аналитики (вызывается из scheduler_events)."""
	settings = _settings()
	if not settings.get("enabled"):
		return

	from ury_ru.ury_ru_deepseek.deepseek import get_deepseek_provider
	from ury_ru.ury_ru_deepseek.analytics import gather_metrics
	from ury_ru.ury_ru_deepseek.predictions import (
		visitor_flow_history,
		food_history,
	)

	provider = get_deepseek_provider()
	analysis_days = settings.get("analysis_days") or 30
	forecast_days = settings.get("forecast_days") or 7
	to_date = nowdate()
	from_date = add_days(to_date, -analysis_days)

	try:
		metrics = gather_metrics(from_date, to_date)
		provider.analyze(metrics)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "URY RU Deepseek: analysis failed")

	try:
		provider.predict_visitor_flow(visitor_flow_history(days=analysis_days), days=forecast_days)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "URY RU Deepseek: visitor forecast failed")

	try:
		provider.predict_food_orders(food_history(days=analysis_days), days=forecast_days)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "URY RU Deepseek: food forecast failed")

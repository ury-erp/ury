"""Прогнозы: поток посетителей и заказ продуктов/полуфабрикатов.

Детерминированные эвристики на исторических данных (скользящее среднее +
сезонность по дням недели). Результаты отдаются провайдеру, который может
их уточнить через LLM или вернуть как есть.
"""

import frappe
from frappe.utils import flt, add_days, getdate, nowdate


def _invoices_table():
	return "POS Invoice" if frappe.db.table_exists("POS Invoice") else "Sales Invoice"


def visitor_flow_history(days=30, branch=None):
	"""История потока по дням: число чеков и выручка.

	:return: list[dict] {"date": str, "orders": int, "guests": int, "revenue": float}
	"""
	inv = _invoices_table()
	branch_filter = ""
	args = {"from": add_days(nowdate(), -days)}
	if branch:
		branch_filter = "AND branch = %(branch)s"
		args["branch"] = branch

	rows = frappe.db.sql(
		f"""
		SELECT posting_date AS date, COUNT(*) AS orders,
		       COALESCE(SUM(grand_total), 0) AS revenue
		FROM `tab{inv}`
		WHERE docstatus = 1 AND posting_date >= %(from)s {branch_filter}
		GROUP BY posting_date
		ORDER BY posting_date
		""",
		args,
		as_dict=True,
	)
	for r in rows:
		r["date"] = str(r["date"])
		r["orders"] = int(r["orders"])
		r["revenue"] = flt(r["revenue"])
		r["guests"] = r["orders"]  # эвристика: 1 чек ≈ 1 гость (без pax)
	return rows


def predict_visitor_flow(days=7, branch=None):
	"""Прогноз потока на `days` дней вперёд (скользящее среднее + день недели).

	:return: list[dict] {"date", "guests", "confidence"}
	"""
	history = visitor_flow_history(days=30, branch=branch)
	if not history:
		return []

	# Среднее по дню недели + общее среднее
	weekday_totals = {}
	weekday_counts = {}
	overall = 0
	for row in history:
		wd = getdate(row["date"]).weekday()
		weekday_totals[wd] = weekday_totals.get(wd, 0) + row["guests"]
		weekday_counts[wd] = weekday_counts.get(wd, 0) + 1
		overall += row["guests"]

	overall_avg = overall / len(history) if history else 0
	weekday_avg = {
		wd: weekday_totals[wd] / weekday_counts[wd] for wd in weekday_totals
	}

	forecast = []
	start = add_days(nowdate(), 1)
	for i in range(days):
		d = add_days(start, i)
		wd = getdate(d).weekday()
		# Бленд: 60% день-недели, 40% общее среднее (если нет данных дня — общее)
		wd_avg = weekday_avg.get(wd, overall_avg)
		value = round(0.6 * wd_avg + 0.4 * overall_avg, 1)
		confidence = 0.7 if wd in weekday_avg else 0.4
		forecast.append(
			{"date": str(d), "guests": value, "confidence": confidence}
		)
	return forecast


def food_history(days=30, branch=None):
	"""История продаж по позициям: среднесуточный расход каждого товара.

	:return: dict {item_code: {"item_name", "uom", "daily_qty", "total_qty"}}
	"""
	inv = _invoices_table()
	branch_item_filter = ""
	args = {"from": add_days(nowdate(), -days)}
	if branch:
		branch_item_filter = "AND p.branch = %(branch)s"
		args["branch"] = branch

	rows = frappe.db.sql(
		f"""
		SELECT i.item_code, i.item_name, i.uom, SUM(i.qty) AS total_qty
		FROM `tab{inv} Item` i
		JOIN `tab{inv}` p ON p.name = i.parent
		WHERE p.docstatus = 1 AND p.posting_date >= %(from)s {branch_item_filter}
		GROUP BY i.item_code, i.item_name, i.uom
		""",
		args,
		as_dict=True,
	)
	out = {}
	for r in rows:
		total = flt(r["total_qty"])
		out[r["item_code"]] = {
			"item_name": r["item_name"],
			"uom": r["uom"] or "Nos",
			"total_qty": total,
			"daily_qty": total / days,
		}
	return out


def predict_food_orders(days=7, branch=None):
	"""Прогноз заказа продуктов на `days` дней вперёд.

	Для товаров с BOM (полуфабрикаты/блюда) дополнительно раскрывает
	компоненты и добавляет их в план закупки.

	:return: list[dict] {"item_code", "item_name", "predicted_qty", "uom", "kind"}
	"""
	history = food_history(days=30, branch=branch)
	if not history:
		return []

	plan = {}
	for item_code, h in history.items():
		predicted = h["daily_qty"] * days
		if predicted <= 0:
			continue
		kind = "semi_finished" if _has_bom(item_code) else "product"
		plan[item_code] = {
			"item_code": item_code,
			"item_name": h["item_name"],
			"predicted_qty": predicted,
			"uom": h["uom"],
			"kind": kind,
		}

	# Раскрытие BOM: компоненты полуфабрикатов добавляем в план закупки
	for item_code, item in list(plan.items()):
		if item["kind"] != "semi_finished":
			continue
		for comp in _bom_components(item_code):
			comp_code = comp["item_code"]
			comp_qty = comp["qty"] * item["predicted_qty"]
			if comp_code in plan:
				plan[comp_code]["predicted_qty"] += comp_qty
			else:
				plan[comp_code] = {
					"item_code": comp_code,
					"item_name": comp["item_name"],
					"predicted_qty": comp_qty,
					"uom": comp["uom"],
					"kind": "product",
				}

	# Округление и сортировка по убыванию объёма
	result = []
	for p in plan.values():
		p["predicted_qty"] = round(p["predicted_qty"], 2)
		result.append(p)
	result.sort(key=lambda x: x["predicted_qty"], reverse=True)
	return result


def _has_bom(item_code):
	return bool(frappe.db.exists("BOM", {"item": item_code, "is_active": 1}))


def _bom_components(item_code):
	"""Компоненты активного BOM (1 уровень)."""
	bom = frappe.db.get_value(
		"BOM", {"item": item_code, "is_active": 1}, "name"
	)
	if not bom:
		return []
	rows = frappe.db.sql(
		"""
		SELECT item_code, item_name, qty, uom
		FROM `tabBOM Item`
		WHERE parent = %s AND docstatus < 2
		""",
		(bom,),
		as_dict=True,
	)
	for r in rows:
		r["qty"] = flt(r["qty"])
		r["uom"] = r["uom"] or "Nos"
	return rows

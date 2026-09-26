"""Сбор показателей заведения для ИИ-аналитики.

Собирает из БД ключевые метрики за период и возвращает структурированный
dict. Провайдер (DeepSeek) затем превращает их в выводы/советы.

Метрики:
- sales: выручка, число чеков, средний чек
- orders: разбивка по типам заказа
- customers: уникальные клиенты, топ по выручке
- kitchen: число KOT, среднее время производства/подачи
- items: топ блюд по выручке/количеству
"""

import frappe
from frappe.utils import flt, getdate


def _invoices_table():
	"""Основная таблица чеков для аналитики (POS Invoice, fallback Sales Invoice)."""
	if frappe.db.table_exists("POS Invoice"):
		return "POS Invoice"
	return "Sales Invoice"


def gather_metrics(from_date, to_date, branch=None):
	"""Собрать показатели за период [from_date, to_date].

	:return: dict с ключами sales, orders, customers, kitchen, items
	"""
	from_date = getdate(from_date)
	to_date = getdate(to_date)
	inv = _invoices_table()

	branch_filter = ""
	branch_item_filter = ""
	args = {"from_date": from_date, "to_date": to_date}
	if branch:
		branch_filter = "AND branch = %(branch)s"
		branch_item_filter = "AND p.branch = %(branch)s"
		args["branch"] = branch

	# --- Продажи ---
	sales = frappe.db.sql(
		f"""
		SELECT COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS total
		FROM `tab{inv}`
		WHERE docstatus = 1 AND posting_date BETWEEN %(from_date)s AND %(to_date)s
			{branch_filter}
		""",
		args,
		as_dict=True,
	)[0]
	sales["orders"] = int(sales["orders"])
	sales["total"] = flt(sales["total"])
	sales["avg_check"] = sales["total"] / sales["orders"] if sales["orders"] else 0.0

	# --- Типы заказа (только POS Invoice имеет order_type) ---
	orders_by_type = []
	if inv == "POS Invoice":
		orders_by_type = frappe.db.sql(
			f"""
			SELECT order_type, COUNT(*) AS cnt, COALESCE(SUM(grand_total), 0) AS total
			FROM `tab{inv}`
			WHERE docstatus = 1 AND posting_date BETWEEN %(from_date)s AND %(to_date)s
				{branch_filter}
			GROUP BY order_type
			ORDER BY total DESC
			""",
			args,
			as_dict=True,
		)

	# --- Клиенты ---
	customers = frappe.db.sql(
		f"""
		SELECT COUNT(DISTINCT customer) AS unique_customers
		FROM `tab{inv}`
		WHERE docstatus = 1 AND posting_date BETWEEN %(from_date)s AND %(to_date)s
			{branch_filter}
		""",
		args,
		as_dict=True,
	)[0]
	customers["unique_customers"] = int(customers["unique_customers"])

	top_customers = frappe.db.sql(
		f"""
		SELECT customer, COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS total
		FROM `tab{inv}`
		WHERE docstatus = 1 AND posting_date BETWEEN %(from_date)s AND %(to_date)s
			{branch_filter}
		GROUP BY customer
		ORDER BY total DESC
		LIMIT 10
		""",
		args,
		as_dict=True,
	)

	# --- Кухня ---
	kitchen = _gather_kitchen(from_date, to_date, branch)

	# --- Топ блюд ---
	items = []
	if frappe.db.table_exists(f"{inv} Item"):
		items = frappe.db.sql(
			f"""
			SELECT i.item_code, i.item_name, SUM(i.qty) AS qty,
			       COALESCE(SUM(i.amount), 0) AS revenue
			FROM `tab{inv} Item` i
			JOIN `tab{inv}` p ON p.name = i.parent
			WHERE p.docstatus = 1 AND p.posting_date BETWEEN %(from_date)s AND %(to_date)s
				{branch_item_filter}
			GROUP BY i.item_code, i.item_name
			ORDER BY revenue DESC
			LIMIT 15
			""",
			args,
			as_dict=True,
		)

	return {
		"period": {"from": str(from_date), "to": str(to_date)},
		"branch": branch,
		"sales": sales,
		"orders_by_type": orders_by_type,
		"customers": customers,
		"top_customers": top_customers,
		"kitchen": kitchen,
		"items": items,
	}


def _gather_kitchen(from_date, to_date, branch=None):
	"""Метрики кухни: KOT, время производства/подачи. Деградирует в нули."""
	kitchen = {"kots": 0, "avg_production_minutes": 0.0, "avg_serve_minutes": 0.0}
	try:
		if not frappe.db.table_exists("URY KOT"):
			return kitchen
		args = {"from_date": from_date, "to_date": to_date}
		branch_filter = "AND branch = %(branch)s" if branch else ""
		if branch:
			args["branch"] = branch
		row = frappe.db.sql(
			f"""
			SELECT COUNT(*) AS kots,
			       AVG(TIMESTAMPDIFF(MINUTE, creation, modified)) AS avg_cycle
			FROM `tabURY KOT`
			WHERE creation >= %(from_date)s AND creation <= DATE_ADD(%(to_date)s, INTERVAL 1 DAY)
				{branch_filter}
			""",
			args,
			as_dict=True,
		)[0]
		if row:
			kitchen["kots"] = int(row.get("kots") or 0)
			kitchen["avg_production_minutes"] = flt(row.get("avg_cycle") or 0)
	except Exception:
		# Кухонные таблицы могут отсутствовать в минимальной установке.
		pass
	return kitchen

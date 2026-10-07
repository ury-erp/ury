"""Сбор данных и формирование текстовых отчётов для Telegram.

Отчёты:
- sales: выручка, число чеков, средний чек за день/период
- customers: уникальные клиенты, топ клиентов
- kitchen: число KOT, среднее время производства, топ блюд
- orders: разбивка по типам заказа
"""

import frappe
from frappe.utils import flt, getdate, nowdate


def _invoices_table():
	return "POS Invoice" if frappe.db.table_exists("POS Invoice") else "Sales Invoice"


def build_report(sections=None, from_date=None, to_date=None, branch=None):
	"""Собрать текст отчёта по выбранным секциям.

	:param sections: list[str] подмножество {"sales","customers","kitchen","orders"}
	:return: str — готовый текст для отправки
	"""
	inv = _invoices_table()
	to_date = to_date or nowdate()
	from_date = from_date or to_date

	branch_filter = ""
	branch_item_filter = ""
	args = {"from_date": from_date, "to_date": to_date}
	if branch:
		branch_filter = "AND branch = %(branch)s"
		branch_item_filter = "AND p.branch = %(branch)s"
		args["branch"] = branch

	sections = sections or ["sales", "customers", "kitchen", "orders"]
	lines = [f"📊 <b>Отчёт {from_date} — {to_date}</b>"]

	if "sales" in sections:
		row = frappe.db.sql(
			f"""
			SELECT COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS total
			FROM `tab{inv}`
			WHERE docstatus = 1 AND posting_date BETWEEN %(from_date)s AND %(to_date)s
				{branch_filter}
			""",
			args, as_dict=True,
		)[0]
		total = flt(row["total"])
		orders = int(row["orders"])
		avg = total / orders if orders else 0
		lines.append("")
		lines.append("<b>💰 Продажи</b>")
		lines.append(f"Выручка: {total:,.2f}")
		lines.append(f"Чеков: {orders}")
		lines.append(f"Средний чек: {avg:,.2f}")

	if "customers" in sections:
		row = frappe.db.sql(
			f"""
			SELECT COUNT(DISTINCT customer) AS uniq
			FROM `tab{inv}`
			WHERE docstatus = 1 AND posting_date BETWEEN %(from_date)s AND %(to_date)s
				{branch_filter}
			""",
			args, as_dict=True,
		)[0]
		top = frappe.db.sql(
			f"""
			SELECT customer, COUNT(*) AS cnt, COALESCE(SUM(grand_total), 0) AS total
			FROM `tab{inv}`
			WHERE docstatus = 1 AND posting_date BETWEEN %(from_date)s AND %(to_date)s
				{branch_filter}
			GROUP BY customer ORDER BY total DESC LIMIT 5
			""",
			args, as_dict=True,
		)
		lines.append("")
		lines.append("<b>👥 Клиенты</b>")
		lines.append(f"Уникальных: {int(row['uniq'])}")
		for t in top:
			lines.append(f"• {t['customer']}: {flt(t['total']):,.0f} ({t['cnt']} чек.)")

	if "kitchen" in sections:
		kitchen = _kitchen_section(from_date, to_date, branch)
		lines.append("")
		lines.append("<b>🍳 Кухня</b>")
		lines.append(f"KOT: {kitchen['kots']}")
		lines.append(f"Среднее время производства: {kitchen['avg_production_minutes']:.0f} мин")

	if "orders" in sections and inv == "POS Invoice":
		rows = frappe.db.sql(
			f"""
			SELECT order_type, COUNT(*) AS cnt, COALESCE(SUM(grand_total), 0) AS total
			FROM `tab{inv}`
			WHERE docstatus = 1 AND posting_date BETWEEN %(from_date)s AND %(to_date)s
				{branch_filter}
			GROUP BY order_type ORDER BY total DESC
			""",
			args, as_dict=True,
		)
		lines.append("")
		lines.append("<b>🧾 Заказы по типам</b>")
		for r in rows:
			lines.append(f"• {r['order_type'] or '—'}: {r['cnt']} ({flt(r['total']):,.0f})")

	return "\n".join(lines)


def _kitchen_section(from_date, to_date, branch=None):
	out = {"kots": 0, "avg_production_minutes": 0.0}
	try:
		if not frappe.db.table_exists("URY KOT"):
			return out
		args = {"from_date": from_date, "to_date": to_date}
		branch_filter = "AND branch = %(branch)s" if branch else ""
		if branch:
			args["branch"] = branch
		row = frappe.db.sql(
			f"""
			SELECT COUNT(*) AS kots,
			       AVG(TIMESTAMPDIFF(MINUTE, creation, modified)) AS avg_cycle
			FROM `tabURY KOT`
			WHERE creation >= %(from_date)s
			  AND creation <= DATE_ADD(%(to_date)s, INTERVAL 1 DAY)
				{branch_filter}
			""",
			args, as_dict=True,
		)[0]
		if row:
			out["kots"] = int(row.get("kots") or 0)
			out["avg_production_minutes"] = flt(row.get("avg_cycle") or 0)
	except Exception:
		pass
	return out

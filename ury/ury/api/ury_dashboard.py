import frappe

from frappe.utils import get_datetime, datetime, add_to_date, today


@frappe.whitelist(methods=["GET"])
def get_dashboard_stats(branch=None):
	cache_key = f"ury_dashboard_stats:{branch}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	if branch:
		result = frappe.db.sql(
			"""
			SELECT
				COUNT(b.`name`) AS total_invoices,
				ROUND(SUM(b.`grand_total`), 2) AS grand_total
			FROM `tabPOS Invoice` b
			LEFT JOIN `tabURY Report Settings` rs ON (rs.`branch` = %(branch)s)
			WHERE
				b.`branch` = %(branch)s
				AND b.`docstatus` = 1
				AND b.`status` IN ("Consolidated", "Paid")
				AND (
					((rs.`hours` IS NULL OR rs.`hours` = 0) AND b.`posting_date` = curdate())
					OR (rs.`hours` > 0 AND TIMESTAMP(b.`posting_date`, b.`posting_time`) <= TIMESTAMP(DATE_ADD(curdate(), INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(b.`posting_date`, b.`posting_time`) >= TIMESTAMP(curdate(), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
					OR (rs.`branch` IS NULL AND b.`posting_date` = curdate())
				)
			""",
			{"branch": branch},
			as_dict=True,
		)[0]
	else:
		result = frappe.db.sql(
			"""
			SELECT
				COUNT(b.`name`) AS total_invoices,
				ROUND(SUM(b.`grand_total`), 2) AS grand_total
			FROM `tabPOS Invoice` b
			LEFT JOIN `tabURY Report Settings` rs ON (rs.`branch` IS NULL)
			WHERE
				b.`docstatus` = 1
				AND b.`status` IN ("Consolidated", "Paid")
				AND (
					((rs.`hours` IS NULL OR rs.`hours` = 0) AND b.`posting_date` = curdate())
					OR (rs.`hours` > 0 AND TIMESTAMP(b.`posting_date`, b.`posting_time`) <= TIMESTAMP(DATE_ADD(curdate(), INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(b.`posting_date`, b.`posting_time`) >= TIMESTAMP(curdate(), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
					OR (rs.`branch` IS NULL AND b.`posting_date` = curdate())
				)
			""",
			{},
			as_dict=True,
		)[0]

	grand_total = result.grand_total or 0
	total_invoices = result.total_invoices or 0
	avg_order_value = round(grand_total / total_invoices, 2) if total_invoices else 0

	if branch:
		occupied_count = frappe.db.count("URY Table", {"branch": branch, "occupied": 1})
		total_count = frappe.db.count("URY Table", {"branch": branch})
	else:
		occupied_count = frappe.db.count("URY Table", {"occupied": 1})
		total_count = frappe.db.count("URY Table", {})

	result_dict = {
		"todays_sales": grand_total,
		"orders_today": total_invoices,
		"avg_order_value": avg_order_value,
		"active_tables": occupied_count,
		"total_tables": total_count,
	}

	frappe.cache().set_value(cache_key, result_dict, expires_in_sec=30)
	return result_dict


@frappe.whitelist(methods=["GET"])
def get_needs_attention(branch=None):
	cache_key = f"ury_dashboard_needs_attention:{branch}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	items = []

	threshold = add_to_date(get_datetime(), minutes=-15)
	pending = frappe.db.sql(
		"""SELECT name, creation FROM `tabPOS Invoice`
		   WHERE docstatus = 0 AND creation < %(threshold)s""" +
		(" AND branch = %(branch)s" if branch else ""),
		{"threshold": threshold, "branch": branch},
		as_dict=True,
	)
	if pending:
		items.append({
			"type": "pending_payment",
			"message": f"{len(pending)} order(s) pending payment for over 15 minutes",
			"severity": "high",
			"reference": None,
		})

	tables = frappe.get_all(
		"URY Table",
		filters={"occupied": 1, "latest_invoice_time": ["<", add_to_date(get_datetime(), minutes=-60)], **({"branch": branch} if branch else {})},
		fields=["name"],
	)
	if tables:
		items.append({
			"type": "table_occupied_long",
			"message": f"{len(tables)} table(s) occupied for over 60 minutes",
			"severity": "medium",
			"reference": None,
		})

	kot_errors = frappe.get_all(
		"URY KOT Error Log",
		filters={"creation": [">", add_to_date(get_datetime(), minutes=-60)]},
		fields=["name"],
	)
	if kot_errors:
		items.append({
			"type": "kot_errors",
			"message": f"{len(kot_errors)} KOT generation issue(s) in the last hour",
			"severity": "high",
			"reference": None,
		})

	stale_sessions = frappe.get_all(
		"POS Opening Entry",
		filters={"status": "Open", "docstatus": 1, "posting_date": ["<", today()]},
		fields=["name"],
	)
	if stale_sessions:
		items.append({
			"type": "unclosed_pos_session",
			"message": f"{len(stale_sessions)} POS session(s) left open from a previous day",
			"severity": "high",
			"reference": None,
		})

	frappe.cache().set_value(cache_key, items, expires_in_sec=30)
	return items

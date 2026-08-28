import frappe

from frappe import _
from frappe.utils import get_datetime, datetime, add_to_date, today

from ury.ury_pos.api import getBranch


def _has_dashboard_cross_branch_access():
	return frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles()


def _validate_comparable_history_access(branch, company):
	if not frappe.has_permission("POS Invoice", "read"):
		frappe.throw(_("Not permitted to read POS Invoice history"), frappe.PermissionError)

	branch_company = frappe.db.get_value("Branch", branch, "company")
	if not branch_company:
		frappe.throw(_("Branch company is required for comparable history"), frappe.PermissionError)

	if branch_company != company:
		frappe.throw(_("Not permitted to read history for this branch and company"), frappe.PermissionError)

	if _has_dashboard_cross_branch_access():
		return

	if getBranch() != branch:
		frappe.throw(_("Not permitted to read history for this branch"), frappe.PermissionError)


@frappe.whitelist(methods=["GET"])
def get_comparable_weekday_history(plan_date, branch, company=None, items=None):
	"""Return net fulfilled item quantities for prior matching weekdays.

	company is server-derived from branch when the caller omits it (the
	frontend branch context has no company field to send); a client-supplied
	company is still validated against the branch, matching the fail-closed
	server-derives-scope pattern used elsewhere in the V3 codebase.
	"""
	if not plan_date or not branch:
		frappe.throw("plan_date and branch are required", frappe.ValidationError)

	if not company:
		company = frappe.db.get_value("Branch", branch, "company")

	if not company:
		frappe.throw("Branch company is required for comparable history", frappe.PermissionError)

	_validate_comparable_history_access(branch, company)

	item_codes = frappe.parse_json(items) if isinstance(items, str) else (items or [])
	params = {"plan_date": plan_date, "branch": branch, "company": company}
	item_filter = ""
	if item_codes:
		item_filter = " AND pii.item_code IN %(items)s"
		params["items"] = tuple(item_codes)

	rows = frappe.db.sql(
		f"""
		SELECT
			pii.item_code,
			pi.posting_date,
			SUM(CASE WHEN pi.is_return = 1 THEN -ABS(pii.qty) ELSE pii.qty END) AS net_qty
		FROM `tabPOS Invoice Item` pii
		INNER JOIN `tabPOS Invoice` pi ON pi.name = pii.parent
		WHERE pi.docstatus = 1
			AND pi.status IN ('Consolidated', 'Paid')
			AND pi.branch = %(branch)s
			AND pi.company = %(company)s
			AND pi.posting_date < %(plan_date)s
			AND WEEKDAY(pi.posting_date) = WEEKDAY(%(plan_date)s)
			{item_filter}
		GROUP BY pii.item_code, pi.posting_date
		ORDER BY pi.posting_date, pii.item_code
		""",
		params,
		as_dict=True,
	)

	return rows


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
	shift_start = today()
	pending = frappe.db.sql(
		"""SELECT name, creation FROM `tabPOS Invoice`
		   WHERE docstatus = 0 AND creation < %(threshold)s AND creation >= %(shift_start)s""" +
		(" AND branch = %(branch)s" if branch else ""),
		{"threshold": threshold, "shift_start": shift_start, "branch": branch},
		as_dict=True,
	)
	if pending:
		items.append({
			"type": "pending_payment",
			"message": f"{len(pending)} order(s) pending payment for over 15 minutes",
			"severity": "high",
			"reference": {
				"doctype": "POS Invoice",
				"names": [row["name"] for row in pending],
			},
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
			"reference": {
				"doctype": "URY Table",
				"names": [row["name"] for row in tables],
			},
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
			"reference": {
				"doctype": "URY KOT Error Log",
				"names": [row["name"] for row in kot_errors],
			},
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
			"reference": {
				"doctype": "POS Opening Entry",
				"names": [row["name"] for row in stale_sessions],
			},
		})

	frappe.cache().set_value(cache_key, items, expires_in_sec=30)
	return items


def _business_day_bounds(branch):
	rs_hours = frappe.db.get_value("URY Report Settings", {"branch": branch}, "hours") if branch else None
	now = get_datetime()
	if rs_hours:
		cutoff_today = get_datetime(f"{today()} {str(rs_hours).zfill(2)}:00:00")
		if now < cutoff_today:
			start = add_to_date(cutoff_today, days=-1)
			end = cutoff_today
		else:
			start = cutoff_today
			end = add_to_date(cutoff_today, days=1)
	else:
		start = get_datetime(f"{today()} 00:00:00")
		end = add_to_date(start, days=1)
	return start, end


@frappe.whitelist(methods=["GET"])
def get_shift_metrics(branch=None):
	cache_key = f"ury_dashboard_shift_metrics:{branch}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	start, end = _business_day_bounds(branch)

	conditions = "b.`docstatus` = 1 AND b.`status` IN ('Consolidated', 'Paid') AND TIMESTAMP(b.`posting_date`, b.`posting_time`) BETWEEN %(start)s AND %(end)s"
	params = {"start": start, "end": end}
	if branch:
		conditions += " AND b.`branch` = %(branch)s"
		params["branch"] = branch

	row = frappe.db.sql(
		f"""
		SELECT
			COUNT(b.`name`) AS invoice_count,
			ROUND(SUM(b.`grand_total`), 2) AS sales,
			SUM(b.`no_of_pax`) AS covers
		FROM `tabPOS Invoice` b
		WHERE {conditions}
		""",
		params,
		as_dict=True,
	)[0]

	sales = row.sales or 0
	covers = row.covers or 0
	avg_per_cover = round(sales / covers, 2) if covers else 0

	kot_conditions = "k.`start_time_prep` IS NOT NULL AND k.`start_time_serv` IS NOT NULL AND k.`creation` BETWEEN %(start)s AND %(end)s"
	kot_params = {"start": start, "end": end}
	if branch:
		kot_conditions += " AND k.`branch` = %(branch)s"
		kot_params["branch"] = branch

	ticket_row = frappe.db.sql(
		f"""
		SELECT AVG(TIMESTAMPDIFF(MINUTE, k.`start_time_prep`, k.`start_time_serv`)) AS avg_ticket_minutes
		FROM `tabURY KOT` k
		WHERE {kot_conditions}
		""",
		kot_params,
		as_dict=True,
	)[0]

	result = {
		"sales": sales,
		"covers": covers,
		"avg_per_cover": avg_per_cover,
		"avg_ticket_minutes": round(ticket_row.avg_ticket_minutes, 1) if ticket_row.avg_ticket_minutes else None,
	}

	frappe.cache().set_value(cache_key, result, expires_in_sec=60)
	return result


@frappe.whitelist(methods=["GET"])
def get_baseline(branch=None, weeks=6):
	weekday = get_datetime().weekday()
	hour = get_datetime().hour
	cache_key = f"ury_dashboard_baseline:{branch}:{weekday}:{hour}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	conditions = """
		b.`docstatus` = 1
		AND b.`status` IN ('Consolidated', 'Paid')
		AND WEEKDAY(b.`posting_date`) = %(weekday)s
		AND HOUR(b.`posting_time`) BETWEEN %(hour_low)s AND %(hour_high)s
		AND b.`posting_date` >= DATE_SUB(CURDATE(), INTERVAL %(weeks)s WEEK)
		AND b.`posting_date` < CURDATE()
	"""
	params = {
		"weekday": weekday,
		"hour_low": max(hour - 1, 0),
		"hour_high": min(hour + 1, 23),
		"weeks": weeks,
	}
	if branch:
		conditions += " AND b.`branch` = %(branch)s"
		params["branch"] = branch

	rows = frappe.db.sql(
		f"""
		SELECT b.`posting_date` AS d, SUM(b.`grand_total`) AS sales, COUNT(b.`name`) AS covers
		FROM `tabPOS Invoice` b
		WHERE {conditions}
		GROUP BY b.`posting_date`
		ORDER BY b.`posting_date`
		""",
		params,
		as_dict=True,
	)

	sales_values = sorted([r.sales or 0 for r in rows])
	covers_values = sorted([r.covers or 0 for r in rows])

	def median(values):
		n = len(values)
		if not n:
			return 0
		mid = n // 2
		if n % 2:
			return values[mid]
		return round((values[mid - 1] + values[mid]) / 2, 2)

	result = {
		"sample_days": len(rows),
		"median_sales": median(sales_values),
		"median_covers": median(covers_values),
	}

	frappe.cache().set_value(cache_key, result, expires_in_sec=300)
	return result


@frappe.whitelist(methods=["GET"])
def get_floor_load(branch=None):
	cache_key = f"ury_dashboard_floor_load:{branch}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	conditions = "t.`occupied` = 1 AND i.`waiter` IS NOT NULL AND i.`waiter` != ''"
	params = {}
	if branch:
		conditions += " AND t.`branch` = %(branch)s"
		params["branch"] = branch

	rows = frappe.db.sql(
		f"""
		SELECT i.`waiter` AS waiter, COUNT(DISTINCT t.`name`) AS table_count
		FROM `tabURY Table` t
		JOIN `tabPOS Invoice` i ON (
			i.`restaurant_table` = t.`name`
			AND i.`docstatus` = 0
			AND i.`creation` = (
				SELECT MAX(i2.`creation`) FROM `tabPOS Invoice` i2
				WHERE i2.`restaurant_table` = t.`name` AND i2.`docstatus` = 0
			)
		)
		WHERE {conditions}
		GROUP BY i.`waiter`
		ORDER BY table_count DESC
		""",
		params,
		as_dict=True,
	)

	frappe.cache().set_value(cache_key, rows, expires_in_sec=30)
	return rows

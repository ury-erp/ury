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
	shift_start, shift_end = _business_day_bounds(branch)
	pending = frappe.db.sql(
		"""SELECT name, creation FROM `tabPOS Invoice`
		   WHERE docstatus = 0 AND creation < %(threshold)s
		   AND creation >= %(shift_start)s AND creation < %(shift_end)s""" +
		(" AND branch = %(branch)s" if branch else ""),
		{"threshold": threshold, "shift_start": shift_start, "shift_end": shift_end, "branch": branch},
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
def get_baseline_comparison(branch=None, window="today", weeks=6):
	"""Compare the current business-day-so-far sales/covers against a 6-week
	rolling baseline for the same weekday and time-of-day window (the
	"tonight vs a normal Tuesday" dashboard strip). `window` is currently
	informational (always compares business-day-start through now); accepted
	as a param so the frontend contract doesn't need to change if narrower
	windows are added later.
	"""
	weeks = int(weeks)
	cache_key = f"ury_dashboard_baseline_comparison:{branch}:{window}:{weeks}"
	cached = frappe.cache().get_value(cache_key)
	if cached:
		return cached

	start, end = _business_day_bounds(branch)
	now = get_datetime()
	elapsed_end = min(now, end)

	conditions = "b.`docstatus` = 1 AND b.`status` IN ('Consolidated', 'Paid') AND TIMESTAMP(b.`posting_date`, b.`posting_time`) BETWEEN %(start)s AND %(end)s"
	params = {"start": start, "end": elapsed_end}
	if branch:
		conditions += " AND b.`branch` = %(branch)s"
		params["branch"] = branch

	current_row = frappe.db.sql(
		f"""
		SELECT ROUND(SUM(b.`grand_total`), 2) AS sales, SUM(b.`no_of_pax`) AS covers
		FROM `tabPOS Invoice` b
		WHERE {conditions}
		""",
		params,
		as_dict=True,
	)[0]

	current_sales = current_row.sales or 0
	current_covers = current_row.covers or 0

	# The comparison must be business-day aligned, not calendar-date aligned:
	# with extended hours the business day starts at e.g. 06:00, so a single
	# trading night spans two `posting_date` values and "now" can be 01:30 on
	# the following calendar date. Shifting every invoice timestamp back by
	# the business-day start offset gives (a) the business date it belongs to
	# and (b) how many seconds into the shift it happened — both of which are
	# then directly comparable to today's elapsed window. Grouping on raw
	# posting_date instead would split each historical night in two and drop
	# the after-midnight half entirely (its calendar weekday differs).
	business_date = start.date()
	weekday = start.weekday()
	offset_seconds = start.hour * 3600 + start.minute * 60 + start.second
	elapsed_seconds = max(int((elapsed_end - start).total_seconds()), 0)

	shifted = "(TIMESTAMP(b.`posting_date`, b.`posting_time`) - INTERVAL %(offset_seconds)s SECOND)"

	baseline_conditions = f"""
		b.`docstatus` = 1
		AND b.`status` IN ('Consolidated', 'Paid')
		AND WEEKDAY(DATE({shifted})) = %(weekday)s
		AND DATE({shifted}) >= DATE_SUB(%(business_date)s, INTERVAL %(weeks)s WEEK)
		AND DATE({shifted}) < %(business_date)s
		AND TIME_TO_SEC(TIME({shifted})) <= %(elapsed_seconds)s
	"""
	baseline_params = {
		"weekday": weekday,
		"business_date": business_date,
		"weeks": weeks,
		"offset_seconds": offset_seconds,
		"elapsed_seconds": elapsed_seconds,
	}
	if branch:
		baseline_conditions += " AND b.`branch` = %(branch)s"
		baseline_params["branch"] = branch

	rows = frappe.db.sql(
		f"""
		SELECT DATE({shifted}) AS d, SUM(b.`grand_total`) AS sales, SUM(b.`no_of_pax`) AS covers
		FROM `tabPOS Invoice` b
		WHERE {baseline_conditions}
		GROUP BY d
		ORDER BY d DESC
		LIMIT %(weeks)s
		""",
		baseline_params,
		as_dict=True,
	)

	sample_days = len(rows)
	avg_sales = round(sum(r.sales or 0 for r in rows) / sample_days, 2) if sample_days else 0
	avg_covers = round(sum(r.covers or 0 for r in rows) / sample_days, 1) if sample_days else 0

	def pct_delta(current, baseline):
		if not baseline:
			return None
		return round((current - baseline) / baseline * 100, 1)

	result = {
		"window": window,
		"sample_days": sample_days,
		"current": {"sales": current_sales, "covers": current_covers},
		"baseline": {"sales": avg_sales, "covers": avg_covers},
		"delta": {
			"sales": round(current_sales - avg_sales, 2),
			"covers": round(current_covers - avg_covers, 1),
			"sales_pct": pct_delta(current_sales, avg_sales),
			"covers_pct": pct_delta(current_covers, avg_covers),
		},
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

import frappe

from ury.ury.report_api.utils import (
	date_list_cte,
	get_business_day_condition,
	get_business_day_range_condition,
	report_settings_join,
	require_manager,
	validate_date_range,
)


@frappe.whitelist()
def get_today_sales(branch=None, date=None):
	"""Live sales snapshot for a single business day.

	Mirrors the existing "Today's Sales" Query Report, extended with:
	- an optional `date` param so the same endpoint serves both "today"
	  (the default) and a historical single-day lookup from the date picker
	- an optional `branch` — omitted/None means "All Branches", matching the
	  global branch selector already in the dashboard header. All-branches
	  mode intentionally uses plain calendar-day boundaries rather than each
	  branch's own extended-hours offset: correctly honoring N different
	  per-branch hour offsets in one aggregate query is not worth the
	  complexity when the user hasn't chosen to look at one specific branch.
	"""
	require_manager()

	target_date = frappe.utils.getdate(date) if date else frappe.utils.today()

	if branch:
		condition = get_business_day_condition(date_expr="%(target_date)s")
		join = report_settings_join()
		params = {"branch": branch, "target_date": target_date}
		branch_filter = "b.`branch` = %(branch)s AND"
	else:
		condition = "b.`posting_date` = %(target_date)s"
		join = ""
		params = {"target_date": target_date}
		branch_filter = ""

	row = frappe.db.sql(
		f"""
		SELECT
			COUNT(b.`name`) AS total_invoices,
			ROUND(SUM(b.`net_total`), 2) AS item_total,
			ROUND(SUM(b.`total_taxes_and_charges`), 2) AS total_taxes_and_charges,
			ROUND(SUM(b.`grand_total`), 2) AS grand_total,
			ROUND(SUM(b.`grand_total` - b.`rounded_total`), 2) AS round_off,
			ROUND(SUM(b.`rounded_total` - b.`paid_amount` + b.`change_amount`), 2) AS cash_discounts
		FROM `tabPOS Invoice` b
		{join}
		WHERE
			{branch_filter}
			b.`docstatus` = 1
			AND b.`status` IN ("Consolidated", "Paid")
			AND {condition}
		""",
		params,
		as_dict=True,
	)

	data = row[0] if row else {}
	# SUM() over zero matching rows returns NULL, not 0 — normalize so the
	# frontend never has to special-case "no invoices today" vs "an error".
	for key in (
		"total_invoices",
		"item_total",
		"total_taxes_and_charges",
		"grand_total",
		"round_off",
		"cash_discounts",
	):
		data[key] = data.get(key) or 0

	return {
		"branch": branch,
		"query_date": str(target_date),
		"day_of_week": frappe.utils.formatdate(target_date, "EEEE"),
		**data,
		"last_updated_at": frappe.utils.now(),
	}


@frappe.whitelist()
def get_daywise_sales(start_date, end_date, branch=None):
	"""Per-day sales trend across a date range.

	Mirrors the existing "Daywise Sales" Query Report. `branch` optional —
	omitted means "All Branches" (plain calendar-day boundaries, same
	simplification as get_today_sales's all-branches mode).
	"""
	require_manager()
	validate_date_range(start_date, end_date)

	date_list = date_list_cte()

	if branch:
		condition = get_business_day_condition(date_expr="date_list.`date`")
		join = report_settings_join()
		params = {"branch": branch, "start_date": start_date, "end_date": end_date}
		invoice_join = "b.`branch` = %(branch)s AND b.`status` IN (\"Consolidated\", \"Paid\") AND b.`docstatus` = 1"
	else:
		condition = "b.`posting_date` = date_list.`date`"
		join = ""
		params = {"start_date": start_date, "end_date": end_date}
		invoice_join = "b.`status` IN (\"Consolidated\", \"Paid\") AND b.`docstatus` = 1"

	rows = frappe.db.sql(
		f"""
		SELECT
			date_list.`date` AS date,
			COUNT(b.`name`) AS total_invoices,
			ROUND(SUM(b.`net_total`), 2) AS item_total,
			ROUND(SUM(b.`total_taxes_and_charges`), 2) AS total_taxes,
			ROUND(SUM(b.`grand_total`), 2) AS grand_total,
			ROUND(SUM(b.`grand_total` - b.`rounded_total`), 2) AS round_off,
			ROUND(SUM(b.`rounded_total` - b.`paid_amount` + b.`change_amount`), 2) AS cash_discount
		FROM {date_list}
		LEFT JOIN `tabPOS Invoice` b ON ({invoice_join})
		{join}
		WHERE {condition}
		GROUP BY date_list.`date`
		ORDER BY date_list.`date` ASC
		""",
		params,
		as_dict=True,
	)

	numeric_keys = ("total_invoices", "item_total", "total_taxes", "grand_total", "round_off", "cash_discount")
	for r in rows:
		r["date"] = str(r["date"])
		for key in numeric_keys:
			r[key] = r.get(key) or 0

	period_total = round(sum(r["grand_total"] for r in rows), 2)
	total_invoices = sum(r["total_invoices"] for r in rows)
	peak = max(rows, key=lambda r: r["grand_total"], default=None)

	return {
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"rows": rows,
		"summary": {
			"period_total": period_total,
			"period_avg_daily": round(period_total / len(rows), 2) if rows else 0,
			"total_invoices": total_invoices,
			"peak_day": peak["date"] if peak else None,
			"peak_day_total": peak["grand_total"] if peak else 0,
		},
	}


@frappe.whitelist()
def get_daywise_invoices(start_date, end_date, branch=None, page=1, page_size=50):
	"""Paginated invoice-level detail across a date range.

	Mirrors the existing "Daywise Invoices" Query Report, including its
	Aggregators handling (received/change amounts zeroed for aggregator
	orders since the aggregator platform — not the till — holds the cash)
	and its per-invoice payment-mode breakdown via Sales Invoice Payment.
	Adds real pagination since this report's row count (one row per invoice)
	is unbounded across a range, unlike Wave 1's other per-day/per-bucket
	reports.
	"""
	require_manager()
	validate_date_range(start_date, end_date)

	page = int(page)
	page_size = min(int(page_size), 200)
	offset = (page - 1) * page_size

	params = {"start_date": start_date, "end_date": end_date, "limit": page_size, "offset": offset}

	if branch:
		condition = get_business_day_range_condition()
		join = report_settings_join()
		params["branch"] = branch
		branch_filter = "b.`branch` = %(branch)s AND"
	else:
		# All-branches mode: plain calendar-date range, same simplification as
		# get_today_sales/get_daywise_sales (no single extended-hours offset
		# applies across multiple branches at once).
		condition = "b.`posting_date` BETWEEN %(start_date)s AND %(end_date)s"
		join = ""
		branch_filter = ""

	base_where = f"""
		{branch_filter}
		b.`docstatus` = 1
		AND b.`status` IN ("Consolidated", "Paid")
		AND {condition}
	"""

	total_count = frappe.db.sql(
		f"""
		SELECT COUNT(*) AS total
		FROM `tabPOS Invoice` b
		{join}
		WHERE {base_where}
		""",
		params,
		as_dict=True,
	)[0]["total"]

	rows = frappe.db.sql(
		f"""
		SELECT
			b.`posting_date` AS date,
			CONCAT(
				LPAD(IF(HOUR(b.`posting_time`) > 12, HOUR(b.`posting_time`) - 12, HOUR(b.`posting_time`)), 2, '0'),
				':',
				SUBSTRING_INDEX(SUBSTRING_INDEX(b.`posting_time`, ':', 2), ':', -1),
				CASE WHEN HOUR(b.`posting_time`) >= 12 THEN ' PM' ELSE ' AM' END
			) AS time,
			b.`name` AS invoice,
			b.`net_total` AS item_total,
			b.`total_taxes_and_charges` AS total_taxes,
			b.`grand_total` AS grand_total,
			(b.`grand_total` - b.`rounded_total`) AS round_off,
			b.`rounded_total` AS rounded_total,
			CASE WHEN b.`customer_group` = 'Aggregators' THEN 0 ELSE b.`paid_amount` END AS received_amount,
			CASE WHEN b.`customer_group` = 'Aggregators' THEN 0 ELSE b.`change_amount` END AS change_amount,
			IFNULL(
				CASE
					WHEN b.`rounded_total` > 0 THEN (b.`rounded_total` - b.`paid_amount` + b.`change_amount`)
					ELSE (b.`grand_total` - b.`paid_amount` + b.`change_amount`)
				END,
				0
			) AS cash_discounts,
			GROUP_CONCAT(
				CASE WHEN c.`amount` != 0 THEN c.`mode_of_payment` END
				ORDER BY c.`amount`
				SEPARATOR ', '
			) AS payment_mode
		FROM `tabPOS Invoice` b
		LEFT JOIN `tabSales Invoice Payment` c ON (c.`parent` = b.`name`)
		{join}
		WHERE {base_where}
		GROUP BY b.`name`
		ORDER BY b.`posting_date` ASC, b.`posting_time` ASC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		params,
		as_dict=True,
	)

	for r in rows:
		r["date"] = str(r["date"])

	return {
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"invoices": rows,
		"pagination": {
			"page": page,
			"page_size": page_size,
			"total": total_count,
			"total_pages": (total_count + page_size - 1) // page_size if total_count else 0,
		},
	}


@frappe.whitelist()
def get_month_wise_sales(branch=None, months_back=6):
	"""Monthly sales rollup over a trailing window.

	Mirrors the existing "Month Wise Sales" Query Report, but replaces its
	hardcoded 4-month lookback with a configurable `months_back` (default 6)
	— the single biggest improvement flagged by research: a fixed window
	forced re-running the old report or editing SQL to see more history.
	"""
	require_manager()
	months_back = min(int(months_back), 24)

	start_date = frappe.utils.add_months(frappe.utils.get_first_day(frappe.utils.today()), -months_back)
	end_date = frappe.utils.today()

	date_list = date_list_cte()

	if branch:
		condition = get_business_day_condition(date_expr="date_list.`date`")
		join = report_settings_join()
		params = {"branch": branch, "start_date": start_date, "end_date": end_date}
		invoice_join = "b.`branch` = %(branch)s AND b.`status` IN (\"Consolidated\", \"Paid\") AND b.`docstatus` = 1"
	else:
		condition = "b.`posting_date` = date_list.`date`"
		join = ""
		params = {"start_date": start_date, "end_date": end_date}
		invoice_join = "b.`status` IN (\"Consolidated\", \"Paid\") AND b.`docstatus` = 1"

	rows = frappe.db.sql(
		f"""
		SELECT
			YEAR(date_list.`date`) AS year,
			MONTH(date_list.`date`) AS month_number,
			MONTHNAME(date_list.`date`) AS month_name,
			ROUND(SUM(b.`net_total`), 2) AS item_total,
			ROUND(SUM(b.`total_taxes_and_charges`), 2) AS taxes,
			ROUND(SUM(b.`grand_total`), 2) AS grand_total
		FROM {date_list}
		LEFT JOIN `tabPOS Invoice` b ON ({invoice_join})
		{join}
		WHERE {condition}
		GROUP BY YEAR(date_list.`date`), MONTH(date_list.`date`)
		ORDER BY YEAR(date_list.`date`) ASC, MONTH(date_list.`date`) ASC
		""",
		params,
		as_dict=True,
	)

	prev_total = None
	for r in rows:
		for key in ("item_total", "taxes", "grand_total"):
			r[key] = r.get(key) or 0
		r["month"] = f"{r['month_name']} {r['year']}"
		r["growth_percentage"] = (
			round(((r["grand_total"] - prev_total) / prev_total) * 100, 1) if prev_total else None
		)
		prev_total = r["grand_total"]

	grand_totals = [r["grand_total"] for r in rows]
	total_revenue = round(sum(grand_totals), 2)
	best = max(rows, key=lambda r: r["grand_total"], default=None)
	worst = min(rows, key=lambda r: r["grand_total"], default=None)

	return {
		"branch": branch,
		"months_back": months_back,
		"data": rows,
		"summary": {
			"total_revenue": total_revenue,
			"average_monthly_revenue": round(total_revenue / len(rows), 2) if rows else 0,
			"best_month": best["month"] if best else None,
			"worst_month": worst["month"] if worst else None,
		},
	}


def _format_hour_label(hour):
	"""12-hour clock label for a 0-23 hour, e.g. 0 -> '12 AM', 14 -> '02 PM'."""
	hour = hour % 24
	period = "AM" if hour < 12 else "PM"
	display = hour % 12 or 12
	return f"{display:02d} {period}"


@frappe.whitelist()
def get_time_wise_sales(branch=None, date=None, bucket_size_hours=2):
	"""Sales and bill volume by time-of-day bucket for a single day.

	Mirrors the existing "Time Wise Sales" Query Report, but with a
	configurable bucket size (1/2/4 hours, default 2) instead of a hardcoded
	set of 12 fixed 2-hour buckets — the main improvement flagged by
	research. Buckets computed in Python (not dynamic SQL) since row counts
	for a single day are small and this keeps arbitrary bucket sizes simple.
	No extended-hours logic — the existing report doesn't apply it here
	either (single calendar date only), which also means, unlike the other
	Wave 1 reports, `branch` can genuinely be omitted for an All-Branches
	aggregate without any simplifying compromise.
	"""
	require_manager()

	bucket_size_hours = int(bucket_size_hours)
	if bucket_size_hours not in (1, 2, 4):
		frappe.throw("bucket_size_hours must be 1, 2, or 4.")

	target_date = frappe.utils.getdate(date) if date else frappe.utils.today()
	num_buckets = 24 // bucket_size_hours

	params = {"target_date": target_date}
	branch_filter = ""
	if branch:
		params["branch"] = branch
		branch_filter = "AND `branch` = %(branch)s"

	rows = frappe.db.sql(
		f"""
		SELECT `posting_time` AS posting_time, `grand_total` AS grand_total
		FROM `tabPOS Invoice`
		WHERE `posting_date` = %(target_date)s
			{branch_filter}
			AND `docstatus` = 1
			AND `status` IN ("Consolidated", "Paid")
		""",
		params,
		as_dict=True,
	)

	buckets = [{"sales": 0.0, "bills": 0} for _ in range(num_buckets)]
	for r in rows:
		posting_time = r["posting_time"]
		# frappe.db.sql returns Time-fieldtype columns as datetime.timedelta.
		hour = int(posting_time.total_seconds() // 3600) if hasattr(posting_time, "total_seconds") else int(
			str(posting_time).split(":")[0]
		)
		bucket_index = min(hour // bucket_size_hours, num_buckets - 1)
		buckets[bucket_index]["sales"] += float(r["grand_total"] or 0)
		buckets[bucket_index]["bills"] += 1

	total_sales = round(sum(b["sales"] for b in buckets), 2)
	total_bills = sum(b["bills"] for b in buckets)

	intervals = []
	for i, b in enumerate(buckets):
		start_hour = i * bucket_size_hours
		end_hour = start_hour + bucket_size_hours
		sales = round(b["sales"], 2)
		intervals.append(
			{
				"interval_label": f"{_format_hour_label(start_hour)} - {_format_hour_label(end_hour)}",
				"start_hour": start_hour,
				"end_hour": end_hour,
				"sales": sales,
				"bills": b["bills"],
				"pct_of_daily_total": round((sales / total_sales) * 100, 1) if total_sales else 0,
				"avg_transaction_value": round(sales / b["bills"], 2) if b["bills"] else 0,
			}
		)

	peak = max(intervals, key=lambda x: x["sales"], default=None)

	return {
		"branch": branch,
		"date": str(target_date),
		"bucket_size_hours": bucket_size_hours,
		"intervals": intervals,
		"summary": {
			"total_sales": total_sales,
			"total_bills": total_bills,
			"avg_sale_per_bill": round(total_sales / total_bills, 2) if total_bills else 0,
			"peak_interval": peak["interval_label"] if peak else None,
			"peak_interval_sales": peak["sales"] if peak else 0,
		},
	}

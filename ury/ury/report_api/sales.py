import frappe

from ury.ury.report_api.utils import (
	date_list_cte,
	get_business_day_condition,
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

import frappe

from ury.ury.report_api.utils import get_business_day_condition, report_settings_join, require_manager


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
		condition = get_business_day_condition(date_param="target_date")
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

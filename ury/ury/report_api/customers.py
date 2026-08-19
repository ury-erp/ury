import frappe

from ury.ury.report_api.utils import (
	date_list_cte,
	get_business_day_condition,
	get_business_day_range_condition,
	get_prior_business_day_condition,
	report_settings_join,
	require_manager,
	validate_date_range,
)


@frappe.whitelist()
def search_customers(query, limit=10):
	"""Autocomplete search backing the Customer Data report's customer
	picker. Returns Customer link name + display name + mobile so the
	frontend can show a disambiguating preview (multiple customers can
	share a display name).
	"""
	require_manager()

	if not query or len(query) < 2:
		return []

	limit = min(int(limit), 25)

	return frappe.get_list(
		"Customer",
		filters=[["customer_name", "like", f"%{query}%"]],
		fields=["name", "customer_name", "mobile_no"],
		limit=limit,
		order_by="customer_name asc",
	)


@frappe.whitelist()
def get_customer_data(customer, start_date, end_date, branch=None, page=1, page_size=50):
	"""Single-customer transaction history + summary over a date range.

	Mirrors the existing "Customer Data" Query Report, which matches on
	`POS Invoice.customer_name` (a denormalized text field on the invoice,
	not a Link to Customer) — kept as-is here for behavioral parity with
	the legacy report and because that's what's actually indexed/queried
	today; `customer` is expected to be a customer_name string (as returned
	by search_customers above).
	"""
	require_manager()
	validate_date_range(start_date, end_date)

	if not customer:
		frappe.throw("customer is required.")

	page = max(1, int(page))
	page_size = max(1, min(int(page_size), 200))
	offset = (page - 1) * page_size

	params = {
		"customer": customer,
		"start_date": start_date,
		"end_date": end_date,
		"limit": page_size,
		"offset": offset,
	}

	if branch:
		condition = get_business_day_range_condition()
		join = report_settings_join()
		params["branch"] = branch
		branch_filter = "b.`branch` = %(branch)s AND"
	else:
		condition = "b.`posting_date` BETWEEN %(start_date)s AND %(end_date)s"
		join = ""
		branch_filter = ""

	base_where = f"""
		{branch_filter}
		b.`customer_name` = %(customer)s
		AND b.`docstatus` = 1
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

	summary_row = frappe.db.sql(
		f"""
		SELECT
			COUNT(*) AS visit_count,
			ROUND(SUM(b.`grand_total`), 2) AS total_spend,
			MAX(b.`posting_date`) AS last_purchase_date,
			MAX(b.`mobile_number`) AS mobile_number
		FROM `tabPOS Invoice` b
		{join}
		WHERE {base_where}
		""",
		params,
		as_dict=True,
	)[0]

	rows = frappe.db.sql(
		f"""
		SELECT
			b.`posting_date` AS date,
			b.`name` AS invoice,
			b.`grand_total` AS amount
		FROM `tabPOS Invoice` b
		{join}
		WHERE {base_where}
		ORDER BY b.`posting_date` DESC, b.`posting_time` DESC
		LIMIT %(limit)s OFFSET %(offset)s
		""",
		params,
		as_dict=True,
	)

	for r in rows:
		r["date"] = str(r["date"])
		r["amount"] = r["amount"] or 0

	visit_count = summary_row["visit_count"] or 0
	total_spend = summary_row["total_spend"] or 0

	return {
		"customer": customer,
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"invoices": rows,
		"summary": {
			"customer_name": customer,
			"mobile_number": summary_row["mobile_number"],
			"visit_count": visit_count,
			"total_spend": total_spend,
			"avg_spend": round(total_spend / visit_count, 2) if visit_count else 0,
			"last_purchase_date": str(summary_row["last_purchase_date"]) if summary_row["last_purchase_date"] else None,
		},
		"pagination": {
			"page": page,
			"page_size": page_size,
			"total": total_count,
			"total_pages": (total_count + page_size - 1) // page_size if total_count else 0,
		},
	}


@frappe.whitelist()
def get_daywise_customer_details(start_date, end_date, branch=None):
	"""Contact list of every distinct customer who visited within a date
	range — primarily a marketing/outreach export.

	Mirrors the existing "Daywise Customer Details" Query Report, extended
	with visit_count/first_visit/last_visit (the report's own de-dup-only
	shape discarded frequency data the research brief flagged as valuable
	and effectively free to compute alongside the existing GROUP BY). Shares
	its date-range/business-day condition shape with get_repeated_customers
	below, since both derive from the same underlying customer-visit data.
	"""
	require_manager()
	validate_date_range(start_date, end_date)

	if branch:
		condition = get_business_day_range_condition()
		join = report_settings_join()
		params = {"branch": branch, "start_date": start_date, "end_date": end_date}
		invoice_join = "b.`branch` = %(branch)s AND b.`status` IN (\"Consolidated\", \"Paid\") AND b.`docstatus` = 1"
	else:
		condition = "b.`posting_date` BETWEEN %(start_date)s AND %(end_date)s"
		join = ""
		params = {"start_date": start_date, "end_date": end_date}
		invoice_join = "b.`status` IN (\"Consolidated\", \"Paid\") AND b.`docstatus` = 1"

	rows = frappe.db.sql(
		f"""
		SELECT
			b.`customer` AS customer_id,
			b.`customer_name` AS customer_name,
			b.`mobile_number` AS mobile_number,
			COUNT(b.`name`) AS visit_count,
			MIN(b.`posting_date`) AS first_visit,
			MAX(b.`posting_date`) AS last_visit
		FROM `tabPOS Invoice` b
		{join}
		WHERE {invoice_join} AND {condition}
		GROUP BY b.`customer`
		ORDER BY b.`customer_name` ASC
		""",
		params,
		as_dict=True,
	)

	for r in rows:
		r["first_visit"] = str(r["first_visit"])
		r["last_visit"] = str(r["last_visit"])

	return {
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"customers": rows,
		"total_count": len(rows),
	}


@frappe.whitelist()
def get_repeated_customers(start_date, end_date, branch=None):
	"""Daily new-vs-repeat customer visit counts and repeat rate.

	Mirrors the existing "Repeated Customers" Query Report. "New" means
	lifetime-first-visit (no prior POS Invoice at all before this date), not
	first-visit-within-the-selected-range — preserved as-is from the legacy
	report rather than silently redefined, since that would change the
	numbers for anyone comparing against historical reports. "Total
	Customers" counts visits (invoices with a customer), not distinct
	customers per day, matching the original report's semantics exactly.

	All-branches mode simplifies the NOT EXISTS lifetime-visit lookback to
	plain calendar-date comparison (same tradeoff as every other Wave 1/2
	report's all-branches mode) rather than per-branch extended-hours
	boundaries, since mixing N different branches' hour offsets into one
	"was this customer here before" check has no single correct answer.
	"""
	require_manager()
	validate_date_range(start_date, end_date)

	date_list = date_list_cte()

	if branch:
		day_condition = get_business_day_condition(date_expr="date_list.`date`", prefix="d")
		# prior_condition's correlated subquery (alias c) intentionally reuses
		# `rs` from this outer join rather than joining Report Settings again
		# inside the subquery — branch is fixed for this whole query (we're
		# inside `if branch:`), so "this branch's hours setting" is the same
		# constant for both the day_condition and the prior-visit check.
		prior_condition = get_prior_business_day_condition(date_expr="date_list.`date`", prefix="c")
		join = report_settings_join(prefix="d")
		params = {"branch": branch, "start_date": start_date, "end_date": end_date}
		invoice_filter = "d.`branch` = %(branch)s AND d.`status` IN (\"Consolidated\", \"Paid\") AND d.`docstatus` = 1"
		prior_branch_filter = "AND c.`branch` = %(branch)s"
	else:
		day_condition = "d.`posting_date` = date_list.`date`"
		prior_condition = "c.`posting_date` < date_list.`date`"
		join = ""
		params = {"start_date": start_date, "end_date": end_date}
		invoice_filter = "d.`status` IN (\"Consolidated\", \"Paid\") AND d.`docstatus` = 1"
		prior_branch_filter = ""

	rows = frappe.db.sql(
		f"""
		SELECT
			date_list.`date` AS date,
			COUNT(d.`customer`) AS total_customers,
			COUNT(DISTINCT CASE WHEN NOT EXISTS (
				SELECT 1 FROM `tabPOS Invoice` c
				WHERE {prior_condition}
					AND c.`customer` = d.`customer`
					{prior_branch_filter}
					AND c.`status` IN ("Consolidated", "Paid")
					AND c.`docstatus` = 1
			) THEN d.`customer` END) AS new_customers
		FROM {date_list}
		LEFT JOIN `tabPOS Invoice` d ON ({invoice_filter})
		{join}
		WHERE {day_condition}
		GROUP BY date_list.`date`
		ORDER BY date_list.`date` ASC
		""",
		params,
		as_dict=True,
	)

	for r in rows:
		r["date"] = str(r["date"])
		r["total_customers"] = r["total_customers"] or 0
		r["new_customers"] = r["new_customers"] or 0
		r["repeat_customers"] = r["total_customers"] - r["new_customers"]
		r["repeat_rate_percent"] = (
			round((r["repeat_customers"] / r["total_customers"]) * 100, 1) if r["total_customers"] else 0
		)

	total_customers = sum(r["total_customers"] for r in rows)
	total_new = sum(r["new_customers"] for r in rows)
	total_repeat = total_customers - total_new

	return {
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"rows": rows,
		"summary": {
			"total_customers": total_customers,
			"new_customers": total_new,
			"repeat_customers": total_repeat,
			"avg_repeat_rate_percent": round((total_repeat / total_customers) * 100, 1) if total_customers else 0,
		},
	}

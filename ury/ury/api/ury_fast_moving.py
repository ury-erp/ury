import frappe

from ury.ury.report_api.utils import require_manager


@frappe.whitelist()
def get_fast_moving_items(window_days=1, branch=None):
	"""Items ranked by recent sell rate (quantity sold per hour) over a
	trailing window.

	Purely a sell-rate ranking — there is no live stock count backing this
	(URY has no per-item live inventory field), so it must never be read as
	"running low" or "86'd". It only says which items have been moving fast
	over the last `window_days` day(s), based on the same POS Invoice / POS
	Invoice Item join pattern used by report_api/items.py's
	get_item_wise_sales.
	"""
	require_manager()

	window_days = max(1, int(window_days))
	window_hours = window_days * 24
	start_datetime = frappe.utils.add_to_date(frappe.utils.now_datetime(), days=-window_days)

	params = {"start_datetime": start_datetime}
	# NOTE: no URY Report Settings join here on purpose. This is a trailing
	# rolling-window ranking (last `window_days` * 24 hours from now), not a
	# business-day report, so the extended-hours settings row is irrelevant —
	# and joining it unfiltered would risk multiplying qty_sold if a branch
	# ever had more than one settings row.
	if branch:
		join = ""
		params["branch"] = branch
		invoice_join = (
			"a.`branch` = %(branch)s AND a.`status` IN (\"Consolidated\", \"Paid\") AND a.`docstatus` = 1"
			" AND TIMESTAMP(a.`posting_date`, a.`posting_time`) >= %(start_datetime)s"
		)
	else:
		join = ""
		invoice_join = (
			"a.`status` IN (\"Consolidated\", \"Paid\") AND a.`docstatus` = 1"
			" AND TIMESTAMP(a.`posting_date`, a.`posting_time`) >= %(start_datetime)s"
		)

	rows = frappe.db.sql(
		f"""
		SELECT
			b.`item_code` AS item,
			c.`item_name` AS item_name,
			ROUND(SUM(b.`qty`), 2) AS qty_sold
		FROM `tabPOS Invoice` a
		INNER JOIN `tabPOS Invoice Item` b ON a.`name` = b.`parent`
		LEFT JOIN `tabItem` c ON c.`item_code` = b.`item_code`
		{join}
		WHERE {invoice_join}
		GROUP BY b.`item_code`
		ORDER BY qty_sold DESC
		""",
		params,
		as_dict=True,
	)

	for r in rows:
		r["qty_sold"] = r["qty_sold"] or 0
		r["sell_rate_per_hour"] = round(r["qty_sold"] / window_hours, 3) if window_hours else 0

	rows.sort(key=lambda r: r["sell_rate_per_hour"], reverse=True)

	return rows[:20]

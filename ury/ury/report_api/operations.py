import frappe

from ury.ury.report_api.utils import require_manager, validate_date_range


@frappe.whitelist()
def get_completed_work_orders(start_date, end_date):
	"""Completed manufacturing Work Orders over a date range.

	No existing URY report to port from. Research (a dedicated investigation
	pass, including checking the restored demo DB directly) found no
	URY-specific "completed order" concept matching this name — URY's own
	KOT (Kitchen Order Ticket) doctype uses a "Served" status, not
	"Completed", and doesn't appear in any of URY's 14 existing reports.
	Real completed ERPNext Work Order (manufacturing) records DO exist in
	the restored demo DB, matching PLAN.md's original hypothesis, so this
	is built against that standard doctype. Work Order has no `branch`
	field, so unlike every other report in this app, there is no branch
	filter here — that's a data-model fact, not an oversight.
	"""
	require_manager()
	validate_date_range(start_date, end_date)

	rows = frappe.db.sql(
		"""
		SELECT
			`name` AS name,
			`production_item` AS production_item,
			`item_name` AS item_name,
			`qty` AS qty,
			`produced_qty` AS produced_qty,
			`planned_end_date` AS planned_end_date,
			`actual_end_date` AS actual_end_date
		FROM `tabWork Order`
		WHERE `status` = "Completed"
			AND `docstatus` = 1
			AND COALESCE(`actual_end_date`, `planned_end_date`) BETWEEN %(start_date)s AND %(end_date)s
		ORDER BY COALESCE(`actual_end_date`, `planned_end_date`) DESC
		""",
		{"start_date": start_date, "end_date": end_date},
		as_dict=True,
	)

	for r in rows:
		r["planned_end_date"] = str(r["planned_end_date"]) if r["planned_end_date"] else None
		r["actual_end_date"] = str(r["actual_end_date"]) if r["actual_end_date"] else None
		r["qty"] = r["qty"] or 0
		r["produced_qty"] = r["produced_qty"] or 0

	return {
		"start_date": str(start_date),
		"end_date": str(end_date),
		"work_orders": rows,
		"summary": {
			"total_completed": len(rows),
			"total_qty_produced": round(sum(r["produced_qty"] for r in rows), 2),
		},
	}

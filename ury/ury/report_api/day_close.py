import frappe
from frappe.utils import getdate

from ury.ury.report_api.utils import require_manager


@frappe.whitelist(methods=["GET"])
def get_close_day_checklist(branch, service_date):
	"""Close-day blocker checklist for a single branch/service date.

	Assembles four independently-sourced signals that already exist
	elsewhere in the schema -- this endpoint does no new bookkeeping of
	its own, it just reads and packages what's already there:

	  - open_tables: URY Table.occupied for the branch (same source as
	    ury_dashboard.get_dashboard_stats' "active_tables").
	  - unposted_production: submitted Work Order records not yet
	    Completed/Stopped/Cancelled. Work Order has no `branch` field in
	    this schema (see report_api/operations.py's
	    get_completed_work_orders docstring for the same finding), so
	    this count is company-wide, not branch-scoped -- documented via
	    the `unposted_production_is_company_wide` flag in the response
	    rather than silently mislabeled as branch data.
	  - closing_counts_done: whether a submitted POS Closing Entry exists
	    for this branch's POS Profile(s) on this date (POS Profile has a
	    `branch` custom field, used the same way in
	    ury/doctype/sub_pos_closing/sub_pos_closing.py and
	    ury/api/ury_kot_validation.py).
	  - wastage_unsigned: count of URY Issue Wastage records still in
	    Draft (not yet Authorized/Rejected) for this branch.

	Each item reports a boolean `blocking` the frontend can render as a
	checklist state; nothing here infers or enforces an actual close-day
	workflow gate -- that judgment call is left to the manager reading
	the checklist.
	"""
	require_manager()

	if not branch:
		frappe.throw("branch is required")
	if not service_date:
		frappe.throw("service_date is required")

	service_date = getdate(service_date)

	open_tables = frappe.db.count("URY Table", {"branch": branch, "occupied": 1})

	unposted_production = frappe.db.count(
		"Work Order",
		{
			"docstatus": 1,
			"status": ["not in", ["Completed", "Stopped", "Cancelled"]],
		},
	)

	pos_profiles = frappe.get_all("POS Profile", filters={"branch": branch}, pluck="name")
	closing_counts_done = False
	if pos_profiles:
		closing_counts_done = bool(
			frappe.db.count(
				"POS Closing Entry",
				{
					"pos_profile": ["in", pos_profiles],
					"posting_date": service_date,
					"docstatus": 1,
				},
			)
		)

	wastage_unsigned = frappe.db.count(
		"URY Issue Wastage",
		{"branch": branch, "status": "Draft"},
	)

	items = [
		{
			"key": "open_tables",
			"label": "Open tables",
			"count": open_tables,
			"blocking": open_tables > 0,
		},
		{
			"key": "unposted_production",
			"label": "Unposted production (Work Orders)",
			"count": unposted_production,
			"blocking": unposted_production > 0,
			"scope_note": "company-wide -- Work Order has no branch field",
		},
		{
			"key": "closing_counts",
			"label": "Closing counts",
			"count": 0 if closing_counts_done else 1,
			"blocking": not closing_counts_done,
		},
		{
			"key": "wastage_signoff",
			"label": "Wastage sign-off",
			"count": wastage_unsigned,
			"blocking": wastage_unsigned > 0,
		},
	]

	return {
		"branch": branch,
		"service_date": str(service_date),
		"items": items,
		"has_pos_profile": bool(pos_profiles),
		"unposted_production_is_company_wide": True,
	}

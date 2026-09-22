import frappe

from ury.ury.api.ury_dashboard import get_dashboard_stats


@frappe.whitelist()
def get_dashboard_summary(branch=None):
	"""Management Service Board summary.

	Core sales/table metrics come from ``get_dashboard_stats`` (same source as
	the POS dashboard). Supplemental counts stay management-only.
	"""
	branch_arg = None if not branch or branch == "all" else branch
	stats = get_dashboard_stats(branch_arg) or {}

	table_filters = {"branch": branch_arg} if branch_arg else None
	item_filters = None
	user_filters = {"enabled": 1}
	kot_filters = {"docstatus": 0}
	if branch_arg:
		kot_filters = {"docstatus": 0, "branch": branch_arg}

	total_tables = stats.get("total_tables")
	if total_tables is None:
		total_tables = (
			frappe.db.count("URY Table", table_filters or {})
			if frappe.db.exists("DocType", "URY Table")
			else 0
		)

	pending_kitchen_orders = (
		frappe.db.count("URY KOT", kot_filters)
		if frappe.db.exists("DocType", "URY KOT")
		else 0
	)

	return {
		"today_sales": stats.get("todays_sales") or 0,
		"today_orders": stats.get("orders_today") or 0,
		"occupied_tables": stats.get("active_tables") or 0,
		"total_tables": total_tables or 0,
		"avg_order_value": stats.get("avg_order_value") or 0,
		"active_cashiers": frappe.db.count("User", user_filters),
		"pending_kitchen_orders": pending_kitchen_orders,
		"total_menu_items": (
			frappe.db.count("Item", item_filters)
			if frappe.db.exists("DocType", "Item")
			else 0
		),
	}


@frappe.whitelist()
def get_dashboard_charts(branch=None):
	return {
		"sales_trend": [],
		"hourly_sales": [],
		"payment_methods": [],
		"order_types": [],
		"top_items": [],
		"revenue_by_branch": [],
		"sales_by_course": [],
	}


@frappe.whitelist()
def get_recent_transactions(branch=None, limit=10):
	filters = {"docstatus": ["in", [0, 1]]}
	if branch and branch != "all":
		filters["branch"] = branch

	if frappe.db.exists("DocType", "POS Invoice"):
		try:
			invoices = frappe.get_all(
				"POS Invoice",
				filters=filters,
				fields=[
					"name",
					"customer",
					"posting_date",
					"posting_time",
					"grand_total",
					"status",
					"order_type",
					"restaurant_table as restaurant_table",
					"owner as cashier",
				],
				order_by="creation desc",
				limit=int(limit),
			)
			for inv in invoices:
				if not inv.get("status"):
					inv["status"] = "Draft" if inv.get("docstatus") == 0 else "Paid"
				if not inv.get("order_type"):
					inv["order_type"] = "Dine In"
			return invoices
		except Exception as e:
			frappe.log_error(f"Error in get_recent_transactions: {str(e)}")
			return []
	return []


@frappe.whitelist()
def get_module_records(doctype, branch=None):
	if not frappe.db.exists("DocType", doctype):
		return []

	filters = {}
	if branch and branch != "all":
		meta = frappe.get_meta(doctype)
		if meta.has_field("branch"):
			filters["branch"] = branch
		elif meta.has_field("custom_branch"):
			filters["custom_branch"] = branch

	try:
		return frappe.get_all(doctype, filters=filters, fields=["*"])
	except Exception:
		return []

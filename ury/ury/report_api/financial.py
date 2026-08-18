import frappe

from ury.ury.report_api.utils import require_manager

SUMMARY_FIELDS = [
	("gross_sales", "gross_sales_percent", "Gross Sales"),
	("cash_discount_round_off", "cash_discount_round_off_percent", "Discounts & Round Offs"),
	("tax", "tax_percent", "Tax"),
	("net_sales", "net_sales_percent", "Net Sales"),
	("cogs", "cogs_percent", "Cost of Goods Sold"),
	("total_direct_expenses", "total_direct_expenses_percent", "Total Direct Expenses"),
	("gross_profit", "gross_profit_percent", "Gross Profit/Loss"),
	("total_employee_costs", "total_employee_costs_percent", "Employee Costs"),
	("total_indirect_expenses", "total_indirect_expenses_percent", "Total Indirect Expenses"),
	("depreciation", "depreciation_percent", "Depreciation"),
	("total_other_expenses", "other_expenses_percent", "Other Expenses"),
	("net_profit", "net_profit_percent", "Net Profit/Loss"),
]


@frappe.whitelist()
def get_daily_pnl(date, branch):
	"""Structured JSON view of a submitted "URY Daily P and L" document.

	This is the one Wave 4 report that is NOT a Query Report — it's an
	existing submittable DocType whose `before_submit()` hook already runs
	a substantial COGS/expense computation (recursive BOM costing, employee
	cost proration from Attendance, per-branch fixed/percentage expense
	rules from URY Report Settings) and persists ~30 summary fields plus 4
	breakup child tables. Per the research brief's explicit risk framing —
	this is financial data, and the existing Desk submittable workflow must
	not be disturbed — this endpoint deliberately does NOT recompute
	anything. It only reads back already-persisted fields from a submitted
	document for the given branch/date, exactly like the existing
	`get_proft_loss_details` HTML method does, just shaped as JSON instead
	of an HTML table.

	Returns an "exists": false response (not an error) when no submitted
	document exists for the branch/date — that's an expected, common state
	(the doc must be manually created and submitted each day), not a bug.
	"""
	require_manager()

	name = frappe.db.get_value(
		"URY Daily P and L",
		{"branch": branch, "date": date, "docstatus": 1},
		"name",
	)
	if not name:
		return {"exists": False, "branch": branch, "date": str(date)}

	doc = frappe.get_doc("URY Daily P and L", name)

	summary = [
		{
			"key": amount_field,
			"label": label,
			"amount": doc.get(amount_field) or 0,
			"percent": doc.get(percent_field) or 0,
		}
		for amount_field, percent_field, label in SUMMARY_FIELDS
	]

	def breakup_rows(table_field):
		return [
			{"label": r.breakup, "amount": r.amount or 0, "percent": r.percent or 0}
			for r in (doc.get(table_field) or [])
		]

	cost_of_goods = [
		{
			"item_code": r.item_code,
			"item_name": r.item_name,
			"item_group": r.item_group,
			"qty": r.qty or 0,
			"buying_price": r.buying_price or 0,
			"amount": r.amount or 0,
		}
		for r in (doc.get("cost_of_goods") or [])
	]

	return {
		"exists": True,
		"name": doc.name,
		"branch": doc.branch,
		"date": str(doc.date),
		"remarks": doc.remarks or None,
		"summary": summary,
		"direct_expenses_breakup": breakup_rows("direct_expenses_breakup"),
		"employee_costs_breakup": breakup_rows("employee_costs_breakup"),
		"indirect_expenses_breakup": breakup_rows("indirect_expenses_breakup"),
		"cost_of_goods": cost_of_goods,
	}


@frappe.whitelist()
def get_daily_pnl_dates(branch, limit=90):
	"""Dates with a submitted Daily P&L for the given branch, most recent
	first — backs a "jump to a date that actually has data" picker, since
	most calendar dates won't have one (the doc is created manually)."""
	require_manager()
	limit = min(int(limit), 366)

	rows = frappe.get_all(
		"URY Daily P and L",
		filters={"branch": branch, "docstatus": 1},
		fields=["date"],
		order_by="date desc",
		limit_page_length=limit,
	)
	return [str(r.date) for r in rows]

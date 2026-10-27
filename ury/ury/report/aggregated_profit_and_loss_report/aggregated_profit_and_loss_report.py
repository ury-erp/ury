# Copyright (c) 2026, Tridz and contributors
# For license information, please see license.txt

import frappe
from collections import defaultdict
from frappe import _
from frappe.query_builder import DocType, functions as fn
from frappe.utils import flt


PARENT_DOCTYPE = "URY Daily P and L"
CHILD_DOCTYPE = "URY P and L Breakup"


def execute(filters=None):
	"""Entry point for the script report."""
	filters = normalize_filters(filters or {})

	parent_docs = get_parent_docs(filters)
	parent_names = [row.name for row in parent_docs]

	aggregates = get_aggregated_parent_totals(filters, parent_names)
	gross_sales = flt(aggregates.get("gross_sales"))
	breakup_rows = get_breakup_rows(parent_names)

	columns = get_columns()
	data = get_data(aggregates, breakup_rows, gross_sales)
	chart = get_chart(aggregates)
	report_summary = get_report_summary(aggregates, gross_sales)

	return columns, data, None, chart, report_summary


def normalize_filters(filters):
	"""Validate and normalize the report filters."""
	from_date = filters.get("from_date")
	to_date = filters.get("to_date")

	if not from_date or not to_date:
		frappe.throw(_("From Date and To Date are required."))

	if from_date > to_date:
		frappe.throw(_("From Date cannot be greater than To Date."))

	return {
		"from_date": from_date,
		"to_date": to_date,
		"branch": filters.get("branch"),
	}


def get_columns():
	"""Return the financial-statement style columns for the report."""
	return [
		{
			"label": _("Category"),
			"fieldname": "category",
			"fieldtype": "Data",
			"width": 340,
		},
		{
			"label": _("Amount"),
			"fieldname": "amount",
			"fieldtype": "Currency",
			"width": 160,
		},
		{
			"label": _("Percentage"),
			"fieldname": "percentage",
			"fieldtype": "Percent",
			"width": 140,
		},
	]


def get_data(aggregates, breakup_rows, gross_sales):
	"""Build the hierarchical report rows resembling ERPNext Financial Statements."""
	rows = []

	# 1. Income Group
	rows.append({
		"category": "Income",
		"account_name": "Income",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 1,
		"amount": None,
		"percentage": None,
	})
	rows.append({
		"category": "Gross Sales",
		"account_name": "Gross Sales",
		"parent_category": "Income",
		"parent_account": "Income",
		"indent": 1,
		"is_group": 0,
		"amount": flt(aggregates.get("gross_sales")),
		"percentage": 100.0 if gross_sales else 0.0,
	})
	rows.append({
		"category": "Cash Discount",
		"account_name": "Cash Discount",
		"parent_category": "Income",
		"parent_account": "Income",
		"indent": 1,
		"is_group": 0,
		"amount": flt(aggregates.get("cash_discount_round_off")),
		"percentage": safe_percent(aggregates.get("cash_discount_round_off"), gross_sales),
	})
	rows.append({
		"category": "Tax",
		"account_name": "Tax",
		"parent_category": "Income",
		"parent_account": "Income",
		"indent": 1,
		"is_group": 0,
		"amount": flt(aggregates.get("tax")),
		"percentage": safe_percent(aggregates.get("tax"), gross_sales),
	})
	rows.append({
		"category": "Net Sales",
		"account_name": "Net Sales",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 0,
		"amount": flt(aggregates.get("net_sales")),
		"percentage": safe_percent(aggregates.get("net_sales"), gross_sales),
	})

	# 2. Cost of Sales Group
	rows.append({
		"category": "Cost of Sales",
		"account_name": "Cost of Sales",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 1,
		"amount": None,
		"percentage": None,
	})
	rows.append({
		"category": "Cost of Goods",
		"account_name": "Cost of Goods",
		"parent_category": "Cost of Sales",
		"parent_account": "Cost of Sales",
		"indent": 1,
		"is_group": 0,
		"amount": flt(aggregates.get("cogs")),
		"percentage": safe_percent(aggregates.get("cogs"), gross_sales),
	})

	net_sales_val = flt(aggregates.get("net_sales"))
	cogs_val = flt(aggregates.get("cogs"))
	gross_profit_std = net_sales_val - cogs_val

	rows.append({
		"category": "Gross Profit",
		"account_name": "Gross Profit",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 0,
		"amount": gross_profit_std,
		"percentage": safe_percent(gross_profit_std, gross_sales),
		"warn_if_negative": True,
	})

	# 3. Direct Expenses Group
	total_direct = flt(aggregates.get("total_direct_expenses"))
	rows.append({
		"category": "Direct Expenses",
		"account_name": "Direct Expenses",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 1,
		"amount": total_direct,
		"percentage": safe_percent(total_direct, gross_sales),
	})

	direct_breakups = breakup_rows.get("direct_expenses_breakup", {})
	for breakup_label, amount in sorted(direct_breakups.items()):
		rows.append({
			"category": breakup_label,
			"account_name": breakup_label,
			"parent_category": "Direct Expenses",
			"parent_account": "Direct Expenses",
			"indent": 1,
			"is_group": 0,
			"amount": flt(amount),
			"percentage": safe_percent(amount, gross_sales),
		})

	rows.append({
		"category": "Total Direct Expenses",
		"account_name": "Total Direct Expenses",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 0,
		"amount": total_direct,
		"percentage": safe_percent(total_direct, gross_sales),
	})

	gross_profit_after_direct = flt(aggregates.get("gross_profit"))
	rows.append({
		"category": "Gross Profit After Direct Expenses",
		"account_name": "Gross Profit After Direct Expenses",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 0,
		"amount": gross_profit_after_direct,
		"percentage": safe_percent(gross_profit_after_direct, gross_sales),
		"warn_if_negative": True,
	})

	# 4. Indirect Expenses Group
	total_indirect = flt(aggregates.get("total_indirect_expenses"))
	rows.append({
		"category": "Indirect Expenses",
		"account_name": "Indirect Expenses",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 1,
		"amount": total_indirect,
		"percentage": safe_percent(total_indirect, gross_sales),
	})

	# Employee Costs subgroup
	total_emp_costs = flt(aggregates.get("total_employee_costs"))
	rows.append({
		"category": "Employee Costs",
		"account_name": "Employee Costs",
		"parent_category": "Indirect Expenses",
		"parent_account": "Indirect Expenses",
		"indent": 1,
		"is_group": 1,
		"amount": total_emp_costs,
		"percentage": safe_percent(total_emp_costs, gross_sales),
	})
	emp_breakups = breakup_rows.get("employee_costs_breakup", {})
	for breakup_label, amount in sorted(emp_breakups.items()):
		rows.append({
			"category": breakup_label,
			"account_name": breakup_label,
			"parent_category": "Employee Costs",
			"parent_account": "Employee Costs",
			"indent": 2,
			"is_group": 0,
			"amount": flt(amount),
			"percentage": safe_percent(amount, gross_sales),
		})

	# Other Expenses subgroup (aggregates indirect_expenses_breakup + other_expenses child tables)
	other_breakups = defaultdict(float)
	for k, v in breakup_rows.get("indirect_expenses_breakup", {}).items():
		other_breakups[k] += v
	for k, v in breakup_rows.get("other_expenses", {}).items():
		other_breakups[k] += v

	total_other_expenses_val = sum(other_breakups.values()) if other_breakups else flt(aggregates.get("total_other_expenses"))
	rows.append({
		"category": "Other Expenses",
		"account_name": "Other Expenses",
		"parent_category": "Indirect Expenses",
		"parent_account": "Indirect Expenses",
		"indent": 1,
		"is_group": 1,
		"amount": total_other_expenses_val,
		"percentage": safe_percent(total_other_expenses_val, gross_sales),
	})
	for breakup_label, amount in sorted(other_breakups.items()):
		rows.append({
			"category": breakup_label,
			"account_name": breakup_label,
			"parent_category": "Other Expenses",
			"parent_account": "Other Expenses",
			"indent": 2,
			"is_group": 0,
			"amount": flt(amount),
			"percentage": safe_percent(amount, gross_sales),
		})

	depreciation_val = flt(aggregates.get("depreciation"))
	rows.append({
		"category": "Depreciation",
		"account_name": "Depreciation",
		"parent_category": "Indirect Expenses",
		"parent_account": "Indirect Expenses",
		"indent": 1,
		"is_group": 0,
		"amount": depreciation_val,
		"percentage": safe_percent(depreciation_val, gross_sales),
	})

	rows.append({
		"category": "Total Indirect Expenses",
		"account_name": "Total Indirect Expenses",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 0,
		"amount": total_indirect,
		"percentage": safe_percent(total_indirect, gross_sales),
	})

	net_profit_val = flt(aggregates.get("net_profit"))
	rows.append({
		"category": "Net Profit",
		"account_name": "Net Profit",
		"parent_category": None,
		"parent_account": None,
		"indent": 0,
		"is_group": 0,
		"amount": net_profit_val,
		"percentage": safe_percent(net_profit_val, gross_sales),
		"warn_if_negative": True,
	})

	return rows


def get_report_summary(aggregates, gross_sales):
	"""Return summary cards for top metrics."""
	return [
		{
			"label": _("Gross Sales"),
			"value": flt(aggregates.get("gross_sales")),
			"indicator": "Blue",
			"datatype": "Currency",
		},
		{
			"label": _("Net Sales"),
			"value": flt(aggregates.get("net_sales")),
			"indicator": "Blue",
			"datatype": "Currency",
		},
		{
			"label": _("Gross Profit"),
			"value": flt(aggregates.get("gross_profit")),
			"indicator": "Green" if flt(aggregates.get("gross_profit")) >= 0 else "Red",
			"datatype": "Currency",
		},
		{
			"label": _("Net Profit"),
			"value": flt(aggregates.get("net_profit")),
			"indicator": "Green" if flt(aggregates.get("net_profit")) >= 0 else "Red",
			"datatype": "Currency",
		},
		{
			"label": _("Gross Margin %"),
			"value": safe_percent(aggregates.get("gross_profit"), gross_sales),
			"indicator": "Green" if flt(aggregates.get("gross_profit")) >= 0 else "Red",
			"datatype": "Percent",
		},
		{
			"label": _("Net Margin %"),
			"value": safe_percent(aggregates.get("net_profit"), gross_sales),
			"indicator": "Green" if flt(aggregates.get("net_profit")) >= 0 else "Red",
			"datatype": "Percent",
		},
	]


def get_chart(aggregates):
	"""Return bar chart visual summary."""
	return {
		"data": {
			"labels": [
				_("Gross Sales"),
				_("Net Sales"),
				_("COGS"),
				_("Direct Expenses"),
				_("Gross Profit"),
				_("Indirect Expenses"),
				_("Net Profit"),
			],
			"datasets": [
				{
					"name": _("Amount"),
					"values": [
						flt(aggregates.get("gross_sales")),
						flt(aggregates.get("net_sales")),
						flt(aggregates.get("cogs")),
						flt(aggregates.get("total_direct_expenses")),
						flt(aggregates.get("gross_profit")),
						flt(aggregates.get("total_indirect_expenses")),
						flt(aggregates.get("net_profit")),
					],
				}
			],
		},
		"type": "bar",
		"height": 300,
	}


def get_parent_docs(filters):
	"""Fetch matching Daily P&L documents."""
	daily_pl = DocType(PARENT_DOCTYPE)
	query = frappe.qb.from_(daily_pl).select(daily_pl.name)

	query = query.where(daily_pl.docstatus != 2)
	query = query.where(daily_pl.date >= filters.get("from_date"))
	query = query.where(daily_pl.date <= filters.get("to_date"))

	if filters.get("branch"):
		query = query.where(daily_pl.branch == filters.get("branch"))

	return query.run(as_dict=True)


def get_aggregated_parent_totals(filters, parent_names):
	"""Aggregate parent totals in a single query."""
	if not parent_names:
		return {}

	daily_pl = DocType(PARENT_DOCTYPE)
	query = frappe.qb.from_(daily_pl).select(
		fn.Sum(daily_pl.gross_sales).as_("gross_sales"),
		fn.Sum(daily_pl.cash_discount_round_off).as_("cash_discount_round_off"),
		fn.Sum(daily_pl.tax).as_("tax"),
		fn.Sum(daily_pl.net_sales).as_("net_sales"),
		fn.Sum(daily_pl.cogs).as_("cogs"),
		fn.Sum(daily_pl.total_direct_expenses).as_("total_direct_expenses"),
		fn.Sum(daily_pl.gross_profit).as_("gross_profit"),
		fn.Sum(daily_pl.total_employee_costs).as_("total_employee_costs"),
		fn.Sum(daily_pl.total_other_expenses).as_("total_other_expenses"),
		fn.Sum(daily_pl.depreciation).as_("depreciation"),
		fn.Sum(daily_pl.total_indirect_expenses).as_("total_indirect_expenses"),
		fn.Sum(daily_pl.net_profit).as_("net_profit"),
	)

	query = query.where(daily_pl.docstatus != 2)
	query = query.where(daily_pl.date >= filters.get("from_date"))
	query = query.where(daily_pl.date <= filters.get("to_date"))

	if filters.get("branch"):
		query = query.where(daily_pl.branch == filters.get("branch"))

	query = query.where(daily_pl.name.isin(parent_names))

	raw = query.run(as_dict=True)
	aggregate_data = raw[0] if raw else {}

	return {key: flt(value) for key, value in aggregate_data.items() if value is not None}


def get_breakup_rows(parent_names):
	"""Aggregate child breakup rows by parentfield and breakup label."""
	if not parent_names:
		return {}

	rows = frappe.get_all(
		CHILD_DOCTYPE,
		fields=["parent", "parentfield", "breakup", "amount"],
		filters={
			"parenttype": PARENT_DOCTYPE,
			"parent": ["in", parent_names],
		},
	)

	grouped = defaultdict(lambda: defaultdict(float))

	for row in rows:
		parentfield = row.get("parentfield")
		breakup_label = row.get("breakup") or _("Unknown")
		grouped[parentfield][breakup_label] += flt(row.get("amount"))

	return grouped


def safe_percent(value, denominator):
	"""Safely calculate percentage rounded to 2 decimals."""
	if not denominator or denominator == 0:
		return 0.0
	return round(flt(value) / flt(denominator) * 100, 2)


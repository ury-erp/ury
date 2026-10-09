"""Registers URY's read-only AI tools (`ury_tools.py`, `ury_ops_tools.py`) as HUF Agent Tools.

HUF discovers tools from every installed app via the `huf_tools` hook
(`ury/hooks.py`), synced into `Agent Tool`/`Agent Tool Function` doctype
records by `huf.ai.tool_registry.sync_app_tools`, which runs on every
`bench migrate` (see `after_migrate` in HUF's own `hooks.py`). This mirrors
the entry shape HUF's own `ai/tools/_registry.py` uses — see
`tracks/sa-ai-reports-dashboard/HUF_API_NOTES.md` for how this was confirmed.

Every entry here is read-only (see `ury_tools.py` / `ury_ops_tools.py` and
the allowlist/no-mutating-call tests in `test_ury_tools.py`, which this
list's function set must stay in sync with).

Parameter `type`s must be values HUF's "Agent Function Params" Select
accepts (string/integer/number/boolean/object/array) — anything else is
silently stored as "string".
"""


def _p(name, type="string", required=False, description=""):
	return {
		"label": name.replace("_", " ").title(),
		"fieldname": name,
		"type": type,
		"required": int(required),
		"description": description,
	}


_T = "ury.ury.ai_tools.ury_tools."
_O = "ury.ury.ai_tools.ury_ops_tools."
_CAT = "URY Restaurant Tools"

_BRANCH = "Branch (outlet) name, e.g. 'URY Muscat'. Omit for all branches. Use ury_lookup(entity='branch') if unsure."
_COMPANY = "Company (legal entity), e.g. 'URY OMAN'."
_PERIOD = (
	"Date window: today, yesterday, this_week, last_week, last_7_days, last_30_days, this_month, "
	"last_month, this_quarter, this_year, last_year, a date 'YYYY-MM-DD', or 'YYYY-MM-DD..YYYY-MM-DD'."
)


def _tool(name, path, description, parameters):
	return {"tool_name": name, "description": description, "function_path": path, "category": _CAT, "parameters": parameters}


ALL_URY_TOOLS = [
	# --- live floor / shift -------------------------------------------------
	_tool(
		"ury_get_floor_state", _T + "get_floor_state",
		"Current per-table floor/service status for a branch (open, seated, order fired, served, over-time, "
		"minutes in stage). Use for 'which tables need attention right now'.",
		[_p("branch", description=_BRANCH)],
	),
	_tool(
		"ury_get_open_exceptions", _T + "get_open_exceptions",
		"Currently-open operational exceptions: pending payments, long-held tables, KOT/kitchen errors, "
		"unclosed POS sessions. Use for 'what needs attention right now'.",
		[_p("branch", description=_BRANCH)],
	),
	_tool(
		"ury_get_shift_metrics", _T + "get_shift_metrics",
		"Today's sales, covers and average bill so far for a branch (live shift only — for any other date "
		"use ury_get_report_snapshot).",
		[_p("window", description="Must be 'today'."), _p("branch", description=_BRANCH)],
	),
	_tool(
		"ury_get_baseline", _T + "get_baseline",
		"Rolling median sales/covers for a weekday+hour ('a normal Tuesday at 7pm') to compare tonight against.",
		[
			_p("weekday", type="integer", description="0=Monday .. 6=Sunday. Omit for today."),
			_p("hour", type="integer", description="0-23. Omit for the current hour."),
			_p("branch", description=_BRANCH),
			_p("weeks", type="integer", description="Weeks of history. Default 6."),
		],
	),
	# --- reports ------------------------------------------------------------
	_tool(
		"ury_list_reports", _T + "list_reports",
		"List every URY report you can run (sales, menu engineering, food cost, customers, staff, commission, "
		"RevPASH, table turnaround, wastage, stock-count variance, yield, department profitability, daily P&L) "
		"with slug and description. Call this first when asked about a report or historical numbers.",
		[],
	),
	_tool(
		"ury_describe_report", _T + "describe_report",
		"Exact filters (name, type, required, default) and an example for one report slug. Use before "
		"ury_get_report_snapshot when unsure which filters a report needs.",
		[_p("report_slug", required=True, description="Slug from ury_list_reports.")],
	),
	_tool(
		"ury_get_report_snapshot", _T + "get_report_snapshot",
		"Run ONE URY report for ONE date range / branch and return its data (for 'X vs Y' comparisons use "
		"ury_compare_periods instead). Use the branch the user names, not the page's selected branch. filters is an object, e.g. "
		'{"branch": "URY Muscat", "period": "last_7_days"} or {"start_date": "2026-09-01", "end_date": "2026-09-30"}. '
		"Long lists are capped and marked _truncated.",
		[
			_p("report_slug", required=True, description="Slug from ury_list_reports, e.g. 'item-wise-sales'."),
			_p("filters", type="object", description="Report filters; see ury_describe_report. 'period': " + _PERIOD),
			_p("max_rows", type="integer", description="Max rows per list (default 40)."),
		],
	),
	_tool(
		"ury_compare_periods", _T + "compare_periods",
		"ALWAYS use this for any comparison between two periods ('vs', 'compared to', 'versus', 'than last ...'): runs "
		"one report for both periods in a single call and returns both results plus the change and % change of every "
		"total — e.g. last_month vs month_before_last, this_week vs last_week.",
		[
			_p("report_slug", required=True, description="Slug from ury_list_reports."),
			_p("period_a", required=True, description="Period of interest. " + _PERIOD),
			_p("period_b", required=True, description="Period to compare against (baseline)."),
			_p("filters", type="object", description='Other filters, e.g. {"branch": "URY Muscat"}.'),
			_p("max_rows", type="integer", description="Max rows per list in each period (default 15)."),
		],
	),
	# --- org & lookup -------------------------------------------------------
	_tool(
		"ury_get_org_structure", _O + "get_org_structure",
		"Multi-entity / multi-brand set-up: companies (legal entities, parent group, currency) → branches "
		"(outlets/restaurants), active menus, POS profiles, production departments and their warehouses, "
		"central stores and transit warehouses.",
		[_p("company", description="Limit to one company.")],
	),
	_tool(
		"ury_lookup", _O + "lookup",
		"Find exact record names to use as filters: branch, company, item, item_group, customer, employee, "
		"warehouse, supplier, menu, department.",
		[
			_p("entity", required=True, description="branch | company | item | item_group | customer | employee | warehouse | supplier | menu | department"),
			_p("query", description="Name fragment to search for."),
			_p("company", description=_COMPANY),
			_p("limit", type="integer", description="Max matches (default 10)."),
		],
	),
	# --- stock --------------------------------------------------------------
	_tool(
		"ury_get_stock_levels", _O + "get_stock_levels",
		"Bin-level stock per item and warehouse (on hand, reserved, requested, ordered, projected, value) with the "
		"outlet's min / max / reorder level and whether a reorder is due.",
		[
			_p("item", description="Item code or name fragment."),
			_p("branch", description=_BRANCH),
			_p("company", description=_COMPANY),
			_p("warehouse", description="Exact warehouse name."),
			_p("item_group"),
			_p("status", description="below_reorder | out_of_stock | negative | in_stock"),
			_p("limit", type="integer"),
		],
	),
	_tool(
		"ury_get_reorder_status", _O + "get_reorder_status",
		"Min/max/reorder-point status for an outlet: items below their reorder level, suggested order qty, and the "
		"Material Requests the outlet raised itself (ERPNext auto-reorder) with fulfilment status.",
		[_p("branch", description=_BRANCH), _p("company", description=_COMPANY), _p("warehouse")],
	),
	_tool(
		"ury_get_material_requests", _O + "get_material_requests",
		"Material Requests (outlet indents, transfers from central store, purchase requests): raised by, type, "
		"status, % ordered/received and items.",
		[
			_p("branch", description=_BRANCH),
			_p("company", description=_COMPANY),
			_p("warehouse"),
			_p("status", description="open (default) | all | an exact status"),
			_p("request_type", description="Material Transfer | Purchase | Manufacture | Material Issue"),
			_p("period", description=_PERIOD),
			_p("name", description="Exact Material Request ID."),
		],
	),
	_tool(
		"ury_get_transfers", _O + "get_transfers",
		"Stock transfers between central store/kitchen and outlets through the Goods-In-Transit warehouse: what was "
		"dispatched, what was received, and what is still in transit (qty and value).",
		[
			_p("company", description=_COMPANY),
			_p("branch", description=_BRANCH),
			_p("status", description="in_transit (default) | all"),
			_p("period", description=_PERIOD),
			_p("name", description="Exact Stock Entry ID."),
		],
	),
	_tool(
		"ury_get_stock_movements", _O + "get_stock_movements",
		"Stock ledger history at bin level: every in/out movement for an item/warehouse with qty change, balance "
		"after, value and source document.",
		[
			_p("item", description="Item code or name fragment."),
			_p("branch", description=_BRANCH),
			_p("company", description=_COMPANY),
			_p("warehouse"),
			_p("voucher_type", description="e.g. Stock Entry, Sales Invoice, Stock Reconciliation"),
			_p("voucher_no"),
			_p("period", description=_PERIOD + " Default today."),
			_p("limit", type="integer"),
		],
	),
	_tool(
		"ury_trace_sale_stock_impact", _O + "trace_sale_stock_impact",
		"Show how a sale depleted outlet stock by recipe: bill → KOT → recipe (BOM) per dish → Manufacture entry → "
		"each ingredient deducted from the outlet bin with the balance after. Defaults to the latest sale at the branch.",
		[_p("invoice", description="POS Invoice ID. Omit for the latest sale."), _p("branch", description=_BRANCH)],
	),
	# --- recipes & production ----------------------------------------------
	_tool(
		"ury_get_recipe", _O + "get_recipe",
		"Multi-level recipe (BOM) for a dish or prep item: ingredients and sub-recipes down every level, scaled to a "
		"qty, with yield %, process loss and cost per line and per portion.",
		[
			_p("item", required=True, description="Item code or name."),
			_p("company", description=_COMPANY + " Recipes are per company."),
			_p("branch", description="Alternative to company."),
			_p("qty", type="number", description="Portions/qty to scale to (default 1)."),
			_p("bom", description="Specific BOM ID."),
			_p("max_levels", type="integer"),
		],
	),
	_tool(
		"ury_get_production", _O + "get_production",
		"Production batches (Production Plans per department with their work orders, planned vs produced, state) or "
		"individual work orders, plus yield checks recorded.",
		[
			_p("company", description=_COMPANY),
			_p("branch", description=_BRANCH),
			_p("period", description=_PERIOD + " Default today."),
			_p("item"),
			_p("status"),
			_p("kind", description="batches (default) | work_orders"),
		],
	),
	# --- variance & P&L -----------------------------------------------------
	_tool(
		"ury_get_theoretical_vs_actual", _O + "get_theoretical_vs_actual",
		"Theoretical vs actual ingredient usage and food cost for an outlet: recipe × dishes sold vs what actually "
		"left the bins (production, wastage, stock-count corrections), per ingredient with variance qty, % and value.",
		[
			_p("branch", required=True, description=_BRANCH),
			_p("period", description=_PERIOD + " Default today."),
			_p("start_date"),
			_p("end_date"),
			_p("item", description="Limit to one ingredient."),
			_p("limit", type="integer"),
		],
	),
	_tool(
		"ury_get_outlet_pnl", _O + "get_outlet_pnl",
		"Daily outlet P&L: the submitted Daily P&L (sales, COGS, staff, expenses, net profit) for a branch/date, or a "
		"labelled live estimate when none is saved.",
		[
			_p("branch", required=True, description=_BRANCH),
			_p("date", description="YYYY-MM-DD, 'today' or 'yesterday'. Default today."),
		],
	),
]

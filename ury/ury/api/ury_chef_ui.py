# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Chef UI: department production queue, raw materials and production actions.

Track ``sa-chef-ui-production-queue``. Backs the Production Board page (``/ury/production-board``).

Public surface (all whitelisted):

    get_production_queue(plan_date=None, branch=None)     # GET
    get_department_raw_materials(production_plan)          # GET
    update_production_quantities(production_plan, rows)    # POST, Draft plans only
    submit_production_plan(production_plan)                # POST
    prepare_department_production(production_plan)         # POST, delegates to prepare_production

Every value the page shows is computed here from the department Production
Plans created for the branch's Sales Plan; the frontend only renders.

Access (decisions D1, D2):

- Each endpoint requires ``URY Department Head``, ``URY Manager``,
  ``URY Admin`` or ``System Manager`` (``require_chef_ui_access``).
- Departments are scoped by ``ury.ury.utils.department_scope``. The queue
  query filters Production Plans by the allowed departments in the database.
  Endpoints that take a Production Plan read its department from the stored
  record, never from the request, and check it again.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.query_builder import Order
from frappe.query_builder.functions import Sum
from frappe.utils import add_days, cint, flt, getdate, nowdate
from pypika.terms import CustomFunction

from ury.ury.api.ury_prepare_production import (
	EXECUTION_STATE_BY_PRODUCTION_STATE,
	STATE_COMPLETED,
	STATE_PROCESSING,
	_compile_department_bucket,
	prepare_production,
)
from ury.ury.api.ury_production_plan_quantities import (
	apply_quantities_to_bucket,
	consumption_by_item,
	derive_plan_quantities,
	get_warehouse_stock,
	is_pure_sub_assembly,
	target_key,
	validate_dependency_quantities,
)
from ury.ury.api.ury_production_target_compiler import compile_production_targets
from ury.ury.api.ury_production_readiness import compute_readiness
from ury.ury.api.ury_production_settings import get_store_warehouse
from ury.ury.api.ury_sales_plan_production_plan import (
	PP_DEPARTMENT_FIELD,
	PP_DEPARTMENT_WAREHOUSE_FIELD,
	PP_HASH_FIELD,
	PP_ITEM_NO_WORK_ORDER_FIELD,
	PP_SALES_PLAN_FIELD,
	PP_STATE_FIELD,
	_target_to_production_plan_item,
)
from ury.ury.utils.department_scope import (
	assert_department_access,
	get_allowed_departments,
	get_user_branches,
	is_elevated,
	require_chef_ui_access,
)

SALES_PLAN_DOCTYPE = "URY Sales Plan"
PRODUCTION_PLAN_DOCTYPE = "Production Plan"
PRODUCTION_PLAN_ITEM_DOCTYPE = "Production Plan Item"
DEPARTMENT_DOCTYPE = "URY Production Department"

#: Sales Plan statuses the queue shows. Production Plans exist only once a
#: plan is Locked for Production; an Approved plan shows departments with
#: "No Production Plan yet".
QUEUE_STATUSES = ("Approved", "Locked for Production")

#: Execution states from which Prepare Production may run (same rule the
#: Sales Plan page uses).
PREPARABLE_EXECUTION_STATES = ("awaiting_materials", "ready", "failed")

#: Page-level totals when there is nothing to show.
EMPTY_TOTALS = {"items_to_prepare": 0, "items_prepared": 0, "production_qty": 0.0, "material_shortages": 0}

#: How far back Previous Production Qty looks.
HISTORY_LOOKBACK_DAYS = 371

FIELD_RESULT = "custom_ury_production_result"

_WEEKDAY = CustomFunction("WEEKDAY", ["date"])


# --- Production Queue ----------------------------------------------------------


@frappe.whitelist(methods=["GET"])
def get_production_queue(plan_date=None, branch=None):
	"""Production Queue for one branch and plan date.

	Returns::

		{
		    "branch": "Main", "branches": ["Main"], "plan_date": "2026-11-27",
		    "sales_plan": "SP-2026-00001" | None, "sales_plan_status": "Locked for Production" | None,
		    "departments": [
		        {
		            "department", "department_warehouse", "production_plan" | None,
		            "docstatus", "erpnext_status", "production_state", "link_state",
		            "execution_state", "can_edit", "can_submit", "can_prepare",
		            "blockers": [...],
		            "totals": {"items", "planned_qty", "production_qty"},
		            "items": [
		                {"row_name", "item_code", "item_name", "stock_uom", "planned_qty",
		                 "production_qty", "is_sub_assembly", "made_to_order",
		                 "last_weekday_qty", "last_weekday_date", "produced_qty"}
		            ],
		        }
		    ],
		    "totals": {"items_to_prepare", "items_prepared", "production_qty", "material_shortages"},
		}
	"""
	require_chef_ui_access()
	plan_date = str(getdate(plan_date or nowdate()))
	branches = _accessible_branches()
	if branch:
		if branch not in branches:
			frappe.throw(_("You are not permitted to access Branch {0}.").format(branch), frappe.PermissionError)
	else:
		branch = branches[0] if branches else None

	response = {
		"branch": branch,
		"branches": branches,
		"plan_date": plan_date,
		"sales_plan": None,
		"sales_plan_status": None,
		"departments": [],
		"totals": dict(EMPTY_TOTALS),
	}
	if not branch:
		return response

	sales_plan = _find_sales_plan(branch, plan_date)
	if not sales_plan:
		return response
	response["sales_plan"] = sales_plan["name"]
	response["sales_plan_status"] = sales_plan["status"]

	allowed = get_allowed_departments(branch=branch)
	if allowed is not None and not allowed:
		return response

	snapshot = _decode_json(sales_plan.get("approval_snapshot")) or {}
	snapshot_items = snapshot.get("items") or []
	planned_by_item = {}
	snapshot_departments = set()
	for row in snapshot_items:
		department = row.get("department")
		if allowed is not None and department not in allowed:
			continue
		snapshot_departments.add(department)
		planned_by_item[(department, row.get("item_code"))] = flt(
			planned_by_item.get((department, row.get("item_code")))
		) + flt(row.get("qty"))

	plans = _department_plans(sales_plan["name"], allowed)
	plan_items = _plan_items([plan["name"] for plan in plans])
	department_rows = _departments(set(snapshot_departments) | {plan["department"] for plan in plans})

	buckets = _compile_buckets(sales_plan, branch) if plans else {}
	rows_by_plan = {
		plan["name"]: _queue_rows(
			plan["department"], plan_items.get(plan["name"], []), buckets.get(plan["department"]), planned_by_item
		)
		for plan in plans
	}
	item_codes = sorted({row["item_code"] for rows in rows_by_plan.values() for row in rows})
	item_names = _item_names(item_codes)
	policies = _item_policies(item_codes, branch)
	produced = _produced_by_plan_item([plan["name"] for plan in plans])

	plans_by_department = {plan["department"]: plan for plan in plans}
	for department in sorted(department_rows):
		department_row = department_rows[department]
		plan = plans_by_department.get(department)
		if not plan:
			if department not in snapshot_departments:
				continue
			response["departments"].append(_empty_department(department_row))
			continue

		plan_rows = rows_by_plan.get(plan["name"], [])
		history = _last_same_weekday_production(
			[row["item_code"] for row in plan_rows],
			department_row.get("department_warehouse"),
			plan_date,
		)
		response["departments"].append(
			_department_payload(
				department_row,
				plan,
				plan_rows,
				item_names,
				policies,
				history,
				produced,
				sales_plan.get("approval_snapshot_hash"),
			)
		)

	response["totals"] = _page_totals(
		response["departments"], plans, plan_items, buckets, sales_plan.get("company")
	)
	return response


def _page_totals(departments, plans, plan_items, buckets, company):
	"""Totals for the cards at the top of the page.

	- ``items_to_prepare``: items with a production quantity above 0.
	- ``items_prepared``: those items in departments whose Prepare Production
	  has completed (it prepares a whole department at once).
	- ``production_qty``: total quantity to produce.
	- ``material_shortages``: distinct raw materials short in the department or
	  the Store (the same test as the raw-materials popup), for departments that
	  still have production to prepare.
	"""
	to_prepare = prepared = 0
	for dept in departments:
		count = sum(1 for row in dept["items"] if row["production_qty"] > 0)
		to_prepare += count
		if dept.get("production_state") == STATE_COMPLETED:
			prepared += count

	short = set()
	if buckets:
		store_warehouse = get_store_warehouse(company)
		for plan in plans:
			bucket = buckets.get(plan["department"])
			if bucket and plan.get("production_state") not in (STATE_COMPLETED, STATE_PROCESSING):
				short |= _short_raw_materials(plan["department"], bucket, plan_items.get(plan["name"], []), store_warehouse)

	return {
		"items_to_prepare": to_prepare,
		"items_prepared": prepared,
		"production_qty": sum(dept["totals"]["production_qty"] for dept in departments),
		"material_shortages": len(short),
	}


def _short_raw_materials(department, bucket, plan_rows, store_warehouse):
	"""Raw materials short for one department Production Plan, at the plan's
	quantities. A failure here must not break the page, so it is logged and
	counted as no shortage."""
	try:
		planned = {}
		for row in plan_rows:
			key = (row["item_code"], row["bom_no"])
			planned[key] = flt(planned.get(key)) + flt(row["planned_qty"])
		scaled = apply_quantities_to_bucket(bucket, planned)
		readiness = compute_readiness({department: scaled}, store_warehouse=store_warehouse)
		return {
			row["item_code"]
			for row in readiness["rows"]
			if flt(row["department_shortage"]) > 0 or flt(row["store_shortage"]) > 0
		}
	except Exception:
		frappe.log_error(title="Production Board: shortage count failed", message=frappe.get_traceback())
		return set()


def _accessible_branches():
	branches = get_user_branches()
	if branches or not is_elevated():
		return branches
	return sorted(frappe.get_all("Branch", pluck="name", ignore_permissions=True))


def _find_sales_plan(branch, plan_date):
	rows = frappe.get_all(
		SALES_PLAN_DOCTYPE,
		filters={
			"branch": branch,
			"plan_date": plan_date,
			"docstatus": 1,
			"status": ["in", list(QUEUE_STATUSES)],
		},
		fields=["name", "status", "company", "approval_snapshot", "approval_snapshot_hash"],
		order_by="modified desc",
		limit=1,
		ignore_permissions=True,
	)
	return rows[0] if rows else None


def _department_plans(sales_plan, allowed):
	"""Newest non-cancelled Production Plan per department for ``sales_plan``,
	limited to ``allowed`` departments in the query itself."""
	plan = frappe.qb.DocType(PRODUCTION_PLAN_DOCTYPE)
	query = (
		frappe.qb.from_(plan)
		.select(
			plan.name,
			plan.docstatus,
			plan.status,
			plan[PP_DEPARTMENT_FIELD].as_("department"),
			plan[PP_DEPARTMENT_WAREHOUSE_FIELD].as_("department_warehouse"),
			plan[PP_HASH_FIELD].as_("snapshot_hash"),
			plan[PP_STATE_FIELD].as_("production_state"),
			plan[FIELD_RESULT].as_("result"),
		)
		.where(plan[PP_SALES_PLAN_FIELD] == sales_plan)
		.where(plan.docstatus < 2)
		.orderby(plan.creation, order=Order.desc)
	)
	if allowed is not None:
		query = query.where(plan[PP_DEPARTMENT_FIELD].isin(allowed))
	newest = {}
	for row in query.run(as_dict=True):
		newest.setdefault(row["department"], row)
	return list(newest.values())


def _plan_items(plan_names):
	if not plan_names:
		return {}
	rows = frappe.get_all(
		PRODUCTION_PLAN_ITEM_DOCTYPE,
		filters={"parent": ["in", plan_names], "parenttype": PRODUCTION_PLAN_DOCTYPE},
		fields=["name", "parent", "idx", "item_code", "bom_no", "planned_qty", "stock_uom", PP_ITEM_NO_WORK_ORDER_FIELD],
		order_by="idx asc",
		ignore_permissions=True,
	)
	grouped = {}
	for row in rows:
		grouped.setdefault(row["parent"], []).append(row)
	return grouped


def _departments(names):
	names = sorted(name for name in names if name)
	if not names:
		return {}
	rows = frappe.get_all(
		DEPARTMENT_DOCTYPE,
		filters={"name": ["in", names]},
		fields=["name", "department_warehouse"],
		ignore_permissions=True,
	)
	return {row["name"]: row for row in rows}


def _item_names(item_codes):
	if not item_codes:
		return {}
	return {
		row["name"]: row["item_name"]
		for row in frappe.get_all(
			"Item", filters={"name": ["in", item_codes]}, fields=["name", "item_name"], ignore_permissions=True
		)
	}


def _produced_by_plan_item(plan_names):
	"""``{production_plan_item_row_name: produced_qty}`` from submitted Work Orders."""
	if not plan_names:
		return {}
	rows = frappe.get_all(
		"Work Order",
		filters={"production_plan": ["in", plan_names], "docstatus": 1},
		fields=["production_plan_item", "produced_qty"],
		ignore_permissions=True,
	)
	produced = {}
	for row in rows:
		key = row.get("production_plan_item")
		if key:
			produced[key] = flt(produced.get(key)) + flt(row.get("produced_qty"))
	return produced


def _last_same_weekday_production(item_codes, department_warehouse, plan_date):
	"""``{item_code: {"qty", "date"}}``: finished-item Manufacture quantity on
	the most recent earlier date with the same weekday as ``plan_date`` that
	had production of that item into ``department_warehouse`` (decision D10).
	Items with no such date are absent.

	Scoped by the department warehouse, not ``Stock Entry.branch``: URY's
	Manufacture entries (Prepare Production, batch service) do not set that
	field, and a department warehouse already belongs to one department and
	branch."""
	if not item_codes or not department_warehouse:
		return {}
	plan_day = getdate(plan_date)
	entry = frappe.qb.DocType("Stock Entry")
	detail = frappe.qb.DocType("Stock Entry Detail")
	rows = (
		frappe.qb.from_(detail)
		.inner_join(entry)
		.on(entry.name == detail.parent)
		.select(detail.item_code, entry.posting_date, Sum(detail.transfer_qty).as_("qty"))
		.where(detail.parenttype == "Stock Entry")
		.where(entry.docstatus == 1)
		.where(entry.purpose == "Manufacture")
		.where(detail.is_finished_item == 1)
		.where(detail.t_warehouse == department_warehouse)
		.where(detail.item_code.isin(item_codes))
		.where(entry.posting_date < plan_day)
		.where(entry.posting_date >= add_days(plan_day, -HISTORY_LOOKBACK_DAYS))
		.where(_WEEKDAY(entry.posting_date) == plan_day.weekday())
		.groupby(detail.item_code, entry.posting_date)
		.orderby(entry.posting_date, order=Order.desc)
	).run(as_dict=True)
	return pick_latest_per_item(rows)


def pick_latest_per_item(rows):
	"""``{item_code: {"qty", "date"}}`` keeping each item's most recent
	``posting_date`` from ``(item_code, posting_date, qty)`` rows."""
	history = {}
	for row in rows:
		code = row["item_code"]
		current = history.get(code)
		if current is None or str(row["posting_date"]) > current["date"]:
			history[code] = {"qty": flt(row["qty"]), "date": str(row["posting_date"])}
	return history


def _compile_buckets(sales_plan, branch):
	"""Compiled department buckets for the Sales Plan snapshot, or ``{}`` if
	the compiler cannot run (rows then come from the Production Plans alone)."""
	try:
		departments, _blockers = compile_production_targets(
			sales_plan.get("approval_snapshot"), branch, sales_plan.get("company")
		)
		return departments
	except Exception:
		frappe.log_error(title="Production Board: compile failed", message=frappe.get_traceback())
		return {}


def _queue_rows(department, plan_items, bucket, planned_by_item):
	"""Display rows for one department Production Plan.

	Planned Qty: a directly planned item shows its Sales Plan quantity. A pure
	sub-assembly (needed only by other items) shows what its parents consume,
	at the Production Plan's quantities. Production Qty is the Production Plan
	row's quantity; a sub-assembly that stock already covers has no row and
	shows 0. Its quantity is derived from its parents, so ``derived_qty`` rows
	are read-only.
	"""
	by_key = {}
	for row in plan_items:
		by_key.setdefault((row["item_code"], row["bom_no"]), row)

	demand = {}
	targets = []
	if bucket:
		planned = {key: flt(row["planned_qty"]) for key, row in by_key.items()}
		targets = bucket.get("targets") or []
		demand = consumption_by_item(apply_quantities_to_bucket(bucket, planned, "zero")["targets"])

	rows, used = [], set()
	for target in targets:
		key = target_key(target)
		row = by_key.get(key)
		pure = is_pure_sub_assembly(target)
		if row is None and not pure:
			continue
		code = target["item_code"]
		if row is not None:
			used.add(row["name"])
		rows.append(
			{
				"row_name": row["name"] if row else None,
				"row_key": row["name"] if row else f"item:{code}",
				"item_code": code,
				"stock_uom": (row or target).get("stock_uom"),
				"planned_qty": flt(demand.get(code)) if pure else flt(planned_by_item.get((department, code))),
				"production_qty": flt(row["planned_qty"]) if row else 0.0,
				"is_sub_assembly": pure,
				"derived_qty": pure,
			}
		)
	for row in plan_items:
		if row["name"] in used:
			continue
		code = row["item_code"]
		rows.append(
			{
				"row_name": row["name"],
				"row_key": row["name"],
				"item_code": code,
				"stock_uom": row.get("stock_uom"),
				"planned_qty": flt(planned_by_item.get((department, code))),
				"production_qty": flt(row["planned_qty"]),
				"is_sub_assembly": (department, code) not in planned_by_item,
				"derived_qty": False,
			}
		)
	return rows


def _item_policies(item_codes, branch):
	"""``{item_code: production_policy}`` from the active Item Production
	Configuration of each item in ``branch``."""
	if not item_codes:
		return {}
	rows = frappe.get_all(
		"URY Item Production Configuration",
		filters={"item": ["in", item_codes], "branch": branch, "active": 1},
		fields=["item", "production_policy"],
		ignore_permissions=True,
	)
	return {row["item"]: row["production_policy"] for row in rows}


def _department_payload(department_row, plan, plan_rows, item_names, policies, history, produced, snapshot_hash):
	department = department_row["name"]
	docstatus = cint(plan["docstatus"])
	production_state = plan.get("production_state")
	execution_state = EXECUTION_STATE_BY_PRODUCTION_STATE.get(production_state, "awaiting_materials")
	stale = bool(plan.get("snapshot_hash")) and plan.get("snapshot_hash") != snapshot_hash
	link_state = "stale" if stale else "live"
	result = _decode_json(plan.get("result")) or {}

	rows = []
	for row in plan_rows:
		hist = history.get(row["item_code"]) or {}
		rows.append(
			{
				"row_name": row["row_name"],
				"row_key": row["row_key"],
				"item_code": row["item_code"],
				"item_name": item_names.get(row["item_code"]) or row["item_code"],
				"stock_uom": row.get("stock_uom"),
				"production_policy": policies.get(row["item_code"]),
				"planned_qty": row["planned_qty"],
				"production_qty": row["production_qty"],
				"is_sub_assembly": row["is_sub_assembly"],
				"derived_qty": row["derived_qty"],
				"last_weekday_qty": hist.get("qty"),
				"last_weekday_date": hist.get("date"),
				"produced_qty": (flt(produced.get(row["row_name"])) if row["row_name"] else 0.0)
				if docstatus == 1
				else None,
			}
		)

	live = link_state == "live"
	has_plan_rows = any(row["row_name"] for row in rows)
	return {
		"department": department,
		"department_warehouse": department_row.get("department_warehouse"),
		"production_plan": plan["name"],
		"docstatus": docstatus,
		"erpnext_status": plan.get("status"),
		"production_state": production_state,
		"link_state": link_state,
		"execution_state": execution_state,
		"can_edit": docstatus == 0 and live,
		"can_submit": docstatus == 0 and live and has_plan_rows,
		"can_prepare": docstatus == 1 and live and execution_state in PREPARABLE_EXECUTION_STATES,
		"blockers": result.get("blockers") or [],
		"totals": {
			"items": len(rows),
			"planned_qty": sum(row["planned_qty"] for row in rows),
			"production_qty": sum(row["production_qty"] for row in rows),
		},
		"items": rows,
	}


def _empty_department(department_row):
	return {
		"department": department_row["name"],
		"department_warehouse": department_row.get("department_warehouse"),
		"production_plan": None,
		"docstatus": None,
		"erpnext_status": None,
		"production_state": None,
		"link_state": "none",
		"execution_state": None,
		"can_edit": False,
		"can_submit": False,
		"can_prepare": False,
		"blockers": [],
		"totals": {"items": 0, "planned_qty": 0.0, "production_qty": 0.0},
		"items": [],
	}


# --- Raw materials -------------------------------------------------------------


@frappe.whitelist(methods=["GET"])
def get_department_raw_materials(production_plan):
	"""Consolidated raw-material requirement for one department Production Plan.

	Uses the same compile and quantity scaling Prepare Production uses, so the
	popup and Prepare agree. Returns::

		{
		    "production_plan", "department", "department_warehouse", "store_warehouse",
		    "rows": [{"item_code", "item_name", "stock_uom", "required_qty",
		              "department_available", "department_shortage",
		              "store_available", "store_shortage"}],
		    "blockers": [...],
		    "totals": {"items", "short_items"},
		}
	"""
	require_chef_ui_access()
	plan = _load_accessible_plan(production_plan)
	sales_plan_doc = frappe.get_doc(SALES_PLAN_DOCTYPE, plan.get(PP_SALES_PLAN_FIELD))
	department = plan.get(PP_DEPARTMENT_FIELD)

	bucket, compile_blockers = _compile_department_bucket(sales_plan_doc, department, production_plan)
	store_warehouse = get_store_warehouse(plan.get("company"))
	readiness = compute_readiness({department: bucket}, store_warehouse=store_warehouse)

	item_names = _item_names(sorted({row["item_code"] for row in readiness["rows"]}))
	rows = [
		{
			"item_code": row["item_code"],
			"item_name": item_names.get(row["item_code"]) or row["item_code"],
			"stock_uom": row.get("stock_uom"),
			"required_qty": flt(row.get("required_qty")),
			"department_available": flt(row.get("department_available")),
			"department_shortage": flt(row.get("department_shortage")),
			"store_available": flt(row.get("store_available")),
			"store_shortage": flt(row.get("store_shortage")),
		}
		for row in sorted(readiness["rows"], key=lambda r: (item_names.get(r["item_code"]) or r["item_code"]))
	]
	return {
		"production_plan": production_plan,
		"department": department,
		"department_warehouse": plan.get(PP_DEPARTMENT_WAREHOUSE_FIELD),
		"store_warehouse": store_warehouse,
		"rows": rows,
		"blockers": list(compile_blockers) + list(readiness["blockers"]),
		"totals": {
			"items": len(rows),
			"short_items": sum(1 for row in rows if row["department_shortage"] > 0 or row["store_shortage"] > 0),
		},
	}


# --- Actions -------------------------------------------------------------------


@frappe.whitelist(methods=["POST"])
def update_production_quantities(production_plan, rows):
	"""Set production quantities on a Draft department Production Plan.

	``rows`` is a list (or JSON string) of ``{"row_name", "item_code",
	"production_qty"}``. A row with a ``row_name`` is a Production Plan Item;
	a sub-assembly that stock already covers has no row, so it is identified
	by ``item_code``.

	- Directly planned items must be greater than 0 (ERPNext requirement).
	- A sub-assembly may be 0 (stock covers it) but never below what the items
	  that use it still need beyond the stock on hand.
	- When a directly planned item changes, the other sub-assemblies are
	  re-derived (what their parents consume minus stock), discarding earlier
	  manual values for them. A sub-assembly edited in this save keeps its value.
	- A sub-assembly row cannot be 0 in ERPNext, so it is removed at 0 and
	  added again when it is set above 0.
	"""
	require_chef_ui_access()
	plan = _load_accessible_plan(production_plan)
	if cint(plan.docstatus) != 0:
		frappe.throw(
			_("{0} is submitted; production quantities can only be changed while it is Draft.").format(production_plan),
			frappe.ValidationError,
		)
	_assert_live(plan)

	if isinstance(rows, str):
		rows = json.loads(rows or "[]")

	by_name = {row.name: row for row in plan.get("po_items")}
	unknown = [row.get("row_name") for row in rows or [] if row.get("row_name") and row.get("row_name") not in by_name]
	if unknown:
		frappe.throw(_("Rows {0} do not belong to {1}.").format(", ".join(map(str, unknown)), production_plan), frappe.ValidationError)

	sales_plan_doc = frappe.get_doc(SALES_PLAN_DOCTYPE, plan.get(PP_SALES_PLAN_FIELD))
	bucket, _blockers = _compile_department_bucket(sales_plan_doc, plan.get(PP_DEPARTMENT_FIELD))
	targets = bucket.get("targets") or []
	target_by_key = {target_key(target): target for target in targets}
	pure_keys = {key for key, target in target_by_key.items() if is_pure_sub_assembly(target)}

	direct_updates = {}  # po row name -> qty
	sub_updates = {}  # (item_code, bom_no) -> qty
	for row in rows or []:
		qty = flt(row.get("production_qty"))
		po_row = by_name.get(row.get("row_name")) if row.get("row_name") else None
		if po_row is not None:
			key = (po_row.item_code, po_row.bom_no)
		else:
			key = next((candidate for candidate in sorted(pure_keys) if candidate[0] == row.get("item_code")), None)
			if key is None:
				frappe.throw(
					_("{0} is not a sub-assembly of this plan.").format(row.get("item_code") or row.get("row_name")),
					frappe.ValidationError,
				)
		if key in pure_keys:
			if qty < 0:
				frappe.throw(_("Production quantity cannot be negative."), frappe.ValidationError)
			sub_updates[key] = qty
		else:
			if qty <= 0:
				frappe.throw(_("Production quantity must be greater than 0."), frappe.ValidationError)
			direct_updates[po_row.name] = qty

	changes = []
	direct = {}
	parents_changed = False
	for row in plan.get("po_items"):
		key = (row.item_code, row.bom_no)
		if key in pure_keys:
			continue
		if row.name in direct_updates and abs(flt(row.planned_qty) - direct_updates[row.name]) > 1e-9:
			changes.append((row.item_code, flt(row.planned_qty), direct_updates[row.name]))
			row.planned_qty = direct_updates[row.name]
			parents_changed = True
		direct[key] = flt(direct.get(key)) + flt(row.planned_qty)

	stock = get_warehouse_stock(
		plan.get(PP_DEPARTMENT_WAREHOUSE_FIELD) or bucket.get("warehouse"),
		[target.get("item_code") for target in targets],
	)
	existing = {(row.item_code, row.bom_no): row for row in plan.get("po_items") if (row.item_code, row.bom_no) in pure_keys}
	if parents_changed:
		final = derive_plan_quantities(targets, direct, stock, overrides=sub_updates)
	else:
		final = {key: flt(existing[key].planned_qty) if key in existing else 0.0 for key in pure_keys}
		final.update(sub_updates)

	plan_date = sales_plan_doc.get("plan_date")
	for key in pure_keys:
		qty = flt(final.get(key))
		row = existing.get(key)
		if qty > 0 and row is None:
			plan.append("po_items", _target_to_production_plan_item(target_by_key[key], plan_date, qty))
			changes.append((key[0], 0.0, qty))
		elif qty > 0 and abs(flt(row.planned_qty) - qty) > 1e-9:
			changes.append((key[0], flt(row.planned_qty), qty))
			row.planned_qty = qty
		elif qty <= 0 and row is not None:
			changes.append((key[0], flt(row.planned_qty), 0.0))
			plan.remove(row)
	for index, row in enumerate(plan.get("po_items"), start=1):
		row.idx = index

	if not changes:
		return {"production_plan": production_plan, "changed": 0}

	planned = {}
	for row in plan.get("po_items"):
		key = (row.item_code, row.bom_no)
		planned[key] = flt(planned.get(key)) + flt(row.planned_qty)
	scaled_targets = apply_quantities_to_bucket(bucket, planned, "zero")["targets"]
	_validate_sub_assembly_cover(scaled_targets, pure_keys, planned, stock)
	validate_dependency_quantities(scaled_targets)

	plan.save()
	_audit(
		plan,
		_("Production quantities changed in Chef UI: {0}").format(
			"; ".join(f"{code} {frappe.format(old)} -> {frappe.format(new)}" for code, old, new in changes)
		),
	)
	return {"production_plan": production_plan, "changed": len(changes)}


def _validate_sub_assembly_cover(scaled_targets, pure_keys, planned, stock):
	"""Throw if a sub-assembly's quantity plus its stock no longer covers what
	the items that use it consume."""
	demand = consumption_by_item(scaled_targets)
	short = []
	for target in scaled_targets:
		key = target_key(target)
		if key not in pure_keys:
			continue
		code = target["item_code"]
		minimum = flt(demand.get(code)) - flt(stock.get(code))
		if flt(planned.get(key)) + 1e-6 < minimum:
			short.append(_("{0}: at least {1}").format(code, frappe.format(minimum)))
	if short:
		frappe.throw(
			_("Sub-assembly quantities are too low for the items that use them (after stock on hand):")
			+ "<br>"
			+ "<br>".join(short),
			frappe.ValidationError,
		)


@frappe.whitelist(methods=["POST"])
def submit_production_plan(production_plan):
	"""Submit a Draft department Production Plan. Its Material Requests are
	generated by the ``on_submit`` hook from the submitted quantities."""
	require_chef_ui_access()
	plan = _load_accessible_plan(production_plan)
	if cint(plan.docstatus) != 0:
		frappe.throw(_("{0} is not a Draft.").format(production_plan), frappe.ValidationError)
	_assert_live(plan)
	plan.submit()
	_audit(plan, _("Submitted in Chef UI (Draft -> Submitted)."))
	return {"production_plan": production_plan, "docstatus": 1}


@frappe.whitelist(methods=["POST"])
def prepare_department_production(production_plan):
	"""Prepare Production for one department plan after the Chef UI access
	and department checks. Delegates to ``prepare_production``."""
	require_chef_ui_access()
	plan = _load_accessible_plan(production_plan)
	_assert_live(plan)
	from_state = plan.get(PP_STATE_FIELD)
	result = prepare_production(production_plan)
	if result.get("status") != "already_processing":
		_audit(
			frappe.get_doc(PRODUCTION_PLAN_DOCTYPE, production_plan),
			_("Prepare Production run from Chef UI ({0} -> {1}).").format(
				from_state or _("not set"), result.get("state") or STATE_PROCESSING
			),
		)
	return result


# --- helpers -------------------------------------------------------------------


def _load_accessible_plan(production_plan):
	if not production_plan or not frappe.db.exists(PRODUCTION_PLAN_DOCTYPE, production_plan):
		frappe.throw(_("Production Plan {0} does not exist.").format(production_plan), frappe.DoesNotExistError)
	plan = frappe.get_doc(PRODUCTION_PLAN_DOCTYPE, production_plan)
	if not plan.get(PP_SALES_PLAN_FIELD):
		frappe.throw(
			_("{0} is not a department Production Plan.").format(production_plan), frappe.ValidationError
		)
	if cint(plan.docstatus) == 2:
		frappe.throw(_("{0} is cancelled.").format(production_plan), frappe.ValidationError)
	assert_department_access(plan.get(PP_DEPARTMENT_FIELD))
	return plan


def _assert_live(plan):
	current_hash = frappe.db.get_value(SALES_PLAN_DOCTYPE, plan.get(PP_SALES_PLAN_FIELD), "approval_snapshot_hash")
	plan_hash = plan.get(PP_HASH_FIELD)
	if plan_hash and plan_hash != current_hash:
		frappe.throw(
			_("{0} is out of date: its Sales Plan has changed since it was created.").format(plan.name),
			frappe.ValidationError,
		)


def _audit(plan, text):
	"""Comment on the Production Plan; the Comment row records user and time."""
	plan.add_comment(
		"Info",
		_("{0} [department {1}]").format(text, plan.get(PP_DEPARTMENT_FIELD)),
	)


def _decode_json(value):
	if not value:
		return None
	if isinstance(value, dict):
		return value
	try:
		return json.loads(value)
	except (TypeError, ValueError):
		return None

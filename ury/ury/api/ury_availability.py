"""Expose server-authoritative item availability with machine-readable diagnostics.

This module is the concrete implementation of V3-40's availability
projection contract (`tracks/sa-v3_nxt/outputs/V3-40-prep-handoff.md`). It is
a pure, READ-ONLY composition over three already-accepted read-only modules:

- `ury_bom_compiler.compile_bom_vector` / `compile_shared_component_index`
  (V3-41) -- BOM explosion for MADE_TO_ORDER items.
- `ury_inventory_projection.get_allocatable_qty` /
  `project_fg_allocatable` / `project_component_allocatable` (V3-42) --
  ERPNext Bin-derived allocatable stock, net of active URY reservations.
- `ury_reservation_service` (V3-43) -- imported so its doctype
  (`URY Stock Reservation`) exists in this app for `ury_inventory_projection`
  and future reservation-aware callers; this module does not call its
  mutating entry points (`create_reservation`/`release_reservation`/etc.) --
  see "Read-only, not reservation" below.

The single whitelisted endpoint is `get_item_availability`. It answers "can
this item be ordered at this branch right now, and why not" for display
purposes (menus, dashboards, KDS). It never reserves, never mutates Bin/
Stock Ledger Entry/menu `disabled` state, and is not a substitute for the
transaction-time authoritative check + reservation that real order
acceptance must still perform against `ury_reservation_service` directly
(V3-40's "Cache, Reservation, and Reconciliation Invariants": "Cached
availability may drive menus, dashboards, and UX, but order acceptance must
re-check transactionally").

## Read-only, not reservation

This endpoint DISPLAYS availability. It does not create, release, fulfil, or
cancel any `URY Stock Reservation`. Reservation creation is a separate,
explicit call to `ury_reservation_service.create_reservation`, made by order
placement code -- that call site is out of this task's scope (V3-45 wires
POS/Captain/QR consumers; the actual order-acceptance transactional check is
a later fulfilment task per V3-40's contract).

## Reconciliation debt: production_policy/department/production_unit/warehouse
## resolution (V3-13/V3-15 dependency gap)

V3-40 states production_policy and department/production-unit/warehouse
scope come from "item/branch/department/unit production configuration from
V3-13/V3-15". Neither V3-13 nor V3-15 is in this worktree (or, as far as
this task's evidence trail shows, merged anywhere yet), so their concrete
DocType/field schema does not exist to import or query against. Rather than
guess a schema and risk baking in an incompatible shape,
`_resolve_production_config` is implemented defensively:

- It checks whether a `URY Item Production Configuration` DocType/table
  exists at all (`frappe.db.table_exists`, wrapped so a missing table never
  raises an unhandled DB error).
- If the table does not exist, it returns `None` -- callers treat that as
  `CONFIGURATION_ERROR` (fail closed), not a guess.
- If the table exists, it reads a single row scoped by `item_code` +
  `branch` (+ `department` when given) via `frappe.db.get_value(..., as_dict=True)`
  requesting a best-guess field list (`production_policy`, `department`,
  `production_unit`, `warehouse`, `disabled`, `production_unit_disabled`,
  `department_disabled`). Any of those fields the real V3-13/V3-15 schema
  names differently will simply come back as `None` on that dict -- this
  function does not fabricate values for missing fields, so downstream
  reason-code logic keeps failing closed (`MISSING_PRODUCTION_UNIT`/
  `MISSING_DEPARTMENT`/`CONFIGURATION_ERROR`) rather than silently
  misreporting availability.

TODO(V3-13/V3-15 merge): once the real DocType lands, replace the guessed
field list in `_resolve_production_config` with the accepted schema's actual
field names and reconcile this function's return shape with whatever
resolution helper V3-13/V3-15 itself exposes (this function may become a
thin wrapper over that helper instead of querying the table directly).

## Reconciliation debt: plan_qty/plan_remaining resolution (V3-23 dependency gap)

Likewise, "approved Sales Plan entitlement" (`URY Sales Plan`, V3-20/V3-23)
is not in this worktree. `_resolve_plan_remaining` is implemented the same
defensive way: `frappe.db.table_exists("URY Sales Plan")` guards against a
missing table, and a best-guess field read (`plan_qty`,
`committed_qty`/`fulfilled_qty`) returns `None` for plan_qty/plan_remaining
when no approved/submitted plan row is found, or when the table does not
exist -- callers treat `plan_qty is None` as `NO_ACTIVE_PLAN` (fail closed).

TODO(V3-23 merge): replace the guessed field list with V3-23's accepted
frozen-snapshot schema (approved qty, committed/fulfilled qty, revision
state) once it exists.

## Server-authoritative branch/company scope

V3-40: "Do not trust client-supplied branch/company scope; derive or verify
it server-side against the session user, POS Profile, document permission,
and the relevant production configuration." There is no live session/POS
Profile context available for wiring in this static-review environment, so
`_verify_branch_scope` is a named, isolated hook: it fails closed (raises)
when `branch`/`company` are missing/empty, and carries a documented TODO for
wiring the real session/POS-Profile/permission check. Every call path in
`get_item_availability` goes through this one function, so that future wiring
requires no change anywhere else in this module.
"""

import math

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime

from ury.ury.api.ury_bom_compiler import compile_bom_vector
from ury.ury.api.ury_production_context import resolve_production_context
from ury.ury.api.ury_inventory_projection import (
	get_allocatable_qty,
	project_component_allocatable,
	project_fg_allocatable,
)

# Imported for its side effect of making `URY Stock Reservation` a real,
# loaded doctype module in this app (ury_inventory_projection's reservation
# hook and any future reservation-aware caller depend on it existing) --
# not because this module calls any of its mutating entry points.
import ury.ury.api.ury_reservation_service  # noqa: F401


PRODUCTION_CONFIG_DOCTYPE = "URY Item Production Configuration"
SALES_PLAN_DOCTYPE = "URY Sales Plan"

POLICY_PRE_PRODUCED = "PRE_PRODUCED"
POLICY_MADE_TO_ORDER = "MADE_TO_ORDER"
POLICY_DIRECT_RETAIL = "DIRECT_RETAIL"


def _verify_branch_scope(user, branch, company):
	"""Fail closed unless `branch`/`company` are present, then verify the
	caller is actually assigned to `branch` (and that `branch` belongs to
	`company`) before any availability data for it is returned.

	Mirrors the branch-assignment check used elsewhere in this codebase
	(e.g. `ury/ury_pos/api.py:getBranch()` and
	`self_ordering.py:assign_device_table()`'s table-branch check): a user
	is scoped to a branch via the `URY User` child table on `Branch`
	(`tabURY User.parent == Branch.name`, `tabURY User.user == user`).
	System Manager / URY Admin are treated as branch-agnostic staff who
	manage availability across branches, consistent with the manager-role
	handling in `ury_kot_item_execution_service.py`.
	"""
	if not branch or not company:
		frappe.throw(_("Branch and company are required"), frappe.ValidationError)

	if user == "Administrator":
		return

	roles = set(frappe.get_roles(user))
	if roles & {"System Manager", "URY Admin"}:
		return

	branch_company = frappe.db.get_value("Branch", branch, "company")
	if branch_company and branch_company != company:
		frappe.throw(_("Branch does not belong to the given company"), frappe.PermissionError)

	assigned = frappe.db.exists("URY User", {"parenttype": "Branch", "parent": branch, "user": user})
	if not assigned:
		frappe.throw(_("You are not permitted to view availability for this branch"), frappe.PermissionError)


def _resolve_production_config(item_code, branch, company, department=None):
	"""Read item/branch/(department) production config; `None` if unresolvable.

	See module docstring's "Reconciliation debt: production_policy/..."
	section -- this is a defensive, guessed-schema read against a DocType
	that may not exist yet (V3-13/V3-15 dependency). Returns `None` (not an
	exception) when the table is absent or no matching row exists, so callers
	can fail closed with `CONFIGURATION_ERROR` rather than crash.

	Returns (when resolved) a `frappe._dict` with whichever of these keys the
	underlying table actually has (missing ones come back `None`), so callers
	may use either attribute (`config.production_policy`) or dict-style
	(`config.get("production_policy")`) access -- this matches the shape
	`resolve_production_context` (the authoritative production resolver this
	adapter wraps) itself already returns:
		production_policy, department, production_unit, warehouse,
		production_unit_disabled, department_disabled
	"""
	row = resolve_production_context(item_code, branch, company=company, department=department)
	if not row:
		return None
	return frappe._dict(
		{
			"production_policy": row.get("production_policy"),
			"department": row.get("department"),
			"production_unit": row.get("production_unit"),
			"warehouse": row.get("warehouse"),
			"direct_retail_warehouse": row.get("direct_retail_warehouse"),
			"controlled_by_sales_plan": row.get("controlled_by_sales_plan"),
			"allow_over_plan_sale": row.get("allow_over_plan_sale"),
			"availability_mode": row.get("availability_mode"),
			"production_unit_disabled": row.get("production_unit_disabled", 0),
			"department_disabled": row.get("department_disabled", 0),
		}
	)


def _resolve_plan_remaining(item_code, branch, company, department=None):
	"""Read approved plan qty/remaining for `item_code`; `None` if unresolvable.

	See module docstring's "Reconciliation debt: plan_qty/plan_remaining..."
	section (V3-23 dependency). Returns `None` (not an exception) when the
	table is absent or no approved/submitted plan row is found -- callers
	treat that as `NO_ACTIVE_PLAN`.

	`URY Sales Plan` stores per-item quantities in its `items` child table
	(`URY Sales Plan Item`: `item_code`, `qty`, ...), not on the parent --
	the parent only carries scope/status fields (`branch`, `company`,
	`status`, `plan_date`, ...). `URY Sales Plan` is NOT a submittable
	doctype (`is_submittable` unset in its JSON), so `docstatus` is always
	0 for every row -- its approval workflow is tracked entirely via the
	`status` field, not Frappe's submit mechanism. A `docstatus: 1` filter
	here was a bug: it made this query match zero rows on any site,
	regardless of how many plans were genuinely `Approved`/`Locked for
	Production` (found live, tracing why a real seeded-and-approved plan
	was still invisible to this resolver). This resolves the parent
	plan(s) in scope for today's service date and an active `status`
	(`Approved`/`Locked for Production` -- excluding `Draft`/`Proposed`/
	`Submitted for Approval`/`Superseded/Cancelled`), then sums the
	matching child rows, following the same `parent`/`parenttype`
	child-table query convention used elsewhere in this codebase (e.g.
	`ury_bom_compiler.py`) rather than `frappe.db.get_value`
	against nonexistent parent columns.

	`committed_qty`/`fulfilled_qty` have no backing column anywhere in the
	current schema (parent or child) -- V3-23's frozen-snapshot schema is
	still pending (see module docstring); until it lands, committed/fulfilled
	is treated as 0, so `plan_remaining == plan_qty`. TODO(V3-23 merge):
	replace with the real committed/fulfilled tracking once it exists.

	Returns (when resolved) a dict: {"plan_qty": ..., "plan_remaining": ...}
	"""
	if not frappe.db.table_exists(SALES_PLAN_DOCTYPE):
		return None

	# Scope to plans that are still in force for today's service date and in
	# an active status -- an unfiltered query sums every submitted plan in
	# the branch/company's entire history, including Superseded/Cancelled
	# ones, so plan_qty/plan_remaining would inflate without bound.
	plan_filters = {
		"branch": branch,
		"company": company,
		"status": ["in", ["Approved", "Locked for Production"]],
		"plan_date": getdate(),
	}
	plan_names = frappe.get_all(SALES_PLAN_DOCTYPE, filters=plan_filters, pluck="name")
	if not plan_names:
		return None

	item_filters = {"parent": ["in", plan_names], "item_code": item_code}
	if department:
		item_filters["department"] = department

	rows = frappe.get_all(
		"URY Sales Plan Item",
		filters=item_filters,
		fields=["qty"],
	)
	if not rows:
		return None

	plan_qty = sum(row.get("qty") or 0 for row in rows)
	if not plan_qty:
		return None

	committed = 0
	fulfilled = 0
	plan_remaining = plan_qty - committed - fulfilled
	return {"plan_qty": plan_qty, "plan_remaining": plan_remaining}


def _base_response(item_code, company, branch, department, production_policy):
	return {
		"item_code": item_code,
		"sellable": False,
		"available_qty": 0,
		"production_policy": production_policy,
		"company": company,
		"branch": branch,
		"department": department,
		"production_unit": None,
		"warehouse": None,
		"plan_qty": None,
		"plan_remaining": None,
		"fg_available": None,
		"max_producible": None,
		"blocking_component": None,
		"reason_code": "CONFIGURATION_ERROR",
		"as_of": now_datetime(),
	}


def _fail_closed(item_code, company, branch, department, production_policy, reason_code):
	response = _base_response(item_code, company, branch, department, production_policy)
	response["reason_code"] = reason_code
	return response


@frappe.whitelist(allow_guest=False)
def get_item_availability(item_code, branch, company, department=None):
	"""Return V3-40's minimum response shape for `item_code` at `branch`/`company`.

	Read-only display endpoint -- see module docstring for the full contract,
	reservation-vs-display distinction, and the V3-13/V3-15/V3-23
	reconciliation debt this function's helpers document.

	Scope is server-verified (fail-closed only, pending real session wiring;
	see `_verify_branch_scope`) and never trusted purely from client input
	beyond that presence check. All reads are scoped strictly to the given
	`branch`/`company`/(`department`) -- no cross-branch or cross-company
	aggregation.
	"""
	if not item_code:
		frappe.throw(_("Item code is required"), frappe.ValidationError)

	_verify_branch_scope(frappe.session.user, branch, company)

	config = _resolve_production_config(item_code, branch, company, department)
	if config is None:
		return _fail_closed(item_code, company, branch, department, None, "CONFIGURATION_ERROR")

	production_policy = config.get("production_policy")
	resolved_department = config.get("department") or department
	production_unit = config.get("production_unit")
	warehouse = config.get("warehouse")

	if not resolved_department:
		return _fail_closed(
			item_code, company, branch, resolved_department, production_policy, "MISSING_DEPARTMENT"
		)

	if config.get("department_disabled"):
		return _fail_closed(
			item_code, company, branch, resolved_department, production_policy, "DEPARTMENT_DISABLED"
		)

	if not production_policy:
		return _fail_closed(
			item_code, company, branch, resolved_department, production_policy, "CONFIGURATION_ERROR"
		)

	if production_policy in (POLICY_PRE_PRODUCED, POLICY_MADE_TO_ORDER) and not production_unit:
		return _fail_closed(
			item_code, company, branch, resolved_department, production_policy, "MISSING_PRODUCTION_UNIT"
		)

	if production_policy in (POLICY_PRE_PRODUCED, POLICY_MADE_TO_ORDER) and config.get(
		"production_unit_disabled"
	):
		return _fail_closed(
			item_code, company, branch, resolved_department, production_policy, "PRODUCTION_UNIT_DISABLED"
		)

	if not warehouse:
		return _fail_closed(
			item_code, company, branch, resolved_department, production_policy, "CONFIGURATION_ERROR"
		)

	response = _base_response(item_code, company, branch, resolved_department, production_policy)
	response["production_unit"] = production_unit
	response["warehouse"] = warehouse

	if production_policy == POLICY_PRE_PRODUCED:
		_fill_pre_produced(response, item_code, branch, company, resolved_department, warehouse, config)
	elif production_policy == POLICY_MADE_TO_ORDER:
		_fill_made_to_order(response, item_code, branch, company, resolved_department, warehouse, config)
	elif production_policy == POLICY_DIRECT_RETAIL:
		_fill_direct_retail(response, item_code, branch, company, warehouse)
	else:
		response["reason_code"] = "CONFIGURATION_ERROR"
		return response

	# TODO(availability_mode semantics): The `availability_mode` field has three
	# documented options ("Always Available", "Stock Available", "Plan Available")
	# but its intended semantics are not documented in the codebase. As a
	# conservative interpretation, if availability_mode is "Always Available",
	# override the computed reason_code to allow the item to be sold regardless
	# of plan/stock constraints. For other modes, use the default computed logic.
	# This TODO should be resolved once availability_mode's intended semantics
	# are documented in a follow-up task (likely V3-13/V3-15 or a later task).
	availability_mode = config.get("availability_mode") if config else None
	if availability_mode == "Always Available":
		response["reason_code"] = "AVAILABLE"
		response["sellable"] = True

	return response


def _fill_pre_produced(response, item_code, branch, company, department, warehouse, config=None):
	"""Fill `response` in place for a PRE_PRODUCED item, per V3-40's formula.

	`effective_available = min(plan_remaining, fg_allocatable)`. Reason-code
	priority (per this task's spec): NOT_PRODUCED (fg_available<=0 and never
	produced, i.e. no Bin.actual_qty ever recorded) takes precedence, then
	PLAN_EXHAUSTED, then FG_OUT_OF_STOCK, else AVAILABLE. A missing/absent
	plan is reported as NO_ACTIVE_PLAN before any of those, unless
	`controlled_by_sales_plan` is False, in which case the item falls through
	to stock-based availability.
	"""
	fg_projection = project_fg_allocatable(item_code, warehouse, company)
	fg_available = fg_projection["allocatable_qty"]
	never_produced = (fg_projection["bin_actual_qty"] or 0) <= 0

	response["fg_available"] = fg_available
	response["max_producible"] = fg_available

	plan = _resolve_plan_remaining(item_code, branch, company, department)
	if plan is None:
		# If controlled_by_sales_plan is False, plan is optional and the item
		# should be available based on stock alone. If True (default), fail closed.
		controlled_by_sales_plan = config.get("controlled_by_sales_plan", 1) if config else 1
		if not controlled_by_sales_plan:
			# Plan gate is disabled for this item; evaluate stock-based availability
			effective_available = fg_available
			response["available_qty"] = max(effective_available, 0)
			if fg_available <= 0 and never_produced:
				response["reason_code"] = "NOT_PRODUCED"
				response["sellable"] = False
			elif fg_available <= 0:
				response["reason_code"] = "FG_OUT_OF_STOCK"
				response["sellable"] = False
			else:
				response["reason_code"] = "AVAILABLE"
				response["sellable"] = effective_available > 0
		else:
			# Plan gate is enabled; fail closed without an active plan
			response["reason_code"] = "NO_ACTIVE_PLAN"
			response["sellable"] = False
			response["available_qty"] = 0
		return

	response["plan_qty"] = plan["plan_qty"]
	response["plan_remaining"] = plan["plan_remaining"]

	effective_available = min(plan["plan_remaining"], fg_available)
	response["available_qty"] = max(effective_available, 0)

	if fg_available <= 0 and never_produced:
		response["reason_code"] = "NOT_PRODUCED"
		response["sellable"] = False
	elif plan["plan_remaining"] <= 0:
		# If allow_over_plan_sale is True, allow selling past the plan quantity.
		allow_over_plan_sale = config.get("allow_over_plan_sale", 0) if config else 0
		if allow_over_plan_sale and fg_available > 0:
			# Plan exhausted but over-plan sales are allowed; use stock availability
			response["reason_code"] = "AVAILABLE"
			response["sellable"] = fg_available > 0
			response["available_qty"] = max(fg_available, 0)
		else:
			response["reason_code"] = "PLAN_EXHAUSTED"
			response["sellable"] = False
	elif fg_available <= 0:
		response["reason_code"] = "FG_OUT_OF_STOCK"
		response["sellable"] = False
	else:
		response["reason_code"] = "AVAILABLE"
		response["sellable"] = effective_available > 0


def _fill_made_to_order(response, item_code, branch, company, department, warehouse, config=None):
	"""Fill `response` in place for a MADE_TO_ORDER item, per V3-40's formula.

	`recipe_capacity = floor(min(component_allocatable_i / required_qty_i))`;
	`effective_available = min(plan_remaining, recipe_capacity)`.
	`blocking_component` is set to the limiting component's item_code
	whenever recipe_capacity is the binding constraint (i.e. whenever
	recipe_capacity < plan_remaining, or there is no plan and
	recipe_capacity <= 0), per this task's spec. If `controlled_by_sales_plan`
	is False, plan is optional and the item falls through to capacity-based
	availability. If `allow_over_plan_sale` is True, PLAN_EXHAUSTED can be
	overridden by available recipe capacity.
	"""
	try:
		bom_vector = compile_bom_vector(item_code, 1, company)
	except frappe.ValidationError:
		response["reason_code"] = "MISSING_BOM"
		response["sellable"] = False
		response["available_qty"] = 0
		return

	components = bom_vector["components"]
	component_items = [row["component_item"] for row in components]
	allocatable_by_component = project_component_allocatable(component_items, warehouse, company)

	recipe_capacity = None
	blocking_component = None
	for row in components:
		component_item = row["component_item"]
		qty_per_unit = row["qty_per_unit"]
		if not qty_per_unit:
			continue
		allocatable_qty = allocatable_by_component[component_item]["allocatable_qty"]
		component_capacity = math.floor(allocatable_qty / qty_per_unit)
		if recipe_capacity is None or component_capacity < recipe_capacity:
			recipe_capacity = component_capacity
			blocking_component = component_item

	recipe_capacity = recipe_capacity if recipe_capacity is not None else 0
	recipe_capacity = max(recipe_capacity, 0)

	response["max_producible"] = recipe_capacity

	plan = _resolve_plan_remaining(item_code, branch, company, department)
	if plan is None:
		# If controlled_by_sales_plan is False, plan is optional and the item
		# should be available based on recipe capacity alone. If True (default), fail closed.
		controlled_by_sales_plan = config.get("controlled_by_sales_plan", 1) if config else 1
		if not controlled_by_sales_plan:
			# Plan gate is disabled for this item; evaluate capacity-based availability
			response["available_qty"] = max(recipe_capacity, 0)
			if recipe_capacity <= 0:
				response["reason_code"] = "BLOCKING_COMPONENT"
				response["sellable"] = False
				response["blocking_component"] = blocking_component
			else:
				response["reason_code"] = "AVAILABLE"
				response["sellable"] = True
		else:
			# Plan gate is enabled; fail closed without an active plan
			response["reason_code"] = "NO_ACTIVE_PLAN"
			response["sellable"] = False
			response["available_qty"] = 0
		return

	response["plan_qty"] = plan["plan_qty"]
	response["plan_remaining"] = plan["plan_remaining"]

	effective_available = min(plan["plan_remaining"], recipe_capacity)
	response["available_qty"] = max(effective_available, 0)

	if recipe_capacity < plan["plan_remaining"]:
		response["blocking_component"] = blocking_component

	if recipe_capacity <= 0:
		response["reason_code"] = "BLOCKING_COMPONENT"
		response["sellable"] = False
	elif plan["plan_remaining"] <= 0:
		# If allow_over_plan_sale is True, allow selling past the plan quantity.
		allow_over_plan_sale = config.get("allow_over_plan_sale", 0) if config else 0
		if allow_over_plan_sale and recipe_capacity > 0:
			# Plan exhausted but over-plan sales are allowed; use capacity.
			# No blocking component in this case since we have available capacity.
			response["reason_code"] = "AVAILABLE"
			response["sellable"] = True
			response["available_qty"] = max(recipe_capacity, 0)
		else:
			response["reason_code"] = "PLAN_EXHAUSTED"
			response["sellable"] = False
	else:
		response["reason_code"] = "AVAILABLE"
		response["sellable"] = effective_available > 0


def _fill_direct_retail(response, item_code, branch, company, warehouse):
	"""Fill `response` in place for a DIRECT_RETAIL item.

	Per V3-40: "availability is based on allocatable stock in the relevant
	branch/department warehouse, still subject to reservation and final
	transaction-time validation." No plan/BOM concept applies.
	"""
	allocatable = get_allocatable_qty(item_code, warehouse, company)
	available_qty = allocatable["allocatable_qty"]

	response["fg_available"] = available_qty
	response["max_producible"] = available_qty
	response["available_qty"] = max(available_qty, 0)

	if available_qty <= 0:
		response["reason_code"] = "FG_OUT_OF_STOCK"
		response["sellable"] = False
	else:
		response["reason_code"] = "AVAILABLE"
		response["sellable"] = True

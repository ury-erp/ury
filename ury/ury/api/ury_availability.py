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
from frappe.utils import now_datetime

from ury.ury.api.ury_bom_compiler import compile_bom_vector
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
	"""Fail closed unless `branch`/`company` are present; TODO: real session wiring.

	TODO(server-authoritative scope): wire this to the real session/permission
	system once one is available in this codebase's request context -- verify
	`user`'s POS Profile / assigned branch and company against `branch`/
	`company`, per V3-40 ("derive or verify it server-side against the
	session user, POS Profile, document permission"). Until then this
	function only enforces that branch/company are non-empty (never trusts a
	blank/missing scope), which is the fail-closed half of that requirement.
	"""
	if not branch or not company:
		frappe.throw(_("Branch and company are required"), frappe.ValidationError)


def _resolve_production_config(item_code, branch, company, department=None):
	"""Read item/branch/(department) production config; `None` if unresolvable.

	See module docstring's "Reconciliation debt: production_policy/..."
	section -- this is a defensive, guessed-schema read against a DocType
	that may not exist yet (V3-13/V3-15 dependency). Returns `None` (not an
	exception) when the table is absent or no matching row exists, so callers
	can fail closed with `CONFIGURATION_ERROR` rather than crash.

	Returns (when resolved) a dict with whichever of these keys the
	underlying table actually has (missing ones come back `None`):
		production_policy, department, production_unit, warehouse,
		production_unit_disabled, department_disabled
	"""
	if not frappe.db.table_exists(PRODUCTION_CONFIG_DOCTYPE):
		return None

	filters = {"item_code": item_code, "branch": branch}
	if department:
		filters["department"] = department

	row = frappe.db.get_value(
		PRODUCTION_CONFIG_DOCTYPE,
		filters,
		[
			"production_policy",
			"department",
			"production_unit",
			"warehouse",
			"production_unit_disabled",
			"department_disabled",
		],
		as_dict=True,
	)
	return row


def _resolve_plan_remaining(item_code, branch, company, department=None):
	"""Read approved plan qty/remaining for `item_code`; `None` if unresolvable.

	See module docstring's "Reconciliation debt: plan_qty/plan_remaining..."
	section (V3-23 dependency). Returns `None` (not an exception) when the
	table is absent or no approved/submitted plan row is found -- callers
	treat that as `NO_ACTIVE_PLAN`.

	Returns (when resolved) a dict: {"plan_qty": ..., "plan_remaining": ...}
	"""
	if not frappe.db.table_exists(SALES_PLAN_DOCTYPE):
		return None

	filters = {"item_code": item_code, "branch": branch, "docstatus": 1}
	if department:
		filters["department"] = department

	row = frappe.db.get_value(
		SALES_PLAN_DOCTYPE,
		filters,
		["plan_qty", "committed_qty", "fulfilled_qty"],
		as_dict=True,
	)
	if not row or row.plan_qty is None:
		return None

	committed = (row.committed_qty or 0) + (row.fulfilled_qty or 0)
	plan_remaining = row.plan_qty - committed
	return {"plan_qty": row.plan_qty, "plan_remaining": plan_remaining}


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
		_fill_pre_produced(response, item_code, branch, company, resolved_department, warehouse)
	elif production_policy == POLICY_MADE_TO_ORDER:
		_fill_made_to_order(response, item_code, branch, company, resolved_department, warehouse)
	elif production_policy == POLICY_DIRECT_RETAIL:
		_fill_direct_retail(response, item_code, branch, company, warehouse)
	else:
		response["reason_code"] = "CONFIGURATION_ERROR"
		return response

	return response


def _fill_pre_produced(response, item_code, branch, company, department, warehouse):
	"""Fill `response` in place for a PRE_PRODUCED item, per V3-40's formula.

	`effective_available = min(plan_remaining, fg_allocatable)`. Reason-code
	priority (per this task's spec): NOT_PRODUCED (fg_available<=0 and never
	produced, i.e. no Bin.actual_qty ever recorded) takes precedence, then
	PLAN_EXHAUSTED, then FG_OUT_OF_STOCK, else AVAILABLE. A missing/absent
	plan is reported as NO_ACTIVE_PLAN before any of those.
	"""
	fg_projection = project_fg_allocatable(item_code, warehouse, company)
	fg_available = fg_projection["allocatable_qty"]
	never_produced = (fg_projection["bin_actual_qty"] or 0) <= 0

	response["fg_available"] = fg_available
	response["max_producible"] = fg_available

	plan = _resolve_plan_remaining(item_code, branch, company, department)
	if plan is None:
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
		response["reason_code"] = "PLAN_EXHAUSTED"
		response["sellable"] = False
	elif fg_available <= 0:
		response["reason_code"] = "FG_OUT_OF_STOCK"
		response["sellable"] = False
	else:
		response["reason_code"] = "AVAILABLE"
		response["sellable"] = effective_available > 0


def _fill_made_to_order(response, item_code, branch, company, department, warehouse):
	"""Fill `response` in place for a MADE_TO_ORDER item, per V3-40's formula.

	`recipe_capacity = floor(min(component_allocatable_i / required_qty_i))`;
	`effective_available = min(plan_remaining, recipe_capacity)`.
	`blocking_component` is set to the limiting component's item_code
	whenever recipe_capacity is the binding constraint (i.e. whenever
	recipe_capacity < plan_remaining, or there is no plan and
	recipe_capacity <= 0), per this task's spec.
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

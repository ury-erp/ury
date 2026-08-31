"""Maintain a read-only operational inventory projection and reconciliation.

This module is a pure, read-only reader over ERPNext's stock data model
(`Bin`). It performs NO writes to `Bin`, `Stock Ledger Entry`, or any other
ERPNext stock document. ERPNext's Bin/Stock Ledger Entry remain the durable
stock truth; everything this module computes ("projection") is derived,
advisory, operational state per V3-40's "Cache, Reservation, and
Reconciliation Invariants" (see
`tracks/sa-v3_nxt/outputs/V3-40-prep-handoff.md`). It must never be called
from, or call into, the live order path (POS Invoice / order acceptance) --
order acceptance must re-check transactionally against ERPNext, not against
this projection.

Four entry points:

- `get_allocatable_qty(item_code, warehouse, company)`: ERPNext Bin stock for
  one item/warehouse minus active URY reservation qty for that item/
  warehouse.
- `project_fg_allocatable(item_code, warehouse, company)`: V3-40's
  pre-produced formula --
  `fg_allocatable = ERPNext actual/projected department FG stock - active URY reservations`.
- `project_component_allocatable(component_items, warehouse, company)`: for
  MTO items, per-component allocatable stock (one call to
  `get_allocatable_qty` per component), keyed by component_item -- consumes
  the component list shape produced by
  `ury_bom_compiler.compile_bom_vector`/`compile_shared_component_index`
  (each component row's `component_item`).
- `reconcile_projection(item_code, warehouse, company, cached_qty)`: a pure
  comparison between a caller-supplied cached/projected qty and a freshly
  read ERPNext Bin snapshot; returns a drift record when they differ.

## Reservation stub (V3-43 dependency gap)

V3-40's formulas subtract "active URY reservations" from ERPNext stock, but
the reservation doctype/state machine (`Reserved`/`Fulfilled`/`Released`/
`Expired`/`Cancelled`, per V3-40's Cache/Reservation/Reconciliation
Invariants) is V3-43's scope, not this task's. `active_ury_reservation_qty`
is therefore a documented stub that always returns 0. It is the single hook
point this module calls for reservation qty, so V3-43 only has to replace
this one function's body (querying its new reservation doctype) with no
change required to `get_allocatable_qty`, `project_fg_allocatable`, or
`project_component_allocatable`. TODO(V3-43): replace this stub with a real
query against the reservation doctype V3-43 introduces, scoped by item,
warehouse, and company, summing qty for reservations in an "active" state
(`Reserved`/`Fulfilled`, i.e. not yet `Released`/`Expired`/`Cancelled`).

## Reconciliation is a pure comparison, not a cache store

`reconcile_projection` intentionally does not read or write any persistent
cache -- it accepts `cached_qty` as a parameter and diffs it against a fresh
Bin read. V3-40's invariants describe "cached availability" driving menus/
dashboards/UX, which implies a persistent projection cache (and an
invalidation-event listener) will eventually be needed; building that cache
store/doctype is out of this task's scope. TODO(future task): if a
persistent projection cache is required, add a cache-store doctype/table and
have it call `reconcile_projection` (or an equivalent) on each of V3-40's
listed invalidation events (submitted Stock Entry, submitted Stock
Reconciliation, POS reservation created/released, order cancellation, BOM
submit/change, production policy change, production completion, wastage,
department issue/return).

## Missing-Bin handling: explicit zero, not fail-closed

When an item/warehouse combination has no `Bin` row at all, ERPNext has no
stock ledger entries against that combination, which is operationally
equivalent to zero actual/projected quantity there (this is also how
ERPNext's own stock reports treat a missing Bin). This module therefore
treats a missing Bin as qty=0 explicitly, for both `get_allocatable_qty`
(and therefore `project_fg_allocatable`/`project_component_allocatable`) and
`reconcile_projection`'s freshly-read `actual_qty`. This is a deliberate
choice, not the fail-closed alternative (raising/blocking) -- see
`test_ury_inventory_projection.py::test_reconcile_projection_missing_bin` for
the behavior this documents.
"""

import frappe
from frappe.utils import now_datetime


BIN_DOCTYPE = "Bin"


def active_ury_reservation_qty(item_code, warehouse, company):
	"""Return active URY reservation qty for `item_code`/`warehouse`/`company`.

	STUB: V3-43 has not yet built the reservation doctype/state machine
	described in V3-40 (Reserved/Fulfilled/Released/Expired/Cancelled). This
	function always returns 0 until V3-43 lands; see the module docstring's
	"Reservation stub" section for what V3-43 needs to change here (and
	nowhere else in this module).

	`company` is accepted (not just item_code/warehouse) because V3-40 scopes
	reservations by branch/company/warehouse/item/policy/order, so the real
	implementation will need it even though the stub ignores it.
	"""
	return 0


def get_allocatable_qty(item_code, warehouse, company):
	"""Return ERPNext Bin stock for `item_code`/`warehouse` minus active reservations.

	Reads `Bin.actual_qty` and `Bin.projected_qty` read-only via
	`frappe.db.get_value`. Uses `projected_qty` as the allocatable base
	(ERPNext's own forward-looking figure, i.e. actual_qty adjusted for
	reserved/ordered/planned quantities already known to ERPNext), then
	further subtracts URY's own active reservation qty on top of that, per
	V3-40's formula. A missing Bin row is treated as actual_qty=0,
	projected_qty=0 (see module docstring), not as an error.

	Returns a dict:
		{
			"item_code": item_code,
			"warehouse": warehouse,
			"company": company,
			"bin_actual_qty": ...,
			"bin_projected_qty": ...,
			"ury_reservation_qty": ...,
			"allocatable_qty": ...,
		}
	"""
	bin_row = frappe.db.get_value(
		BIN_DOCTYPE,
		{"item_code": item_code, "warehouse": warehouse},
		["actual_qty", "projected_qty"],
		as_dict=True,
	)

	bin_actual_qty = bin_row.actual_qty if bin_row else 0
	bin_projected_qty = bin_row.projected_qty if bin_row else 0

	reservation_qty = active_ury_reservation_qty(item_code, warehouse, company)

	allocatable_qty = (bin_projected_qty or 0) - (reservation_qty or 0)

	return {
		"item_code": item_code,
		"warehouse": warehouse,
		"company": company,
		"bin_actual_qty": bin_actual_qty or 0,
		"bin_projected_qty": bin_projected_qty or 0,
		"ury_reservation_qty": reservation_qty or 0,
		"allocatable_qty": allocatable_qty,
	}


def project_fg_allocatable(item_code, warehouse, company):
	"""Pre-produced finished-goods allocatable stock, per V3-40's formula.

	`fg_allocatable = ERPNext actual/projected department FG stock - active URY reservations`

	`warehouse` is the department FG warehouse for this item/company. This is
	a thin, named wrapper over `get_allocatable_qty` -- kept as a distinct
	entry point because callers building fg_allocatable-based effective-
	availability logic (V3-40's `effective_available = min(plan_remaining,
	fg_allocatable)`) should call this function by name rather than the
	generic one, for readability and so future FG-specific adjustments (e.g.
	a different Bin field, or FG-specific reservation scoping) have a single
	place to land without touching component projection.

	Returns the same shape as `get_allocatable_qty`, with `allocatable_qty`
	representing `fg_allocatable`.
	"""
	return get_allocatable_qty(item_code, warehouse, company)


def project_component_allocatable(component_items, warehouse, company):
	"""Per-component allocatable stock for MTO items, per V3-40's formula.

	`component_allocatable_i = ERPNext department component stock - active URY component reservations`

	`component_items` is an iterable of component item codes (e.g. the
	`component_item` values from `ury_bom_compiler.compile_bom_vector`'s
	`components` list, or the keys of `compile_shared_component_index`'s
	returned index) -- this function does not itself call the BOM compiler;
	callers pass the component item codes they already resolved.

	`warehouse` is the department component warehouse shared by all the
	given components for this `company` (the BOM compiler and its callers
	are responsible for warehouse resolution; this function does not infer
	warehouse per component).

	Returns a dict keyed by component_item:
		{
			component_item: <get_allocatable_qty(...) result dict>,
			...
		}

	Duplicate component_items are de-duped (each is only queried once).
	"""
	component_items = list(dict.fromkeys(component_items))  # de-dupe, preserve order

	return {
		component_item: get_allocatable_qty(component_item, warehouse, company)
		for component_item in component_items
	}


def reconcile_projection(item_code, warehouse, company, cached_qty):
	"""Compare a caller-supplied cached/projected qty against a fresh Bin read.

	Pure comparison function -- does not read from or write to any
	persistent cache store (see module docstring). `cached_qty` is whatever
	the caller previously projected/cached for this item/warehouse/company
	(e.g. a prior `get_allocatable_qty(...)["allocatable_qty"]`).

	The fresh "actual" value read here is `Bin.actual_qty` (not
	`projected_qty`) because reconciliation is about detecting drift against
	ERPNext's durable, already-posted stock truth, not against ERPNext's own
	forward-looking projection -- projected_qty already bakes in ERPNext's
	own reservations/planned movements, which would make drift detection
	compare a projection against another projection instead of against
	ledger-backed truth.

	A missing Bin row is treated as actual_qty=0, not as an error (see
	module docstring's "Missing-Bin handling" section) -- reconciliation
	still runs and can report drift (e.g. a nonzero cached_qty against an
	absent/zeroed-out Bin is itself meaningful drift, not a failure).

	Returns None when `cached_qty` matches the fresh Bin actual_qty exactly.
	Otherwise returns a drift record:
		{
			"item_code": item_code,
			"warehouse": warehouse,
			"company": company,
			"cached_qty": cached_qty,
			"actual_qty": actual_qty,
			"drift": actual_qty - cached_qty,
			"reason": "bin_actual_qty_mismatch" | "bin_row_missing",
			"as_of": <datetime>,
		}
	"""
	bin_actual_qty = frappe.db.get_value(
		BIN_DOCTYPE,
		{"item_code": item_code, "warehouse": warehouse},
		"actual_qty",
	)

	bin_row_missing = bin_actual_qty is None
	actual_qty = bin_actual_qty or 0

	if cached_qty == actual_qty:
		return None

	return {
		"item_code": item_code,
		"warehouse": warehouse,
		"company": company,
		"cached_qty": cached_qty,
		"actual_qty": actual_qty,
		"drift": actual_qty - cached_qty,
		"reason": "bin_row_missing" if bin_row_missing else "bin_actual_qty_mismatch",
		"as_of": now_datetime(),
	}

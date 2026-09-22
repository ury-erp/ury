"""Read-only readiness engine for the URY Production Plan Automation feature.

This is the third layer of the three-layer architecture described in
``ongoing/production-plan-automation/PLAN.md`` ("Architecture: three separate
layers", section C):

    BOM Tree Service (ury_bom_tree.walk_bom_tree)
        | structural quantities, no URY semantics
    Production Target Compiler (ury_production_target_compiler)
        | department targets, dependency order, component vectors
    Readiness Engine (this module)
        | purchase, transfer and stock blockers

One entry point:

    compute_readiness(departments, store_warehouse=None)

``departments`` is exactly the dict shape returned by
``ury_production_target_compiler.compile_production_targets`` -- keyed by
department name, each bucket carrying ``warehouse`` (the Department
Warehouse, D13), ``targets`` (each with a ``component_vector`` to explode),
``external_receipt_targets`` (D19), and ``raw_material_demand`` (a
MADE_TO_ORDER row's own raw materials that never became a target).

This module never traverses a BOM and never decides production policy (see
PLAN.md, section C): the component vector for every target already arrived
pre-exploded from the target compiler. A caller may pass the full dict for a
whole Sales Plan (what Purchase MR generation needs) or a single
department's bucket wrapped in a one-entry dict (what Agent 5/8 need when
revalidating one department under Bin locks, D17) -- this module has no
notion of a Sales Plan or a persisted Production Plan document at all; it
only ever sees the shape the target compiler already produces.

## D19 -- EXTERNAL_RECEIPT demand is never lost

``sourcing_mode = EXTERNAL_RECEIPT`` targets are deliberately absent from a
department's compiled ``targets`` component vectors and from
``po_items``/Work Orders (Agent 3's decision) -- they are received, not
manufactured. But the item itself still has to reach a warehouse from
somewhere, so this module treats each ``external_receipt_targets`` entry as
its own demand row (the target's ``item_code`` at its ``required_qty``,
exactly as if it were a raw material in someone else's component vector).
That is the only path by which EXTERNAL_RECEIPT demand reaches the Purchase
requirement; if this module silently skipped ``external_receipt_targets``,
that demand would vanish from the whole system.

## MADE_TO_ORDER raw materials are never lost either

The same failure mode applies to ``raw_material_demand``: a MADE_TO_ORDER
row's own raw materials never become a target (an MTO item is produced only
from the actual order, never in advance), so the only way they reach the
Purchase/Transfer requirement is for this module to fold each
``raw_material_demand`` row into department/Store demand exactly like a
target's ``component_vector`` row. Skipping it here would silently discard
the entire raw-material requirement for any MADE_TO_ORDER item whose BOM
contains no PRE_PRODUCED stop point at all.

## Return shape

    {"rows": [...], "blockers": [...]}

Each row in ``rows`` is one ``(department, item_code)`` demand line:

    {
        "item_code": "RICE",
        "department": "Main Kitchen",
        "department_warehouse": "Main Kitchen - WH",
        "required_qty": 20.0,
        "stock_uom": "Kg",
        "department_available": 5.0,
        "department_shortage": 15.0,   # max(0, required - department_available)
        "store_available": 8.0,
        "store_shortage": 12.0,        # see below
    }

``department_shortage`` is what a Transfer MR (Agent 5) has to move from
Store into that department's warehouse: existing department stock reduces
the requirement first (PLAN.md, "Material Requests" -- "Current department
stock" is netted off before Store is even considered).

``store_available``/``store_shortage`` are computed once per ``item_code``,
across every row in *this call's* input that shares that item, and the same
two numbers are then copied onto every one of that item's rows. This is
deliberate: it is what stops two department rows for the same item from
each independently reporting the full Store shortfall (the acceptance
criterion "two department plans never raise duplicate Purchase rows for one
Store shortage") -- there is exactly one Store shortfall number per item,
shared by every department contributing to it. ``store_shortage`` is::

    max(0, sum(department_shortage for every row sharing this item) - store_available)

Note this is *not* yet the "Purchase requirement" from PLAN.md's formula --
it has not been netted against "Outstanding incoming supply" (existing
linked Material Request quantities). That netting is a Material-Request
creation concern (idempotency, D15), not a stock-reading concern, and is
performed by ``ury_production_plan_material_request`` -- a strictly
read-only engine cannot itself know which existing Material Request rows
are "spent" against which recomputation. See that module's docstring for
where "Outstanding incoming supply" is actually subtracted.

``blockers`` is a flat list, shaped like the target compiler's own blockers,
today only ever a single ``store_warehouse_not_configured`` entry when
Store demand exists but no Store Warehouse is configured -- reported rather
than raised, so a missing Store configuration never prevents every
department's stock picture (which needs no Store lookup at all) from being
reported.

## Zero writes

This module calls only ``frappe.db.get_value`` (a Bin read) and
``frappe.db.get_single_value`` transitively through
``ury_production_settings.get_store_warehouse``. It never inserts, saves,
submits, or calls ``db_set``/``set_value``. See
``test_ury_production_readiness.py``'s ``TestNoWrites``, which greps this
module's own source for those calls, the same guard Agent 1 used for the
BOM tree service.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt

from ury.ury.api.ury_production_settings import get_store_warehouse

BIN_DOCTYPE = "Bin"


def _float_precision():
	return cint(frappe.db.get_default("float_precision")) or 6


def _stock_qty(value):
	"""Round stock quantities to system float precision.

	Bin/BOM arithmetic routinely leaves residues like ``2.77e-17``; treating
	those as shortages would both block Prepare Production incorrectly and
	render unreadable messages. Rounding here is the single choke point for
	every readiness consumer (Transfer MR, Purchase MR, Prepare Production).
	"""
	return flt(value, _float_precision())


def format_stock_qty_for_message(qty):
	"""Human-readable stock qty for blocker / toast copy (no scientific notation)."""
	precision = _float_precision()
	rounded = flt(qty, precision)
	text = f"{rounded:.{precision}f}".rstrip("0").rstrip(".")
	return text if text else "0"


def compute_readiness(departments, store_warehouse=None):
	"""Compute per-(department, item) stock readiness for ``departments``.

	``departments`` is the dict shape ``compile_production_targets`` returns
	(or any subset of it sharing the same shape -- see module docstring).

	``store_warehouse`` defaults to ``ury_production_settings.get_store_warehouse()``
	when not given; a caller may override it (e.g. a test, or a caller that
	already resolved it once and wants to avoid a repeat Single read).

	Returns ``{"rows": [...], "blockers": [...]}`` -- see module docstring.
	"""
	if store_warehouse is None:
		store_warehouse = get_store_warehouse()

	demand_rows = _collect_department_demand(departments)

	blockers = []
	if demand_rows and not store_warehouse:
		blockers.append(_store_warehouse_not_configured_blocker())

	rows = []
	for (department, item_code), demand in demand_rows.items():
		department_available = _bin_actual_qty(item_code, demand["department_warehouse"])
		department_shortage = _stock_qty(max(0.0, demand["required_qty"] - department_available))
		rows.append({
			"item_code": item_code,
			"department": department,
			"department_warehouse": demand["department_warehouse"],
			"required_qty": _stock_qty(demand["required_qty"]),
			"stock_uom": demand["stock_uom"],
			"department_available": _stock_qty(department_available),
			"department_shortage": department_shortage,
		})

	_apply_store_shortage(rows, store_warehouse)

	return {"rows": rows, "blockers": blockers}


# --- department demand collection -------------------------------------------


def _collect_department_demand(departments):
	"""Aggregate raw-material demand (from every target's ``component_vector``)
	and EXTERNAL_RECEIPT demand (D19 -- the target itself) into one dict keyed
	by ``(department, item_code)``.

	Two component-vector rows for the same item in the same department (e.g.
	two different targets that both consume Rice) are summed together, the
	same way the target compiler itself sums repeated demand for one target.
	"""
	demand = {}
	for department, bucket in (departments or {}).items():
		department_warehouse = bucket.get("warehouse")
		for target in bucket.get("targets") or []:
			for component in target.get("component_vector") or []:
				_add_demand(
					demand, department, department_warehouse,
					item_code=component.get("item_code"),
					qty=component.get("required_qty"),
					stock_uom=component.get("stock_uom"),
				)
		for target in bucket.get("external_receipt_targets") or []:
			# D19: this target has no component_vector (sourcing_mode
			# EXTERNAL_RECEIPT never gets its own BOM walked) -- the target
			# itself is what must be received, so it is its own demand row.
			_add_demand(
				demand, department, department_warehouse,
				item_code=target.get("item_code"),
				qty=target.get("required_qty"),
				stock_uom=target.get("stock_uom"),
			)
		for component in bucket.get("raw_material_demand") or []:
			# A MADE_TO_ORDER row's own raw materials, folded in exactly like
			# a target's component_vector row (see module docstring).
			_add_demand(
				demand, department, department_warehouse,
				item_code=component.get("item_code"),
				qty=component.get("required_qty"),
				stock_uom=component.get("stock_uom"),
			)
	return demand


def _add_demand(demand, department, department_warehouse, item_code, qty, stock_uom):
	if not item_code:
		return
	key = (department, item_code)
	existing = demand.get(key)
	if existing:
		existing["required_qty"] = flt(existing["required_qty"]) + flt(qty)
	else:
		demand[key] = {
			"department_warehouse": department_warehouse,
			"required_qty": flt(qty),
			"stock_uom": stock_uom,
		}


# --- store-level shortage -----------------------------------------------------


def _apply_store_shortage(rows, store_warehouse):
	"""Compute one Store shortfall per ``item_code`` across every row sharing
	that item, and write it onto every one of that item's rows (see module
	docstring -- this is what stops duplicate Store-shortage reporting across
	departments)."""
	total_shortage_by_item = {}
	for row in rows:
		total_shortage_by_item[row["item_code"]] = (
			total_shortage_by_item.get(row["item_code"], 0.0) + row["department_shortage"]
		)

	store_available_by_item = {
		item_code: _bin_actual_qty(item_code, store_warehouse)
		for item_code in total_shortage_by_item
	}

	for row in rows:
		item_code = row["item_code"]
		store_available = store_available_by_item.get(item_code, 0.0)
		row["store_available"] = _stock_qty(store_available)
		row["store_shortage"] = _stock_qty(
			max(0.0, total_shortage_by_item.get(item_code, 0.0) - store_available)
		)


# --- stock reads (the only frappe calls in this module) ----------------------


def _bin_actual_qty(item_code, warehouse):
	if not item_code or not warehouse:
		return 0.0
	actual_qty = frappe.db.get_value(BIN_DOCTYPE, {"item_code": item_code, "warehouse": warehouse}, "actual_qty")
	return flt(actual_qty)


# --- blockers -----------------------------------------------------------------


def store_shortage_blocker(row):
	"""Blocker dict for a readiness row with ``store_shortage`` > 0."""
	shortage = _stock_qty(row["store_shortage"])
	return {
		"type": "store_shortage",
		"item_code": row["item_code"],
		"department": row["department"],
		"shortage": shortage,
		"message": _("Insufficient Store stock for {0}: short by {1} {2}.").format(
			row["item_code"],
			format_stock_qty_for_message(shortage),
			row.get("stock_uom") or "",
		),
	}


def _store_warehouse_not_configured_blocker():
	return {
		"type": "store_warehouse_not_configured",
		"message": _(
			"URY Production Settings: Store Warehouse is not configured. Store "
			"availability cannot be read, and the Purchase requirement cannot be "
			"computed, until it is."
		),
	}

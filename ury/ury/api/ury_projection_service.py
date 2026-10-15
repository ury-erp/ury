"""Read-only MADE_TO_ORDER capacity projection with raw-material top-up.

This module is the Phase C projection engine for the "Stock Available"
availability mode. It answers: "beyond the immediately reservable quantity
(finished component stock), how many more final items could be produced if
short PRE_PRODUCED components were topped up from their own child-BOM raw
materials, all read from the SAME warehouse the availability check resolved".

It is a pure, READ-ONLY computation. It creates no Work Orders, no Stock
Entries, no Material Requests, and no reservation rows -- it only reads BOM
structure (`ury_bom_compiler`) and allocatable stock
(`ury_inventory_projection.get_allocatable_qty`). ERPNext's Bin/Stock Ledger
Entry remain the durable stock truth; this projection is advisory display
state, exactly like the rest of the availability engine.

## Algorithm

`project_mto_capacity(item_code, company, warehouse, ...)`:

1. Compile the final item's BOM vector (or accept `parent_components`
   pre-compiled by the caller, as `_fill_made_to_order` does).
2. `immediate_capacity` = `floor(min(finished_allocatable_i / qty_per_unit_i))`
   over the top-level components -- the existing recipe-capacity formula.
   Callers may pass it precomputed together with an
   `allocatable_by_component` map (component_item -> allocatable finished
   qty) to avoid redundant stock reads.
3. A component is *toppable* when it has an active `PRE_PRODUCED`
   production configuration AND an active, submitted child BOM. Everything
   else (raw materials, sub-assemblies without a child BOM, non-pre-produced
   items) is a hard ceiling checked at its finished stock.
4. For a candidate final-item quantity N, each toppable component's
   shortfall (`N * qty_per_unit - finished_allocatable`, floored at zero)
   is exploded through its child BOM and the raw-material demand of ALL
   shortfalls accumulates into ONE SHARED DEMAND POOL keyed by raw item
   code, so a raw material shared by two child BOMs (e.g. Ghee inside both
   Biryani Rice and Biryani Masala) is allocated exactly once -- never
   double-counted. Nested toppable components (a pre-produced component
   whose child BOM itself contains a pre-produced component) recurse with
   their own shortfall credited against their own finished stock, up to
   `MAX_EXPANSION_DEPTH` levels of child-BOM expansion below the final
   item. Item codes already visited anywhere on the current path are never
   re-expanded (cycle safety).
5. N is feasible when every pool entry's demand is <= that raw item's
   allocatable qty in the SAME warehouse. Feasibility is monotonically
   non-increasing in N, so the maximum feasible N is found by exponential
   probing upward from `immediate_capacity` (doubling, capped at
   `MAX_SEARCH_QTY`) followed by a standard binary search -- no analytic
   upper bound is assumed, correctness of the monotonic predicate is what
   matters.

`max_producible` never reports below `immediate_capacity`: the finished
stock that establishes immediate capacity is achievable without any
projection, so even a fully infeasible projection clamps to it.

## Scope notes

- Raw materials are read from the caller-resolved `warehouse` only (the
  department/unit warehouse of the availability check), per the track
  decision D5 -- Store stock is deliberately invisible here.
- Scrap % is never read (yield is baked into BOM row qty at BOM save), so
  projection can under-count when a BOM carries explicit scrap -- a
  documented caveat, matching the rest of the availability path.
"""

import math

import frappe

from ury.ury.api.ury_bom_compiler import compile_bom_vector, _resolve_active_bom
from ury.ury.api.ury_inventory_projection import get_allocatable_qty


PRODUCTION_CONFIG_DOCTYPE = "URY Item Production Configuration"
POLICY_PRE_PRODUCED = "PRE_PRODUCED"

# Levels of child-BOM expansion allowed below the final item's own BOM
# (final item -> child BOM level 1 -> level 2 -> level 3). Deeper nesting
# is treated as a hard finished-stock ceiling.
MAX_EXPANSION_DEPTH = 3

# Absolute cap for the exponential feasibility probe. Recipe capacities are
# small operational numbers; this only bounds pathological inputs.
MAX_SEARCH_QTY = 1_000_000

# Absorb float drift in qty_per_unit-scaled demand comparisons (the
# reservation service uses the same 1e-6 order of magnitude tolerance).
QTY_EPS = 1e-9


def _has_pre_produced_config(item_code):
    """True if `item_code` has an active PRE_PRODUCED production config."""
    return bool(
        frappe.db.exists(
            PRODUCTION_CONFIG_DOCTYPE,
            {"item": item_code, "active": 1, "production_policy": POLICY_PRE_PRODUCED},
        )
    )


def _is_toppable_component(item_code, company, cache):
    """True if `item_code` may be topped up from raw materials.

    Requires BOTH an active PRE_PRODUCED production configuration (it is
    produced ahead of time, so producing more of it is a real operation)
    AND an active, submitted child BOM to explode into raw demand. A
    pre-produced component without a resolvable child BOM cannot be topped
    up -- its finished stock is its absolute ceiling. Results are memoized
    in `cache` (one projection call re-checks the same components many
    times across the binary-search iterations).
    """
    if item_code in cache:
        return cache[item_code]
    toppable = False
    if _has_pre_produced_config(item_code):
        try:
            _resolve_active_bom(item_code, company)
            toppable = True
        except Exception:
            toppable = False
    cache[item_code] = toppable
    return toppable


def _immediate_capacity(components, finished_alloc):
    """floor(min(finished_allocatable_i / qty_per_unit_i)) over components."""
    capacity = None
    for row in components:
        per_unit = row.get("qty_per_unit") or 0
        if not per_unit:
            continue
        component_capacity = math.floor(finished_alloc(row["component_item"]) / per_unit)
        if capacity is None or component_capacity < capacity:
            capacity = component_capacity
    return max(capacity or 0, 0)


def project_mto_capacity(
    item_code,
    company,
    warehouse,
    branch=None,
    department=None,
    parent_components=None,
    immediate_capacity=None,
    allocatable_by_component=None,
):
    """Project max MADE_TO_ORDER final-item capacity incl. raw-material top-up.

    Args:
        item_code: final (MADE_TO_ORDER) item code.
        company: company scope for BOM resolution and stock reads.
        warehouse: the single resolved availability warehouse -- finished
            component stock AND top-up raw materials are both read from here
            (decision D5: no cross-warehouse stock is assumed usable).
        branch / department: accepted for call-site symmetry with the
            availability filler; the projection itself is warehouse-scoped.
        parent_components: optional pre-compiled top-level BOM vector
            (`compile_bom_vector(item_code, 1, company)["components"]`).
            `_fill_made_to_order` passes its already-compiled vector so the
            BOM is never exploded twice.
        immediate_capacity: optional precomputed immediate capacity
            (`recipe_capacity` in the filler). Computed from finished stock
            when omitted.
        allocatable_by_component: optional precomputed map
            component_item -> allocatable FINISHED qty, used for both the
            immediate-capacity floor and toppable-component shortfalls, so a
            caller that already queried component stock (the filler does)
            causes no redundant stock reads. Missing entries fall back to
            `get_allocatable_qty`.

    Returns:
        {
            "immediate_capacity": <int, finished-stock recipe capacity>,
            "max_producible": <int, immediate + projected top-up, never
                               below immediate_capacity>,
            "projected_shortfalls": {component_item: unmet finished qty at
                                     max_producible, toppable components
                                     with a nonzero shortfall only},
            "limiting_factors": [item codes whose allocatable stock binds
                                 the result -- the pool items that the next
                                 final unit would exhaust, or the finished
                                 components at their ceiling when no top-up
                                 materialized],
        }

    Pure read-only: no document is created or modified at any point.
    """
    if parent_components is None:
        parent_components = compile_bom_vector(item_code, 1, company)["components"]

    finished_alloc_cache = dict(allocatable_by_component or {})

    def finished_alloc(component_item):
        if component_item not in finished_alloc_cache:
            finished_alloc_cache[component_item] = get_allocatable_qty(component_item, warehouse, company)[
                "allocatable_qty"
            ]
        return finished_alloc_cache[component_item]

    if immediate_capacity is None:
        immediate_capacity = _immediate_capacity(parent_components, finished_alloc)
    immediate_capacity = max(int(immediate_capacity or 0), 0)

    raw_alloc_cache = {}

    def raw_alloc(item_code):
        # A non-toppable component's finished allocatable IS its pool
        # figure, so the precomputed map answers raw-pool reads too.
        if item_code in finished_alloc_cache:
            return finished_alloc_cache[item_code]
        if item_code not in raw_alloc_cache:
            raw_alloc_cache[item_code] = get_allocatable_qty(item_code, warehouse, company)["allocatable_qty"]
        return raw_alloc_cache[item_code]

    unit_vector_cache = {}

    def unit_vector(component_item):
        # Child vectors are compiled once per component at qty=1 and scaled
        # linearly (BOM explosion is linear in qty), so the binary search
        # never re-explodes the same child BOM per candidate N.
        if component_item not in unit_vector_cache:
            unit_vector_cache[component_item] = compile_bom_vector(component_item, 1, company)["components"]
        return unit_vector_cache[component_item]

    toppable_cache = {}
    root_visited = {item_code}

    def collect_raw_demand(component_item, qty, pool, visited, depth):
        """Explode `qty` units of a toppable component into the shared pool.

        Feasibility is decided by the pool comparison in `feasible`.
        Non-toppable leaves, depth-exceeded toppable leaves, and visited
        (cycle) items contribute their full need to the pool; recursable
        toppable leaves contribute only their finished-stock shortfall,
        credited recursively.
        """
        try:
            rows = unit_vector(component_item)
        except Exception:
            # Child explosion failed despite the toppable pre-check (race on
            # BOM state). Demand falls back to the component's finished form.
            pool[component_item] = pool.get(component_item, 0) + qty
            return

        for row in rows:
            child = row["component_item"]
            need = (row.get("qty_per_unit") or 0) * qty
            if (
                child in visited
                or depth >= MAX_EXPANSION_DEPTH
                or not _is_toppable_component(child, company, toppable_cache)
            ):
                pool[child] = pool.get(child, 0) + need
                continue
            shortfall = need - finished_alloc(child)
            if shortfall > QTY_EPS:
                collect_raw_demand(child, shortfall, pool, visited | {child}, depth + 1)

    def feasible(n):
        """(bool, pool) -- n final items supportable incl. raw top-up."""
        pool = {}
        for row in parent_components:
            component_item = row["component_item"]
            need = (row.get("qty_per_unit") or 0) * n
            if component_item in root_visited or not _is_toppable_component(
                component_item, company, toppable_cache
            ):
                pool[component_item] = pool.get(component_item, 0) + need
                continue
            shortfall = need - finished_alloc(component_item)
            if shortfall > QTY_EPS:
                collect_raw_demand(component_item, shortfall, pool, root_visited | {component_item}, 1)
        for raw_item, demand in pool.items():
            if demand > raw_alloc(raw_item) + QTY_EPS:
                return False, pool
        return True, pool

    # Exponential probe upward from immediate_capacity (always feasible when
    # the caller's stock figures are consistent), then binary search the
    # last feasible N in (lo, hi].
    lo = immediate_capacity
    hi = lo + 1
    if not feasible(lo)[0]:
        # Inconsistent inputs (e.g. a precomputed immediate_capacity the
        # stock figures do not support): clamp to immediate, never below it.
        return _result(immediate_capacity, immediate_capacity, {}, parent_components, finished_alloc)
    while hi < MAX_SEARCH_QTY and feasible(hi)[0]:
        lo = hi
        hi *= 2
    hi = min(hi, MAX_SEARCH_QTY)
    if hi == MAX_SEARCH_QTY and feasible(hi)[0]:
        lo = hi
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if feasible(mid)[0]:
            lo = mid
        else:
            hi = mid - 1

    max_producible = lo
    projected_shortfalls = {}
    for row in parent_components:
        component_item = row["component_item"]
        if component_item in root_visited or not toppable_cache.get(component_item):
            continue
        shortfall = (row.get("qty_per_unit") or 0) * max_producible - finished_alloc(component_item)
        if shortfall > QTY_EPS:
            projected_shortfalls[component_item] = shortfall

    # Limiting factors are marginal: the pool items that ONE more final
    # unit (beyond max_producible) would push past their allocatable stock.
    if max_producible < MAX_SEARCH_QTY:
        _, next_pool = feasible(max_producible + 1)
        limiting_factors = [
            raw_item for raw_item, demand in next_pool.items() if demand > raw_alloc(raw_item) + QTY_EPS
        ]
    else:
        _, final_pool = feasible(max_producible)
        limiting_factors = [
            raw_item
            for raw_item, demand in final_pool.items()
            if demand >= raw_alloc(raw_item) - QTY_EPS
        ]

    return _result(
        immediate_capacity,
        max_producible,
        projected_shortfalls,
        parent_components,
        finished_alloc,
        limiting_factors=limiting_factors,
    )


def _result(
    immediate_capacity,
    max_producible,
    projected_shortfalls,
    parent_components,
    finished_alloc,
    limiting_factors=None,
):
    limiting = list(limiting_factors or [])
    if max_producible <= immediate_capacity:
        # No top-up materialized: the binding constraints are the finished
        # components (and raw leaves) sitting exactly at their ceiling.
        for row in parent_components:
            component_item = row["component_item"]
            per_unit = row.get("qty_per_unit") or 0
            if not per_unit:
                continue
            if abs(per_unit * max_producible - finished_alloc(component_item)) <= QTY_EPS:
                limiting.append(component_item)
    seen = set()
    limiting = [x for x in limiting if not (x in seen or seen.add(x))]
    return {
        "immediate_capacity": immediate_capacity,
        "max_producible": max_producible,
        "projected_shortfalls": projected_shortfalls,
        "limiting_factors": limiting,
    }

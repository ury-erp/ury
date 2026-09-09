# Production Control Unification — Gap Closure Plan (v3-stg)

Grounded against `v3-stg` as of this branch. All findings below were verified
directly in code (file:line), not assumed from the architecture writeup that
prompted this plan.

## 1. Current state (verified)

| Layer | File:line | Status |
|---|---|---|
| `URY Item Production Configuration` doctype | `ury/ury/doctype/ury_item_production_configuration/ury_item_production_configuration.json` | Confirmed fields: department, production_unit, production_policy, bom, direct_retail_warehouse, controlled_by_sales_plan, allow_over_plan_sale, availability_mode, active |
| Production-context resolver, "exactly 1 active config" rule | `ury/ury/api/ury_production_context.py:11` (`resolve_production_context`), enforced at `:30` (`if len(rows) != 1: ...`) | Confirmed |
| Department disabled gate | `ury/ury/api/ury_availability.py:332` → `DEPARTMENT_DISABLED` | Confirmed |
| Production Unit disabled gate | `ury/ury/api/ury_availability.py:349` → `PRODUCTION_UNIT_DISABLED` | Confirmed |
| Production Unit required for PRE_PRODUCED/MADE_TO_ORDER | `ury/ury/api/ury_availability.py:342` → `MISSING_PRODUCTION_UNIT` | Confirmed |
| `get_item_availability()` entry point + 3 policy branches | `ury/ury/api/ury_availability.py:298` | Confirmed — reason codes `CONFIGURATION_ERROR:286/318/337/354/368`, `NO_ACTIVE_PLAN:392/459`, `BLOCKING_COMPONENT:474` |
| `controlled_by_sales_plan` / `allow_over_plan_sale` / `availability_mode` | fetched into production context, **zero branches reference them** outside tests | **Dead config** — worse than "partially wired": these fields currently do nothing |
| `MenuCard` per-card availability + 30s display cache + `skipCache` option | `frontend/src/pages/Pos/lib/availability-api.ts:117,126`, `frontend/src/pages/Pos/components/MenuCard.tsx` | Confirmed |
| `ProductDialog.handleAddToOrder()` live availability check | `frontend/src/pages/Pos/components/ProductDialog.tsx` | **Contradicted** — does not call availability at all, only validates quantity |
| `CaptainMenu` omits branch/company → `MenuCard` skips lookup | `frontend/src/pages/Pos/captain/components/CaptainMenu.tsx` | Confirmed |
| `sync_order()` → `reconcile_order_reservations()` | `ury/ury/doctype/ury_order/ury_order.py:1354` (`sync_order`), call site `:1644` | Confirmed: resolves production context, explodes BOM, locks Bin rows, checks projected stock minus reservations. Does **not** call `get_item_availability()`; no department-enabled check, no sales-plan gate. |
| KOT routing via `Item.item_group` → `Production Unit.item_groups`, bypassing IPC | `ury/ury/api/ury_kot_generate.py` (legacy path, live), mirrored read-only in `ury/ury/api/ury_kot_routing.py:167` (`_legacy_item_group_fallback`) | Confirmed as the **live** routing mechanism |

### Key discovery not in the original brief

`ury/ury/api/ury_kot_routing.py` already implements the **correct** unified
routing precedence (IPC exact match → ambiguity fails closed →
department/unit disabled gates → legacy item_group fallback only when no IPC
mapping exists → `DIRECT_RETAIL` short-circuit). Its own header comment
(`:6-10`) states explicitly that it is **read-only, not wired into
`ury_kot_generate.py`, and wiring it is an explicit separate step**. This
closes most of gap #13 from the brief — it's an integration task, not new
design/build.

## 2. Root cause

Every gap traces to one fact: **there is exactly one authoritative
sellability function, `get_item_availability()`, and three of the four
consumers that decide whether an item can be sold or produced (Captain POS,
order acceptance/`sync_order`, KOT routing) do not call it** — each
re-derives a partial, inconsistent subset of its logic.

## 3. Dependency-mapped TODO

Ordered so each task only depends on tasks above it. Tasks in the same
numbered group have no dependency on each other and can be done in parallel.

### Group A — No dependencies, unblock everything else

- **A1. Wire dead config fields or remove them.** Decide: either branch
  `get_item_availability()` on `controlled_by_sales_plan` /
  `allow_over_plan_sale` / `availability_mode`, or remove the fields from the
  doctype and UI. Leaving them present-but-inert is the highest-risk item
  because operators believe they have a working switch. (`ury_availability.py`,
  `ury_item_production_configuration.json`)
- **A2. Add regression tests** for the 11 test cases already enumerated in
  the brief (department disabled, unit disabled, deactivated config,
  duplicate active configs, no plan, no FG stock, blocking component,
  direct-retail zero stock) against `get_item_availability()`, if not already
  covered by existing tests in `ury/ury/api/`.

### Group B — Depends on A2 (need tests as a safety net before touching call sites)

- **B1. Wire `ury_kot_routing.resolve_production_units()` into
  `ury_kot_generate.py`**, replacing the direct `item_group` matching with a
  call to the already-built precedence resolver. This is the smallest, most
  contained fix in the plan since the target module already exists and is
  documented as ready for integration. Add a feature-flag or staged rollout
  if the repo's KOT path is considered too risky to cut over directly.
  (`ury/ury/api/ury_kot_generate.py`, `ury/ury/api/ury_kot_routing.py`)
- **B2. Fix `CaptainMenu` to pass `branch`/`company` to `MenuCard`**, so the
  Captain surface receives the same availability gating as main POS.
  (`frontend/src/pages/Pos/captain/components/CaptainMenu.tsx`)
- **B3. Wire a live/`skipCache` availability check into
  `ProductDialog.handleAddToOrder()`** before adding an item to the cart, per
  the adapter's own documented contract at `availability-api.ts:21`.
  (`frontend/src/pages/Pos/components/ProductDialog.tsx`)

### Group C — Depends on A1, A2 (the highest-risk change — server-side enforcement)

- **C1. Make `reconcile_order_reservations()` authoritative-consistent with
  `get_item_availability()`.** Two implementation options, pick one:
  - (preferred) Have `sync_order()` call `get_item_availability()` (or a
    shared core function factored out of it) as a pre-check before
    `reconcile_order_reservations()` runs, rejecting the line if
    `sellable == false`, folding in `DEPARTMENT_DISABLED` and
    `NO_ACTIVE_PLAN`/`PLAN_EXHAUSTED` gating that the reservation path
    currently skips.
  - (alternative) Extract the shared gating logic (department/unit enabled,
    sales-plan lookup) into a function used by both
    `get_item_availability()` and `reconcile_order_reservations()`, so there
    is one implementation instead of two.
  Do this only after A1 lands, since the plan-gating semantics
  (`controlled_by_sales_plan`) must be decided before they're enforced at the
  transaction boundary too. (`ury/ury/api/ury_availability.py`,
  `ury/ury/api/ury_order_reservation_service.py`,
  `ury/ury/doctype/ury_order/ury_order.py:1354,1644`)
- **C2. Update the stale docstring** in the order/reservation path claiming
  this integration is *not* wired (found during grounding) once C1 lands, to
  avoid the next engineer re-discovering the same gap.

### Group D — Depends on B1, C1 (final consistency pass)

- **D1. End-to-end verification** using the 11-case test matrix from the
  brief, run through all three surfaces (main POS, Captain, direct
  `sync_order` call) to confirm identical sellable/not-sellable outcomes and
  identical KOT department routing for the same item.
- **D2. Documentation update** — update `URY Item Production Configuration`
  UI help text / doc-string to state plainly which fields are live and which
  policies require a Production Unit, since the current UI implies Production
  Unit is optional when the code requires it for two of three policies.

## 4. Suggested execution order

A1, A2 → (B1, B2, B3 in parallel) → C1 → C2 → D1 → D2

Groups B and C are independent of each other in principle, but C1 is the
riskiest change (affects real stock reservation), so sequencing B first lets
the team validate the lower-risk wins (KOT routing, Captain, add-to-cart
check) before touching the transaction boundary.

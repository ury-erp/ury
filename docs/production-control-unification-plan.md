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
| `get_item_availability()` entry point + 3 policy branches | `ury/ury/api/ury_availability.py:298` | Confirmed — reason codes `CONFIGURATION_ERROR:286/318/337/354/368`, `MISSING_DEPARTMENT:328-330`, `NO_ACTIVE_PLAN:392/459` (fails closed unconditionally — ignores `controlled_by_sales_plan`), `BLOCKING_COMPONENT:474` |
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
- **A2. Add regression tests for the real gaps only.** `test_ury_availability.py`
  already covers happy path, NOT_PRODUCED, PLAN_EXHAUSTED, FG_OUT_OF_STOCK,
  NO_ACTIVE_PLAN, MISSING_BOM, BLOCKING_COMPONENT, MISSING_DEPARTMENT, and
  CONFIGURATION_ERROR; duplicate-active-config is already covered in
  `test_ury_production_context.py`. The only genuinely missing cases are
  **DEPARTMENT_DISABLED, PRODUCTION_UNIT_DISABLED, and direct-retail
  zero-stock** — scope A2 to just those three.

### Group B — KOT wiring (independent of A)

- **B1. Wire `ury_kot_routing.resolve_production_units()` into
  `ury_kot_generate.py`**, replacing the direct `item_group` matching with a
  call to the already-built precedence resolver. The resolver already has
  its own dedicated test coverage (`test_ury_kot_routing.py`, 8+ cases); the
  real prerequisite this task needs (not previously named) is test coverage
  at the `ury_kot_generate.py` call-site level, added as part of this task,
  not before it. Add a feature-flag or staged rollout if the repo's KOT path
  is considered too risky to cut over directly.
  (`ury/ury/api/ury_kot_generate.py`, `ury/ury/api/ury_kot_routing.py`)

### Group C — POS-surface availability gating (depends on A1)

`controlled_by_sales_plan` semantics must be decided by A1 first:
`NO_ACTIVE_PLAN` currently fails closed unconditionally
(`ury_availability.py:392,459`), ignoring that field. Turning on live
availability gating on these surfaces before A1 lands would block every
PRE_PRODUCED/MADE_TO_ORDER item that has no active plan, which may not be
the intended behavior once A1 decides the field's semantics.

- **C1 (formerly B2). Fix `CaptainMenu` to pass `branch`/`company` to
  `MenuCard`**, so the Captain surface receives the same availability gating
  as main POS. (`frontend/src/pages/Pos/captain/components/CaptainMenu.tsx`)
- **C2 (formerly B3). Wire a live/`skipCache` availability check into
  `ProductDialog.handleAddToOrder()`** before adding an item to the cart, per
  the adapter's own documented contract at `availability-api.ts:21`.
  (`frontend/src/pages/Pos/components/ProductDialog.tsx`)

### Group D — Depends on A1 (the highest-risk change — server-side enforcement)

- **D1. Make `reconcile_order_reservations()` authoritative-consistent with
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
- **D2. Update the stale docstring** in `ury_order_reservation_service.py:3`
  claiming this integration is *not* wired (found during grounding) once D1
  lands, to avoid the next engineer re-discovering the same gap.

### Group E — Depends on B1, C1, C2, D1 (final consistency pass)

- **E1. End-to-end verification** using the 11-case test matrix from the
  brief, run through all four surfaces (main POS, Captain, add-to-cart, and
  direct `sync_order` call) to confirm identical sellable/not-sellable
  outcomes and identical KOT department routing for the same item.
- **E2. Documentation update** — update `URY Item Production Configuration`
  UI help text / doc-string to state plainly which fields are live and which
  policies require a Production Unit, since the current UI implies Production
  Unit is optional when the code requires it for two of three policies.

## 4. Suggested execution order

A1 → (A2, B1 in parallel) → (C1, C2 in parallel) → D1 → D2 → E1 → E2

A2 (test gaps) and B1 (KOT wiring) have no dependency on each other or on
A1's config-semantics decision, so they can run alongside it. C1/C2
(Captain, add-to-cart gating) wait on A1 because they turn on live
enforcement that depends on how `controlled_by_sales_plan` is resolved. D1
(transaction-boundary enforcement) is sequenced last and alone because it's
the highest-blast-radius change — it affects real stock reservations — and
should land after the lower-risk surfaces are validated.

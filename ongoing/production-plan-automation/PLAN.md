# URY Production Plan Automation — Execution Plan (rev 4)

Revision 4 closes the seven implementation blockers raised in review, records
four product decisions that were open, and corrects the execution waves.

Architecture, unchanged from revision 3:

1. BOM structure, production policy and readiness are three separate layers.
2. One Production Plan per Production Department, not one per Sales Plan.

Decisions D1 to D12 carry forward. D5 and D7 are revised. D13 to D18 are new.
Agent 11 is new. The waves are now strictly sequential except where two agents
share neither a file nor a contract.

**Product decisions closed in this revision:**

| Question | Decision |
| --- | --- |
| Are cross-department PRE_PRODUCED dependencies valid? | No, in phase one (D7) |
| Is the Department Warehouse the PRE_PRODUCED stock authority? | Yes (D13) |
| Created on Approval or Lock for Production? | Lock for Production; toggle kept (D14) |
| Are generated Material Requests draft or submitted? | Submitted (D15) |

## Why one plan per department

The Sales Plan UI already groups items by department, with independent
per-department filters, collapse state and jump navigation
(`frontend/src/pages/Dashboard/SalesPlanPage.tsx`, `groupedItems`, line 668).
Department-level planning was the intent. The backend diverged from it by
exposing one singular plan and one state per Sales Plan
(`get_production_plan_state`, `open_or_create_production_plan`). Revision 3
aligns the backend with the UI that already exists.

## Objective

A manager:

1. Locks the Sales Plan, which creates one Production Plan per department.
2. Reviews an aggregated Purchase MR and each department's Transfer MR.
3. Completes normal ERPNext procurement when required.
4. Clicks Prepare Production on each department's plan to validate stock,
   transfer materials, create and submit Work Orders, and post Manufacture
   Stock Entries.

The manager must never open an individual Work Order. A department that is
blocked must never block a department that is ready.

## Target operational flow

```
URY Sales Plan
    |
    |-- Production Plan - Main Kitchen --> Transfer MR --> Prepare Production
    |-- Production Plan - Bakery       --> Transfer MR --> Prepare Production
    |-- Production Plan - Tandoor      --> Transfer MR --> Prepare Production
    |
    +-- One aggregated Purchase MR (Store replenishment, all departments)
```

Prepare Production, per department:

```
Validate that department's Store requirement
    -> Submit Store to Department Stock Entries
    -> Create and submit Work Orders
    -> Skip Department to WIP transfer
    -> Submit Manufacture Stock Entries
    -> Update that plan's result and state
```

## Architecture: three separate layers

Branch, stock, policy and warehouse behaviour must stop accumulating inside the
generic BOM compiler.

```
BOM Tree Service
    | structural quantities, no URY semantics
Production Target Compiler
    | department targets, dependency order, component vectors
Readiness Engine
    | purchase, transfer and stock blockers
Execution Services
```

### A. BOM tree service

**Module:** new `ury/ury/api/ury_bom_tree.py`

Responsibilities: read one submitted BOM, scale by `BOM.quantity`, traverse
nested BOMs, detect circular references, return normalized nodes and paths.

It must not know about branch, Production Department, production policy,
warehouses, stock, Production Plans or Material Requests.

```python
walk_bom_tree(bom_no, required_qty, company)
```

```python
[
    {
        "item_code": "BIRYANI-BASE",
        "bom_no": "BOM-BIRYANI-BASE-001",
        "required_qty": 20,
        "stock_uom": "Kg",
        "parent_item": "CHICKEN-BIRYANI",
        "level": 1,
        "path": ["CHICKEN-BIRYANI", "BIRYANI-BASE"],
        "has_bom": True,
    }
]
```

The BOM passed in from the approved Sales Plan snapshot is authoritative. This
service must never resolve a newer active BOM on its own. It has no
`_resolve_active_bom` equivalent and takes no `item_code` entry point, only a
`bom_no`, which makes silent re-resolution structurally impossible.

`ury/ury/api/ury_bom_compiler.py` is **not touched by this feature**. It keeps
serving `ury_availability` with its current branch-agnostic behaviour. The new
service is a parallel, purpose-built reader, not a refactor of the old one.

### B. Production target compiler

**Module:** new `ury/ury/api/ury_production_target_compiler.py`

Responsibilities: consume the Sales Plan snapshot, call the BOM tree service,
resolve branch-scoped `URY Item Production Configuration`, decide which nodes
become advance-production targets, assign every target to a department, emit one
target collection per department, and emit dependency relationships between
targets.

```python
compile_production_targets(sales_plan_snapshot, branch, company)
```

`branch` is mandatory. Branch scoping lives here and nowhere else.

```text
PRE_PRODUCED node
    -> Create Production Plan target
    -> Stop parent explosion at this node

MADE_TO_ORDER finished item
    -> Do not create target
    -> Inspect its BOM for PRE_PRODUCED assemblies

Unstocked intermediate
    -> Do not create target
    -> Continue traversal

Raw material
    -> Do not create target

DIRECT_RETAIL
    -> Do not create target
```

```python
{
    "Main Kitchen": {
        "department": "Main Kitchen",
        "warehouse": "Main Kitchen - WH",
        "targets": [...],
    },
    "Bakery": {
        "department": "Bakery",
        "warehouse": "Bakery - WH",
        "targets": [...],
    },
}
```

Each target also carries the component vector its Work Order will consume (see
D1). The Work Order hook must never re-interpret the BOM itself.

### C. Readiness engine

**Module:** new `ury/ury/api/ury_production_readiness.py`

Responsibilities: consume already-compiled department targets and Work Order
requirements, read Department and Store stock, calculate purchase and transfer
shortages, account for outstanding requests and previous execution, return
blockers.

It must not traverse BOMs and must not decide production policy.

## Production target rules

| Classification | Production Plan | Processing rule |
| --- | --- | --- |
| Direct PRE_PRODUCED menu item | Include | Produce from the plan |
| PRE_PRODUCED assembly used by an MTO item | Include | Derive and aggregate demand from the MTO BOM |
| MADE_TO_ORDER finished item | Exclude | Produce only from the actual POS/KOT order |
| Non-stocked intermediate BOM node | Exclude | Recursively explode it |
| Raw material | Exclude | Handle through Material Requests and Work Order requirements |
| DIRECT_RETAIL item | Exclude | No manufacturing |

### MTO clarification

An MTO item's assembly appears in a Production Plan only when that assembly has
an active, branch-scoped configuration with `production_policy = PRE_PRODUCED`.

```
Chicken Biryani - MADE_TO_ORDER
+-- Biryani Base - PRE_PRODUCED
    |-- Rice - Raw Material
    +-- Masala - Raw Material
```

For a Sales Plan covering 100 Chicken Biryanis:

- Chicken Biryani is not a Production Plan row.
- The required quantity of Biryani Base is a Production Plan row, in Biryani
  Base's own configured department.
- Rice and Masala are material requirements, not Production Plan rows.

## Warehouse model

The Store to Department movement stays a real ERPNext stock transfer.
`skip_transfer` skips only the additional Department to WIP movement.

```
skip_transfer     = 1
source_warehouse  = production_plan.custom_ury_department_warehouse
wip_warehouse     = None
fg_warehouse      = production_plan.custom_ury_department_warehouse
```

Every `required_items[].source_warehouse` is the Department Warehouse.
`production_plan_item.warehouse` is set to the same value at plan creation, so
source and target are the one Department Warehouse throughout. The Department
Warehouse is also the POS stock authority for PRE_PRODUCED items (D13), so
manufacturing output and availability never read different warehouses.

Verified against `erpnext/manufacturing/doctype/work_order/work_order.py`
(v15.119.3): `make_stock_entry` draws the Manufacture entry's `from_warehouse`
from `work_order.source_warehouse` when `skip_transfer` is set and
`from_wip_warehouse` is not. `check_wip_warehouse_skip` clears `wip_warehouse`
on its own, and `on_submit` does not demand a WIP warehouse when
`skip_transfer` is set.

## One Production Plan per department

```
URY Sales Plan
├── Production Plan - Main Kitchen
├── Production Plan - Bakery
├── Production Plan - Tandoor
└── Production Plan - Beverage
```

Each Production Plan owns exactly one department, exactly one Department
Warehouse, its production targets, its Transfer MR, its Work Orders, its
Manufacture Stock Entries, and its own readiness and execution state.

### Production Plan fields

`custom_ury_sales_plan` and `custom_ury_snapshot_hash` already exist. Add:

| Fieldname | Type | Purpose |
| --- | --- | --- |
| `custom_ury_department` | Link (URY Production Department) | The plan's one department |
| `custom_ury_department_warehouse` | Link (Warehouse) | The plan's one Department Warehouse |
| `custom_ury_production_state` | Select | `Awaiting Materials`, `Ready for Production`, `Processing`, `Production Completed`, `Production Failed` |
| `custom_ury_production_result` | Long Text | JSON: blockers, generated documents, timings |
| `custom_ury_production_started_at` | Datetime | Attempt start |
| `custom_ury_execution_job_id` | Data | RQ job handle (D17) |
| `custom_ury_execution_attempt` | Int | Attempt counter (D17) |
| `custom_ury_execution_heartbeat` | Datetime | Job liveness (D17) |
| `custom_ury_execution_step` | Data | Current step (D17) |

`Production Plan Item.custom_ury_department` becomes redundant once the
department lives on the parent. Keep it populated for one release for
compatibility, then remove it. `ury_work_order_hooks._resolve_department`
currently reads it and switches to the parent field.

### Idempotency identity

A department Production Plan is uniquely identified by:

```
Sales Plan + Department + Approval Snapshot Hash
```

The Sales Plan row is locked for the whole creation loop, so concurrent callers
cannot create duplicates for any department.

## Sales Plan link changes

`Production Plan.custom_ury_sales_plan` already supports one Sales Plan to many
Production Plans and becomes the authoritative relationship.

`URY Sales Plan.custom_ury_production_plan` holds one value and cannot remain
the source of truth. See D11 for its deprecation path.

API replacements:

```python
get_live_production_plan(sales_plan)
    -> get_live_production_plans(sales_plan)
    -> get_department_production_plan(sales_plan, department)

create_or_get_production_plan(sales_plan)
    -> create_or_get_department_production_plans(sales_plan)
```

`ury_sales_plan._check_live_production_plan` already calls
`get_live_production_plan` and needs only the plural signature; its message
becomes a list of the live plans.

## Production Plan creation

Triggered by the `Locked for Production` transition, not by `Approved`, and
gated by `enable_auto_production_plan` (D14). When the toggle is on, a failure
aborts the lock rather than leaving a gap.

When the Sales Plan is locked:

1. Read its frozen approval snapshot.
2. Compile direct PRE_PRODUCED targets.
3. Inspect MTO BOMs for PRE_PRODUCED assemblies.
4. Assign targets to their configured departments.
5. Aggregate repeated targets within the same department.
6. Create one Production Plan per non-empty department.
7. Set one Department Warehouse on each plan.
8. Set `include_exploded_items = 0` on every row.
9. Link every plan back to the Sales Plan.
10. Return the full department-plan collection.

```python
{
    "sales_plan": "SP-2026-00001",
    "production_plans": [
        {
            "department": "Main Kitchen",
            "production_plan": "MFG-PP-2026-00001",
            "state": "Awaiting Materials",
        },
        {
            "department": "Bakery",
            "production_plan": "MFG-PP-2026-00002",
            "state": "Ready for Production",
        },
    ],
}
```

## Material Requests

### Purchase MR, at Sales Plan level

Calculated across all department Production Plans together:

```
Total department demand
- Current department stock
- Store stock
- Outstanding incoming supply
= Purchase requirement
```

One consolidated Purchase MR per Sales Plan, inserted and submitted (D15). This
is what stops several department plans from raising duplicate Purchase Requests
against the same Store shortage.

### Transfer MR, at department Production Plan level

Each department plan raises its own Material Transfer Request, Store Warehouse
to that plan's Department Warehouse, inserted and submitted (D15). Prepare
Production consumes an already-submitted request and never has to submit one.

```
Sales Plan
└── One aggregated Purchase MR

Department Production Plan
└── One Transfer MR
```

## Prepare Production, per department

Each Production Plan carries its own Prepare Production action. A blocked
Bakery never blocks Main Kitchen.

1. Check only that department's outstanding transfer requirements.
2. Lock the required Store Bin rows in `(item_code, warehouse)` order (D9) and
   **re-run readiness under those locks** (D17). The earlier synchronous
   preflight is advisory and is never sufficient on its own.
3. Create and submit Store to Department Stock Entries.
4. Create or reuse Work Orders.
5. Apply the skip-transfer and warehouse policy.
6. Populate Work Order required items from the compiled component vector.
7. Submit Work Orders.
8. Submit Manufacture Stock Entries.
9. Complete that department's Production Plan.

Submitting a Manufacture Stock Entry declares that physical production is
complete. The UI must confirm this before starting.

## Shared Store contention

All departments still draw on one Store Warehouse.

```
Main Kitchen needs 10 kg rice
Tandoor needs 10 kg rice
Store has 15 kg
```

Handled by the Sales Plan-level aggregated Purchase calculation, by submitted
Transfer MRs representing department demand, and by Bin locking plus live stock
revalidation inside Prepare Production.

If Store stock runs out between two department executions, the first valid
transfer succeeds, the second department's Prepare action fails with the
current shortage, and no Work Orders or Manufacture entries are created for the
blocked department.

Revision 2's "allocation by Production Plan row order" is withdrawn (D4). It was
an artefact of packing every department into one plan.

## Frontend

The Sales Plan page already groups by department. Each department header gains
its plan:

```
Main Kitchen
12 items
Production Plan: MFG-PP-2026-00001
Status: Ready for Production
[Open Production Plan]
```

Service methods move from singular to collection:

```typescript
getProductionPlanState(name)      -> getProductionPlanStates(salesPlan)
openOrCreateProductionPlan(name)  -> createDepartmentProductionPlans(salesPlan)
                                  -> openDepartmentProductionPlan(salesPlan, department)
```

```typescript
interface DepartmentProductionPlanState {
  department: string;
  production_plan?: string;
  docstatus?: number;

  // Axis 1 - does a usable plan exist for this department?
  // Carries forward today's ProductionPlanState.state verbatim.
  link_state: 'none' | 'live' | 'stale' | 'ineligible';

  // Axis 2 - how far has execution got?
  // Absent while link_state is 'none' or 'ineligible'.
  execution_state?:
    | 'awaiting_materials'
    | 'ready'
    | 'processing'
    | 'completed'
    | 'failed';

  can_create?: boolean;
  can_open?: boolean;

  issues?: string[];               // pre-flight; blocks creation
  blockers?: ProductionBlocker[];  // readiness; blocks execution
}
```

**The two axes must not be merged** (D12). Today's
`ProductionPlanState.state` answers "is there a plan, and is it current?"
The new execution states answer "how far has this department got?" A plan can
be `link_state: 'stale'` while `execution_state: 'completed'`, which is exactly
the case a manager needs to see: the department finished producing against a
Sales Plan that has since changed. Collapsing both into one `state` field loses
that, and silently drops the `custom_ury_snapshot_hash` staleness check the
current UI already relies on to disable its button
(`SalesPlanPage.tsx`, line 1132 onward).

`issues` and `blockers` are likewise distinct and both are needed: `issues`
comes from creation pre-flight (no BOM, no plannable items), `blockers` from
the readiness engine (shortages, misconfiguration).

## Resolved decisions

### D1 — Selective BOM explosion, owned by the target compiler

The production target rules stand: traversal stops at PRE_PRODUCED nodes and
passes through unstocked intermediates. ERPNext cannot express this with
`use_multi_level_bom`, which is all-or-nothing, so URY writes `required_items`
itself.

**Mechanism.** `Document.hook` composes a `doc_events` handler to run *after*
the controller method of the same name (`frappe/model/document.py`,
`compose(fn, *hooks)` calls `fn` first). So `ury_work_order_hooks.validate` runs
after `WorkOrder.validate()` has already called `set_required_items()`. The hook
replaces the rows wholesale with the component vector the target compiler
produced for that target, then pins every row's `source_warehouse` to the
Department Warehouse.

The only other caller of `set_required_items()` is
`get_items_and_operations_from_bom()`, a whitelisted method reached from the
Work Order form's own BOM button. No automatic path re-runs it after the hook,
so the rewritten rows survive to `db_update`.

**Do not** enable
`Manufacturing Settings.allow_editing_of_items_and_quantities_in_work_order`. It
is unnecessary and would change behaviour for every non-URY Work Order.

Owner: Agent 2 produces the vector, Agent 6 applies it.

### D2 — `include_exploded_items = 0` on every URY Production Plan Item

The field defaults to `'1'` and `ProductionPlan.get_production_items()` copies it
into the Work Order as `use_multi_level_bom`. Left at the default it explodes
PRE_PRODUCED sub-assemblies into raw materials, which is the exact double-count
the target rules exist to prevent. Every row written by plan creation sets `0`,
and the field leaves `UNMAPPED_PRODUCTION_PLAN_ITEM_FIELDS`.

D1's hook is still required on top: `0` alone leaves unstocked intermediates in
`required_items` with no stock and no Work Order behind them.

Owner: Agent 3, asserted by Agent 6 and Agent 10.

### D3 — Branch scoping is structural, not a parameter

Revision 2 proposed threading an optional `branch` into `ury_bom_compiler`. The
layer split removes the need. The BOM tree service has no branch concept at all,
and the target compiler requires `branch` as a mandatory argument. A
configuration belonging to another branch cannot stop traversal, because
traversal no longer reads configurations.

`ury_bom_compiler` and `ury_availability` are untouched. Their branch-agnostic
stop points remain a known, pre-existing inconsistency; file it separately, and
do not fix it inside this feature.

### D4 — Store allocation by row order: withdrawn

Superseded by one plan per department plus Bin locking. Do not implement
`store_allocated_to` or any allocation ordering.

### D5 — Synchronous preflight, background execution, per department

1. `prepare_production(production_plan)` runs that department's full preflight
   synchronously. It performs **no stock, Work Order or manufacturing
   mutations**. It may write readiness state and blocker information onto the
   Production Plan. Blockers return immediately and the state becomes
   `Awaiting Materials`.
2. On a clean preflight it sets `Processing`, stamps the execution tracking
   fields (D17), enqueues through `frappe.enqueue`, and returns.
3. The job performs transfers, Work Orders and Manufacture entries, then writes
   `custom_ury_production_result` and the terminal state.

The synchronous preflight is advisory only. The job **must** re-run readiness
after acquiring Store Bin locks and before creating anything (D17).

The UI polls a read-only state method. Recovery from a lost job is specified in
D17, not by elapsed time alone.

Owner: Agent 8.

### D6 — Cancellation guard, per department plan

`ury_production_plan_cancel_hooks.before_cancel` gains:

- State `Processing`: refuse. Wait for the job, or reset it first.
- Any linked submitted Manufacture Stock Entry: refuse, naming the entries.
- Submitted Work Orders with nothing produced: allow, and say in the message
  that those Work Orders may need cancelling first.

The existing `URY Sales Plan` link exemption is untouched.

Owner: Agent 8.

### D7 — Same-department production is a phase-one constraint

**Decision: Option A.** In phase one, a PRE_PRODUCED item is produced and
consumed in the same department. Every material movement in this feature is
therefore Store to Department. There is no Department to Department transfer,
and none must be built.

**This is a scope boundary, not a universal business rule.** Cross-department
supply is realistic in a restaurant — a bakery producing bread for a main
kitchen is a legitimate setup, and URY may support it later. Phase one excludes
it because it would require upstream plan dependencies, Department to Department
transfers, dependency-aware execution and a "Waiting for Bakery" readiness
state, none of which are justified by current setups.

Consequence for the target compiler: when it finds an MTO parent in department X
consuming a PRE_PRODUCED component configured for department Y, it emits a
blocker worded as an unsupported configuration, not as an error in the data:

> Cross-department production is not supported in this release. `BREAD` is
> configured under `Bakery` but is consumed by `SANDWICH` under `Main Kitchen`.
> Configure `BREAD` under `Main Kitchen`, or wait for cross-department support.

Dependency ordering between targets remains real, but only *within* one
department's plan. No dependency child table is needed in phase one.

Phase two, if it happens, revisits: upstream plan dependency links, a
Department to Department transfer path, and dependency-aware readiness.

### D8 — Purchase MR rows link per-row to their originating department plan

`Material Request Item.production_plan` and `material_request_plan_item` are
per-row fields (both `read_only: 1`, set programmatically). A single
consolidated Purchase MR can therefore carry rows pointing at different
department Production Plans. Consolidation and per-plan traceability are not in
tension.

Each department plan also populates its own `Production Plan.mr_items`, so
ERPNext's native `requested_qty` tracking and `Material Requested` status work
per department.

Reuse lookup for idempotency: find non-cancelled Material Requests holding at
least one row whose `production_plan` is any of the Sales Plan's department
plans.

Owner: Agent 4 (Purchase), Agent 5 (Transfer).

### D9 — Bin locks are taken in a deterministic global order

Two departments running Prepare Production at the same time will lock
overlapping Store Bin rows. Without a fixed order they deadlock.

Every execution path locks Store Bin rows sorted by `(item_code, warehouse)`
ascending, in one pass, before any write. A Bin row that does not exist is not
created just to lock it; its absence is a zero-stock shortage and is reported as
a blocker.

Owner: Agent 5, honoured by Agent 8.

### D10 — Do not reuse ERPNext's `for_warehouse`

`Production Plan.for_warehouse` drives `get_items_for_material_requests` and
ERPNext's own material planning. Overloading it with the Department Warehouse
would entangle URY's model with that logic. Use the dedicated
`custom_ury_department_warehouse` field and leave `for_warehouse` alone.

### D11 — `URY Sales Plan.custom_ury_production_plan` is deprecated

Stop writing it. `_check_live_production_plan` already reads the reverse link
and is unaffected. The field is hidden in this release and removed in the next,
so no code reads a value that silently means "one of several".

Two existing tests assert on it and must be rewritten:
`test_ury_sales_plan_auto_production_plan.py:108` and `:124`, plus
`test_ury_sales_plan_production_plan.py:204`.

Owner: Agent 3, with the fixture change by the integration owner.

### D12 — Link state and execution state stay separate

`get_sales_plan_production_states` returns both axes per department. `link_state`
carries today's `none`/`live`/`stale`/`ineligible` semantics, including the
`custom_ury_snapshot_hash` comparison. `execution_state` carries the five new
workflow states read from `custom_ury_production_state`.

Merging them would drop the staleness signal the Sales Plan UI already uses to
disable its Production Plan button, and would make "completed, but the Sales
Plan changed afterwards" unrepresentable.

Owner: Agent 8 for the payload, Agent 9 for the rendering.

### D13 — The Department Warehouse is the PRE_PRODUCED stock authority

`direct_retail_warehouse` is for DIRECT_RETAIL goods — bought in, not prepared:
water bottles, sodas, packaged snacks. Using it for PRE_PRODUCED items is wrong,
and it is the reason manufacturing and POS would otherwise disagree about where
finished goods live.

`ury_production_context.resolve_production_context` currently does:

```python
if row.production_policy in ("PRE_PRODUCED", "DIRECT_RETAIL"):
    row.warehouse = row.get("direct_retail_warehouse")
```

It changes to resolve PRE_PRODUCED against the department warehouse, leaving
DIRECT_RETAIL on `direct_retail_warehouse`. The warehouse model becomes
unambiguous:

```python
source_warehouse = production_plan.custom_ury_department_warehouse
fg_warehouse     = production_plan.custom_ury_department_warehouse
```

`production_plan_item.warehouse` is set to the same value at plan creation, so
the earlier `fg_warehouse = production_plan_item.warehouse` phrasing still holds
and is no longer ambiguous.

**This is a blast-radius change and gets its own agent (Agent 11).** It is
larger than one resolver line: `direct_retail_warehouse` is the PRE_PRODUCED
finished-goods warehouse across several shipped paths.

| Site | Current behaviour | Must change |
| --- | --- | --- |
| `ury_production_context.py` | PRE_PRODUCED and DIRECT_RETAIL both resolve to `direct_retail_warehouse` | Yes |
| `ury_batch_manufacture_service.py:337` | `target_warehouse = direct_retail_warehouse or source_warehouse` — the existing PRE_PRODUCED batch path produces **into** it | Yes, or the two PRE_PRODUCED production paths land stock in different warehouses |
| `ury_production_validation.py:48` | `"warehouse": config.get("direct_retail_warehouse")` for every policy, inside `validate_item_production_configuration` (there is no `_build_context` in this file) | Yes |
| `ury_fulfilment_posting_service.py:595` | Documents that the sale deducts from the same `direct_retail_warehouse` the batch path produced into | Comment and assumption |
| `ury_order_reservation_service.py:131` | A second `resolve_production_context`; its `_warehouse_for_context` already falls back to the department warehouse | Reconcile to one rule |
| `ury_availability.py:184` | Passes `direct_retail_warehouse` through to `_fill_pre_produced` | Follows the resolver |
| `ury/ury/dev_seed/v3_features/pre_produced_item_seed.py` | Seeds a PRE_PRODUCED config with a `direct_retail_warehouse` | Yes |
| `ury/ury/dev_seed/purchasing_seed.py` | Mirrors the resolver's order | Yes |

One piece of good news: `_validate_direct_retail_warehouse` is reached only
from `_validate_direct_retail`, so the field is **not** mandatory on a
PRE_PRODUCED configuration. Existing sites are not forced to have set it.

The decisive question is `ury_batch_manufacture_service.start_batch`. It is the
shipped, non-Production-Plan way to produce a PRE_PRODUCED item, and it
currently receives finished goods into `direct_retail_warehouse`. After D13 it
must receive into the department warehouse, or a site running both paths will
split its pre-produced stock across two warehouses and POS will read only one.

### D14 — Production Plans are created on Lock for Production, and creation is mandatory

Creation moves from the `Approved` transition to `Locked for Production`.

```
Approved
    -> Snapshot frozen; plan reviewable; no Production Plans yet

Locked for Production
    -> Department Production Plans created
```

`freeze_approval_snapshot` stays on the `Approved` transition. It is what
`custom_ury_snapshot_hash` and the staleness check depend on, and moving it
would change the meaning of an approved plan.

**The `enable_auto_production_plan` toggle is kept.** Its meaning moves from
Approval to Lock for Production, and its label and description are reworded to
say so. Both paths remain:

| Toggle | Locking a Sales Plan |
| --- | --- |
| On (expected default for production sites) | Creates every department Production Plan |
| Off | Creates nothing; the manager creates plans from the Sales Plan UI |

The manual path is the same locked, idempotent function Agent 3 owns, so the
two routes cannot diverge or double-create.

**Consequence, deliberate:** when the toggle is on, creation can no longer fail
silently. Today `maybe_create_production_plan_on_approval` wraps everything in a
bare `try/except` and logs, so a Sales Plan approval never breaks. With the
toggle on, the manager has asked for plans as part of locking, so a failure must
**abort the Lock transition** — otherwise they end up with a locked, un-editable
plan, no Production Plans, and nothing on screen to explain it. The try/except at
`ury/ury/doctype/ury_sales_plan/ury_sales_plan.py:88` is removed and the error
propagates.

With the toggle off, nothing is attempted and the lock is unaffected.

Renames: `ury_sales_plan_auto_production_plan.maybe_create_production_plan_on_approval`
becomes `create_production_plans_on_lock`. Setting labels, UI copy and tests
move from "Approval" to "Lock for Production".

### D15 — Generated Material Requests are submitted, not drafts

Both the consolidated Purchase MR and each department's Transfer MR are
inserted **and submitted** on creation. `_create_material_request` currently
inserts a draft and returns; it submits from now on.

| Document | State on creation |
| --- | --- |
| Purchase MR | Submitted |
| Transfer MR | Submitted |
| Purchase Order / Receipt | Normal ERPNext flow |
| Transfer Stock Entry | Created and submitted by Prepare Production |

Prepare Production therefore never has to submit a Transfer MR; it maps an
already-submitted one straight to a Stock Entry.

**Consequence for idempotency.** A submitted Material Request cannot have rows
added. When a recalculation finds that existing submitted linked requests
under-cover the requirement, the engine creates a **supplementary** Material
Request for the delta and links it to the same plans. It must never amend or
cancel an existing submitted request automatically. Over-coverage is left alone;
a manager cancels the surplus request by hand if they want to.

### D16 — The executor builds Work Orders; the hook is a gated safeguard

Revision 3 put the `required_items` rewrite in the Work Order `validate` hook
alone. That is unsafe: `validate` runs again on every later save, including
after rows have acquired `transferred_qty` or `consumed_qty`, and a blind
rewrite would discard real consumption history.

Construction moves to the executor:

1. Agent 7 creates the draft Work Order.
2. Agent 7 applies the compiled component vector and the warehouse policy.
3. Agent 7 saves and submits.

The `doc_events` hook remains as a gated safeguard:

```python
if doc.docstatus != 0:
    return
if any(flt(row.transferred_qty) or flt(row.consumed_qty)
       for row in doc.required_items):
    return
```

`transferred_qty` and `consumed_qty` are real fields on `Work Order Item`
(verified against `work_order_item.json`).

The warehouse policy itself — `skip_transfer`, `source_warehouse`,
`wip_warehouse`, `fg_warehouse` — stays in the hook unconditionally for URY
plans, because it is idempotent and safe to reassert on any save.

**Amendment, found during implementation.** As first written this decision
assumed the hook could rewrite `required_items` for a URY Work Order created
by hand from the desk. It cannot. The component vector is never persisted
anywhere the hook could read it back from, and the coordination rules forbid
the hook re-deriving one, since it must never re-interpret a BOM. The two
requirements were in direct contradiction.

Resolved as follows. The hook rewrites `required_items` only when a caller
supplies a vector through `doc.flags.ury_component_vector` **and** the gate
above passes. Agent 7 does not need the flag, because it calls
`apply_ury_required_items` directly on a fresh draft. Absent the flag, the
hook reasserts warehouse policy and leaves `required_items` exactly as
ERPNext's `set_required_items()` produced them.

**Residual gap, accepted for this release.** A URY Work Order created by hand
from the desk therefore gets the correct warehouses but ERPNext's own
`required_items`. D2 narrows the exposure: `include_exploded_items = 0` means
`use_multi_level_bom = 0`, so nested PRE_PRODUCED sub-assemblies already
appear correctly as items rather than being exploded. What remains wrong is
an unstocked intermediate BOM node, which lands in `required_items` with no
stock and no Work Order behind it, and the Manufacture entry then fails at
submit rather than silently mis-consuming.

That failure mode is loud rather than silent, which is why it is acceptable
for now. If hand-created URY Work Orders become a real workflow, persist the
compiled vector on the Production Plan Item and have the hook read it.

### D17 — Background execution revalidates and proves liveness

The synchronous preflight is advisory. Two departments can both pass preflight,
both enqueue, and the first to run can consume the Store stock the second was
counting on:

```
1. Bakery preflight passes
2. Main Kitchen preflight passes
3. Both jobs start
4. Bakery transfers stock
5. Main Kitchen re-runs readiness after acquiring Bin locks -> shortage
6. Main Kitchen fails before creating any Work Order
```

Every execution job therefore, in order: acquires Store Bin locks in
`(item_code, warehouse)` ascending order (D9), re-runs the full readiness
calculation under those locks, and aborts with blockers before any insert if the
picture changed.

Recovery needs more than elapsed time. Add to the Production Plan:

| Fieldname | Type | Purpose |
| --- | --- | --- |
| `custom_ury_execution_job_id` | Data | The RQ job handle |
| `custom_ury_execution_attempt` | Int | Incremented per attempt; written onto generated documents |
| `custom_ury_execution_heartbeat` | Datetime | Updated by the job as it progresses |
| `custom_ury_execution_step` | Data | Current step, for the UI and for diagnosis |

A plan is recoverable only when the heartbeat is stale **and** the recorded job
is confirmed no longer running in the queue. Elapsed time alone never triggers a
reset. `production_job_stale_minutes` becomes the heartbeat threshold rather than
a total-runtime threshold.

### D18 — Custom fields follow the app's own fixture path

`AGENTS.MD` states plainly: never edit `fixtures/custom_field.json` directly.
The established pattern in this app is `ury/setup_customizations.py`'s
`get_custom_fields()`, a patch under `ury/patches/v3_xx/` calling
`create_custom_fields(..., update=True)`, then `bench export-fixtures --app ury`
to regenerate the JSON. See `ury/patches/v3_16/add_stock_entry_posting_intent_field.py`
for the exact shape.

Wave 0 adds the new fields that way. The generated `custom_field.json` diff is a
build artefact of that change, not a hand edit. Note that `ury/setup.py`, which
the review named, does not exist; `ury/setup_customizations.py` is the real
module.


## Wave 0 — Integration owner

Owned solely by the integration owner. Blocks every other wave.

**File ownership:** `ury/setup_customizations.py`, `ury/patches/v3_xx/`,
`ury/patches.txt`, `ury/hooks.py`,
`ury/ury/doctype/ury_production_settings/`, and the regenerated
`ury/fixtures/custom_field.json`.

Custom fields are added through `get_custom_fields()` plus a patch calling
`create_custom_fields(..., update=True)`, then exported with
`bench export-fixtures --app ury` (D18). `custom_field.json` is never hand
edited.

### Production Plan fields to add

| Fieldname | Type | Purpose |
| --- | --- | --- |
| `custom_ury_department` | Link (URY Production Department) | The plan's one department |
| `custom_ury_department_warehouse` | Link (Warehouse) | The plan's one Department Warehouse |
| `custom_ury_production_state` | Select | `Awaiting Materials`, `Ready for Production`, `Processing`, `Production Completed`, `Production Failed` |
| `custom_ury_production_result` | Long Text | JSON: blockers, generated documents, timings |
| `custom_ury_production_started_at` | Datetime | Attempt start |
| `custom_ury_execution_job_id` | Data | RQ job handle (D17) |
| `custom_ury_execution_attempt` | Int | Attempt counter (D17) |
| `custom_ury_execution_heartbeat` | Datetime | Job liveness (D17) |
| `custom_ury_execution_step` | Data | Current step (D17) |

`custom_ury_sales_plan` and `custom_ury_snapshot_hash` already exist.

### Other wave 0 tasks

1. Add `URY Production Settings.production_job_stale_minutes`, Int, default 30.
   It is a **heartbeat** threshold (D17), not a total-runtime threshold.
2. Keep `URY Production Settings.enable_auto_production_plan` and its accessor,
   but reword the label and description from Approval to Lock for Production
   (D14).
3. Remove `URY Production Settings.enable_auto_work_order_on_production_plan_submit`
   and its accessor; Work Orders no longer key off Production Plan submit.
4. Hide `URY Sales Plan.custom_ury_production_plan` (D11).
5. Remove the `Production Plan` `on_submit` entry pointing at
   `ury_production_plan_auto_work_order.maybe_create_and_submit_work_orders`.
6. Register `ury/public/js/production_plan_prepare.js` in `doctype_js` beside
   the existing cancel guard.
7. Own the shared test fixtures: branches, departments, production units,
   warehouses, items, BOMs and configuration rows for the multi-department tree,
   the MTO-with-PRE_PRODUCED-assembly tree, and the nested-dependency tree.
8. **Demo/seed warehouse wiring: fixed.** `URY Production Settings.store_warehouse`
   was `Finished Goods - U` while the only department's `department_warehouse`
   was `Stores - U`, so a Store to Department transfer ran Finished Goods ->
   Stores. Root cause was not a swap but `ury/setup/demo.py:get_warehouse()`,
   which returns a **random** non-group warehouse; both values were assigned
   from it independently. Random assignment can also land both on the same
   warehouse, making transfers silent no-ops.

   Fixed by giving the two warehouses deterministic, semantically named
   resolvers (`get_stores_warehouse` -> Stores, `get_department_warehouse` ->
   Finished Goods) and a `__DEPARTMENT_WAREHOUSE__` placeholder, and by
   correcting the values on `ury.localhost`. `__WAREHOUSE__` keeps its
   random behaviour everywhere it does not matter.

   **Shared fixtures must follow the same rule:** the Store Warehouse and each
   Department Warehouse must be distinct and correctly oriented, or transfer
   tests pass while exercising nothing.

## Agent plan

| Agent | Responsibility | Primary files |
| --- | --- | --- |
| 1 | Pure BOM tree traversal | new `ury_bom_tree.py` |
| 2 | Target compiler and department grouping | new `ury_production_target_compiler.py`, `ury_production_plan_adapter.py` |
| 3 | Create and reuse multiple Production Plans | `ury_sales_plan_production_plan.py`, `ury_sales_plan_auto_production_plan.py` |
| 4 | Readiness engine and Sales Plan-level Purchase MR | new `ury_production_readiness.py`, `ury_production_plan_material_request.py` |
| 5 | Department Transfer MR and Stock Entry execution | new `ury_production_transfer.py` |
| 6 | Work Order requirements and warehouse policy | `ury_work_order_hooks.py` |
| 7 | Work Order and Manufacture executor | `ury_production_plan_auto_work_order.py` |
| 8 | Department Prepare Production orchestration | new `ury_prepare_production.py`, `ury_production_plan_cancel_hooks.py`, new `production_plan_prepare.js` |
| 9 | Sales Plan and Production Plan frontend | `frontend/src/services/salesPlan.ts`, `SalesPlanPage.tsx` |
| 10 | Integration and regression tests | new tests only |
| 11 | PRE_PRODUCED stock-authority migration | `ury_production_context.py`, `ury_batch_manufacture_service.py`, `ury_production_validation.py`, `ury_order_reservation_service.py`, dev seeds |

Each agent owns its own unit tests. Agent 10 owns integration tests only.

### Agent 1 — BOM tree service

Dependencies: Wave 0.

1. Implement `walk_bom_tree(bom_no, required_qty, company)` returning the node
   shape above.
2. Scale quantities by `BOM.quantity`, not by an assumed output of 1.
3. Recurse through nested BOMs; mark leaves with `has_bom = False`.
4. Detect circular references and raise with the offending `path`.
5. Accept only a `bom_no`. Provide no item-code entry point, so a newer active
   BOM can never be resolved silently.
6. Read only submitted BOMs; fail loudly on a missing or cancelled BOM.

Acceptance criteria:

- Quantities scale correctly for a BOM whose `quantity` is not 1.
- A cycle raises, naming the path, rather than recursing.
- The module imports nothing from `ury_production_context`,
  `ury_availability`, `ury_production_settings` or any URY doctype.
- Identical inputs always produce identical output.

### Agent 2 — Production target compiler

Dependencies: Agent 1's node contract.

1. Implement `compile_production_targets(sales_plan_snapshot, branch, company)`.
2. Seed targets from direct PRE_PRODUCED snapshot rows.
3. Traverse each MTO row's pinned BOM through the BOM tree service.
4. Resolve branch-scoped configuration through `resolve_production_context`.
5. Stop parent explosion at PRE_PRODUCED nodes; pass through unstocked
   intermediates; exclude raw materials and DIRECT_RETAIL.
6. Inspect each selected target's own BOM to find deeper PRE_PRODUCED
   dependencies.
7. Aggregate repeated targets within a department by item, BOM and warehouse.
8. Preserve source-parent provenance for diagnostics.
9. Emit dependency-first ordering within each department.
10. Emit each target's Work Order component vector (D1).
11. Emit a blocker when an MTO parent's department differs from a PRE_PRODUCED
    component's configured department (D7).
12. Route `sourcing_mode = EXTERNAL_RECEIPT` targets separately; they must never
    create Work Orders. Note that `EXTERNAL_RECEIPT` is a `sourcing_mode`, not a
    `production_policy`, and coexists with `PRE_PRODUCED`.
13. Remove the `is_sales_item` restriction in
    `ury_production_plan_adapter._filter_items_in_scope` so non-sellable kitchen
    bases are eligible.
14. Fail loudly when the snapshot's pinned BOM is missing or cancelled.

Acceptance criteria:

- An MTO finished item is excluded; its branch-scoped PRE_PRODUCED assembly is
  included at the scaled quantity.
- Shared assembly demand aggregates once within a department.
- The same item in two departments produces two separate target collections.
- A configuration belonging to another branch does not stop traversal.
- Raw materials and DIRECT_RETAIL items never become targets.
- Non-sales PRE_PRODUCED assemblies are included.
- A cross-department PRE_PRODUCED dependency produces a blocker, not a target.

### Agent 3 — Multiple Production Plan creation

Dependencies: Agent 2.

1. Implement `create_or_get_department_production_plans(sales_plan_doc, submit=False)`.
2. Lock the Sales Plan row for the whole loop so concurrent callers cannot
   duplicate any department's plan.
3. Key idempotency on Sales Plan + Department + Snapshot Hash.
4. Create one plan per non-empty department, setting `custom_ury_department`,
   `custom_ury_department_warehouse` and the initial state.
5. Set `include_exploded_items = 0` on every row (D2).
6. Replace `get_live_production_plan` with `get_live_production_plans` and
   `get_department_production_plan`, and update
   `_check_live_production_plan`'s call and message.
7. Stop writing `URY Sales Plan.custom_ury_production_plan` (D11) and rewrite the
   three tests that assert on it.
8. Move creation from the `Approved` transition to `Locked for Production`
   (D14). `freeze_approval_snapshot` stays on `Approved`.
9. Rename `maybe_create_production_plan_on_approval` to
   `create_production_plans_on_lock`, keep the `auto_production_plan_enabled()`
   gate, and **remove the surrounding try/except** at
   `ury/ury/doctype/ury_sales_plan/ury_sales_plan.py:88` so a creation failure
   aborts the Lock transition when the toggle is on (D14).
10. Update setting labels, UI copy and tests from "Approval" to "Lock for
    Production".

Acceptance criteria:

- Repeated calls create no duplicate department plans.
- Two concurrent calls produce one plan per department, not two.
- A Sales Plan with three departments yields three plans, each with one
  department and one warehouse.
- An empty department produces no plan.
- The Sales Plan backward guard reports every live plan.
- Approving a plan creates no Production Plan; locking it with the toggle on
  creates them all.
- Locking with the toggle off creates nothing and succeeds.
- A creation failure with the toggle on blocks the Lock transition with a
  visible error and leaves the plan Approved, never Locked-with-no-plans.
- The manual and automatic routes converge on the same function and cannot
  double-create.

### Agent 4 — Readiness engine and Purchase MR

Dependencies: Agent 2 for targets, Agent 3 for plans.

1. Implement the readiness engine, consuming compiled targets and never
   traversing BOMs.
2. Read Department and Store availability; account for outstanding requests and
   prior execution.
3. Compute the Sales Plan-level Purchase requirement across all department
   plans together.
4. Create one consolidated Purchase MR and **submit it** (D15), linking each row
   to its originating department plan through `production_plan` and
   `material_request_plan_item` (D8).
5. Populate each department plan's `mr_items`.
6. Reuse existing non-cancelled linked requests; subtract outstanding requested
   quantities. When submitted requests under-cover the requirement, create a
   supplementary Material Request for the delta rather than amending or
   cancelling anything (D15).
7. Keep Purchase Order and Purchase Receipt processing in standard ERPNext.

Acceptance criteria:

- Existing Department stock reduces the requirement.
- Two department plans never raise duplicate Purchase rows for one Store
  shortage.
- Every Purchase MR row resolves back to a department plan through native fields
  alone.
- Repeated calls create no duplicates.
- A raised requirement produces a supplementary request, never an amendment of
  a submitted one.
- Generated Purchase MRs are submitted, not drafts.
- The engine performs no writes; MR creation is a separate, explicit call.

### Agent 5 — Department Transfer MR and Stock Entry execution

Dependencies: Agent 4.

1. Create one Material Transfer MR per department plan, Store to that plan's
   Department Warehouse, and **submit it** (D15).
2. Link rows to the department plan through the native fields.
3. Preflight the department's aggregate Store requirement before any mutation.
4. Take Store Bin locks in `(item_code, warehouse)` ascending order (D9).
5. Map Transfer MRs to Material Transfer Stock Entries; insert and submit.
6. Preserve Material Request and Material Request Item references.
7. Reuse or skip quantities transferred by a previous attempt.

Acceptance criteria:

- A Store shortage blocks every new transfer for that department before any
  stock mutation.
- Partial previous transfers are respected.
- Transfer MR progress updates from submitted Stock Entries.
- Retrying does not transfer the same quantity twice.
- Two departments preparing concurrently do not deadlock.
- Prepare Production never has to submit a Transfer MR; it consumes an
  already-submitted one.

### Agent 6 — Work Order warehouse policy and safeguard hook

Dependencies: Agent 2 for the component vector, Agent 3 for the plan fields.

`ury_work_order_hooks.py` currently implements the opposite policy: it sets
`wip_warehouse = department_warehouse` for any Work Order carrying a
`production_plan_item`. That behaviour is replaced, not extended.

Agent 6 owns the **policy**, exposed as plain functions. Agent 7 calls them
during construction. The `doc_events` hook is only a safeguard (D16).

1. Expose `apply_ury_warehouse_policy(work_order, production_plan)` and
   `apply_ury_required_items(work_order, component_vector)` as importable
   functions, not hook-only behaviour.
2. Detect URY Work Orders by the linked plan's `custom_ury_sales_plan`, not
   merely by `production_plan_item` being set.
3. Warehouse policy: `skip_transfer = 1`, clear `wip_warehouse`, set
   `source_warehouse` and `fg_warehouse` to the plan's
   `custom_ury_department_warehouse` (D13).
4. Required items: replace the rows wholesale from the compiled vector, then
   force every row's `source_warehouse` to the Department Warehouse.
5. In the `doc_events` hook, always reassert the warehouse policy (idempotent,
   safe on any save), but rewrite `required_items` **only** when
   `docstatus == 0` and no row carries `transferred_qty` or `consumed_qty`
   (D16).
6. Resolve the department from the Production Plan parent, not the item row.
7. Leave ordinary ERPNext Work Orders untouched.

Implementation notes:

- The hook runs after `WorkOrder.validate()` (`frappe/model/document.py`,
  `compose(fn, *hooks)` calls the controller method first), so `required_items`
  is already populated when it executes. Replace the rows; do not append.
- Do not rely on `set_warehouses()` to propagate `source_warehouse` into
  `required_items`. It runs before `set_required_items()` and only fills empty
  rows, and `set_required_items()` then overwrites each row's `source_warehouse`
  from the item default. Setting every row explicitly is mandatory.
- Check that `ury_mto_work_order_service` and `ury_batch_manufacture_service`,
  which both set `wip_warehouse = fg_warehouse = source`, are not caught by the
  new branch.

Acceptance criteria:

- URY Work Orders need no WIP transfer and consume from Department stock.
- `required_items` matches the compiled vector exactly, with PRE_PRODUCED
  sub-assemblies present as items and unstocked intermediates exploded.
- A submitted Work Order, or one with any transferred or consumed quantity, is
  never rewritten by the hook.
- Non-URY, MTO and batch-manufacture Work Orders keep their current behaviour.

### Agent 7 — Work Order and Manufacture executor

Dependencies: Agents 5 and 6.

1. Refactor the current automation into reusable create and reuse helpers.
2. Remove Work Order creation from the Production Plan `on_submit` path. The
   `hooks.py` registration is removed in wave 0.
3. Create Work Orders only through Prepare Production, and **own their
   construction** (D16): create the draft, call Agent 6's
   `apply_ury_warehouse_policy` and `apply_ury_required_items`, then save and
   submit. Do not rely on the validate hook to build a new Work Order.
4. Submit Work Orders in dependency order within the department.
5. Call ERPNext's standard `make_stock_entry(..., purpose="Manufacture")`,
   then insert and submit the returned document.
6. Produce only the Work Order's remaining unproduced quantity.
7. Surface user-invoked failures instead of swallowing them into the error log.

Prior art to extract from, not reimplement: `ury_batch_manufacture_service.py`
already performs create Work Order, `work_order.make_stock_entry`, submit, with
`skip_transfer = 1`.

Interaction to honour:
`ury_manufacture_enforcement.validate_manufacture_requires_work_order` rejects
any Manufacture Stock Entry for a PRE_PRODUCED, IN_HOUSE item not linked to a
submitted Work Order. Going through `work_order.make_stock_entry` satisfies it.
Never hand-build the entry.

Acceptance criteria:

- Each target has one corresponding Work Order.
- Dependencies are produced before their consumers.
- Manufacture entries link to Work Orders.
- Partial production resumes from the remaining quantity.
- Repeated execution never manufactures twice.
- No Work Order is created on Production Plan submit.
- A Work Order reaches submit with its compiled vector intact, without
  depending on the safeguard hook to have built it.

### Agent 8 — Department Prepare Production orchestration

Dependencies: Agents 4, 5 and 7.

1. Expose whitelisted `prepare_production(production_plan)` scoped to one
   department plan: validate permissions, URY linkage and submitted status, run
   the full preflight synchronously, return blockers without writing (D5).
2. Lock the Production Plan against concurrent execution, using the existing
   `frappe.db.get_value(..., for_update=True)` idiom.
3. On a clean preflight set `Processing`, increment
   `custom_ury_execution_attempt`, stamp the start time, job id and first
   heartbeat, and enqueue.
4. In the job: acquire Store Bin locks in `(item_code, warehouse)` order,
   **re-run the full readiness calculation under those locks**, and abort with
   blockers before any insert if the picture changed (D17). Only then execute
   transfers, Work Orders and Manufacture entries, updating
   `custom_ury_execution_heartbeat` and `custom_ury_execution_step` as it
   goes.
5. Persist links and a result summary to `custom_ury_production_result`; set the
   terminal state.
6. Expose read-only `get_production_state(production_plan)` and
   `get_sales_plan_production_states(sales_plan)` for the UI.
7. Expose a System Manager reset for a stale `Processing` plan, permitted only
   when the heartbeat is stale **and** the recorded job is confirmed no longer
   in the queue (D17). Elapsed time alone is never sufficient.
8. Support safe retry after interruption or partial historical execution.
9. Add the D6 cancellation guard, preserving the `URY Sales Plan` exemption.
10. Build `production_plan_prepare.js`: the action, the confirmation explaining
    that manufacturing posts as complete, polling while `Processing`,
    consolidated blockers, generated document links, and the stale-reset
    control.

Acceptance criteria:

- Double-clicking cannot start two executions for one department.
- A shortage produces no new stock or manufacturing submissions.
- A blocked department does not block a ready one.
- Every generated document is traceable to its department plan.
- A retry resumes rather than duplicates.
- A plan in `Processing`, or with submitted Manufacture entries, cannot be
  cancelled.
- Two departments that both pass preflight, where the first consumes the shared
  Store stock, see the second abort under lock before creating anything.
- A plan whose job is still running cannot be reset, however old its heartbeat
  looks.
- A long-running execution never looks like a hung page.

### Agent 9 — Frontend

Dependencies: Agent 8's state contract, handed over at the start of wave 6.

1. Replace the singular service methods with the collection methods above.
2. Add `DepartmentProductionPlanState` with both axes kept separate (D12), and
   preserve the per-department snapshot-hash staleness signal.
3. Render each department's plan name, state and action inside the existing
   `groupedItems` department header.
4. Replace the single header-level Production Plan button with per-department
   controls, or keep a "create all" control that calls
   `createDepartmentProductionPlans`.
5. Show per-department blockers where that department's items already render.

Acceptance criteria:

- Every department section shows its own plan, link state and execution state.
- A blocked department is visibly distinct from a ready one.
- A completed department whose Sales Plan has since changed reads as both
  completed and stale, not as one or the other.
- The existing per-department filter, collapse and jump behaviour is unchanged.
- No screen still implies one Production Plan per Sales Plan.

### Agent 11 — PRE_PRODUCED stock-authority migration

Dependencies: Wave 0. No dependency on Agent 1, and no shared files with it.

`direct_retail_warehouse` is for DIRECT_RETAIL goods — bought in, not prepared.
It is currently also the PRE_PRODUCED finished-goods warehouse across several
shipped paths, and all of them move to the Department Warehouse (D13).

**Sizing: done. Result: no migration needed.** Measured on `ury.localhost`
(2026-09-21):

| Metric | Count |
| --- | --- |
| Active PRE_PRODUCED configurations | 7 |
| With `direct_retail_warehouse` set | 0 |
| Differing from their department warehouse | 0 |
| Without a department | 0 |

Every active PRE_PRODUCED configuration leaves `direct_retail_warehouse` blank,
so `resolve_production_context` returns `warehouse = None` for all of them, and
`project_fg_allocatable(item, None, company)` returns `allocatable_qty: 0`
without raising. Combined with `_fill_pre_produced`'s
`never_produced = bin_actual_qty <= 0`, every PRE_PRODUCED item on that site
reports `NOT_PRODUCED` through the stock path regardless of real stock.

**D13 is therefore a bug fix, not a migration.** There is no stock stranded in a
warehouse that is about to stop being authoritative, and no configuration whose
behaviour silently changes. The reporting patch in step 7 stays, because other
sites may differ, but on current evidence it will find nothing.

Re-run this on any other live site before rollout:

```sql
SELECT name, item, branch, department, direct_retail_warehouse
FROM `tabURY Item Production Configuration`
WHERE active = 1 AND production_policy = 'PRE_PRODUCED';
```

Compare each row's `direct_retail_warehouse` against its department's
`department_warehouse`. All equal or all unset means the change is
behaviour-preserving. Any that differ need a migration decision first, and that
is a product decision, not a technical one, because stock is already sitting in
those warehouses.

**Implementation:**

1. `ury_production_context.resolve_production_context`: PRE_PRODUCED resolves to
   the department warehouse; DIRECT_RETAIL keeps `direct_retail_warehouse`.
2. `ury_batch_manufacture_service.start_batch`: receive finished goods into the
   department warehouse, so the batch path and the Production Plan path agree.
3. `ury_production_validation.validate_item_production_configuration`: resolve
   the returned `warehouse` by policy rather than always from
   `direct_retail_warehouse`.
4. Reconcile the duplicate resolver at `ury_order_reservation_service.py:131`
   and its `_warehouse_for_context` helper to the single rule.
5. Update `ury_fulfilment_posting_service`'s comment and its assumption about
   where the batch path produced.
6. Update `pre_produced_item_seed.py` and `purchasing_seed.py`.
7. Ship a patch that **reports** every PRE_PRODUCED configuration whose
   `direct_retail_warehouse` differs from its department warehouse. It must not
   rewrite them.

Acceptance criteria:

- A PRE_PRODUCED item's availability reads the department warehouse.
- A DIRECT_RETAIL item's availability is unchanged.
- The batch-manufacture path and the Production Plan path receive finished goods
  into the same warehouse.
- Order reservation, KOT generation, fulfilment posting and the shadow report
  agree with availability on which warehouse is authoritative.
- The patch names every configuration whose behaviour will change, before it
  changes.
- No silent rewrite of any `direct_retail_warehouse` value.
- A PRE_PRODUCED item with real department stock stops reporting
  `NOT_PRODUCED`.

### Agent 10 — Integration and regression tests

Dependencies: all implementation agents. Fixtures come from the integration
owner.

Required scenarios:

1. All materials already available, single department.
2. Three departments, one plan each, correct target split.
3. Store shortage blocks one department with zero new writes.
4. A blocked department does not block a ready department.
5. Purchase receipt makes a department ready on retry.
6. Two departments compete for Store stock: the first transfer succeeds, the
   second fails with the current shortage and creates nothing.
7. Two departments preparing concurrently do not deadlock (D9).
8. Partial prior Department transfer.
9. Double-click and repeated execution on one department plan.
10. MTO item with a PRE_PRODUCED assembly.
11. Nested PRE_PRODUCED dependencies within one department.
12. Unstocked intermediate BOM nodes appear exploded in `required_items` while
    PRE_PRODUCED sub-assemblies appear as items (D1 and D2).
13. Configuration from another branch does not affect traversal (D3).
14. Cross-department PRE_PRODUCED dependency produces an unsupported-configuration
    blocker, not a transfer (D7).
15. Consolidated Purchase MR carries rows for several department plans, each
    correctly linked (D8).
16. Partial Work Order production.
17. Failure during Stock Entry submission.
18. Ordinary ERPNext, MTO and batch-manufacture Work Orders remain unaffected.
19. `sourcing_mode = EXTERNAL_RECEIPT` target creates no Work Order.
20. Cancel is refused after Manufacture entries are posted, and allowed with
    only unstarted Work Orders (D6).
21. A stale `Processing` plan is reset and retried without duplication (D5).
22. A BOM cycle is reported, not recursed (Agent 1).
23. A department plan that completed before its Sales Plan changed reports
    `link_state: 'stale'` with `execution_state: 'completed'` (D12).
24. Approving a Sales Plan creates no Production Plan; locking it with the
    toggle on creates one per department (D14).
25. Locking with the toggle off creates nothing, and the manual route then
    creates the same plans (D14).
26. A creation failure with the toggle on aborts the Lock transition and leaves
    the plan Approved (D14).
27. A URY Work Order created by hand from the desk receives the correct
    warehouses, and an unstocked intermediate in its BOM fails at Manufacture
    submit rather than mis-consuming silently (D16 amendment).
28. Generated Purchase and Transfer MRs are submitted, and a raised requirement
    produces a supplementary request rather than an amendment (D15).
29. A Work Order with a transferred or consumed quantity is not rewritten by the
    safeguard hook (D16).
30. Both departments pass preflight, the first consumes the shared Store stock,
    and the second aborts under Bin lock before creating anything (D17).
31. A plan whose job is still running cannot be reset despite a stale heartbeat
    (D17).
32. PRE_PRODUCED availability reads the department warehouse; DIRECT_RETAIL is
    unchanged (D13).
33. The batch-manufacture path and the Production Plan path receive PRE_PRODUCED
    finished goods into the same warehouse (D13).
34. Batch-controlled and serial-controlled item behaviour where applicable.

## Execution waves

Strictly sequential, except wave 1, where two agents share neither a file nor a
contract.

| Wave | Agents | Notes |
| --- | --- | --- |
| 0 | Integration owner | Custom fields via `setup_customizations` + patch + export, settings removals, hooks.py, fixtures. Blocks everything. |
| 1 | Agent 1 (BOM tree), Agent 11 (stock authority) | Disjoint files, no shared contract. Agent 11 runs its sizing query first (D13) and must land before Agent 4 relies on the department warehouse. |
| 2 | Agent 2 | Target and component-vector contracts published here. |
| 3 | Agent 3 (plans), Agent 6 (WO policy) | Both depend only on Agent 2's contracts; no shared files. |
| 4 | Agent 4 | Readiness engine and consolidated Purchase MR. |
| 5 | Agent 5 | Transfer MR and Store to Department execution. |
| 6 | Agent 7 | Work Order construction and Manufacture execution. |
| 7 | Agent 8 | Prepare Production orchestration; publishes the state contract. |
| 8 | Agent 9 | Frontend. |
| 9 | Agent 10 | Integration and regression suite. |

Unit tests stay with every agent throughout. Agent 10 owns integration tests
only.

## Coordination rules

- One integration owner manages fixtures, `hooks.py` and `custom_field.json`. No
  other agent edits those files.
- No agent invents a requirement calculation. Structure comes from the BOM tree
  service, policy from the target compiler, availability from the readiness
  engine.
- The Work Order hook consumes the compiled component vector. It must never
  re-interpret a BOM.
- Every generated document carries a deterministic Production Plan source
  reference, through ERPNext's native link fields wherever they exist.
- User-triggered operations fail visibly. Background hooks may log, but Prepare
  Production returns actionable errors, and the background job records failure in
  `custom_ury_production_result` and sets `Production Failed`.
- Test idempotency at every layer, not only at the orchestrator.
- Treat rollback as a safety net, not the idempotency mechanism.
- Do not modify normal ERPNext Work Order behaviour outside URY-linked
  Production Plans, and change no site-wide Manufacturing Setting.
- Do not touch `ury_bom_compiler.py`. `ury_availability.py` is read-only to
  every agent except Agent 11, which owns the stock-authority change.
- Never hand edit `ury/fixtures/custom_field.json`. Go through
  `setup_customizations.get_custom_fields()`, a patch, and
  `bench export-fixtures --app ury` (D18).
- Work Order construction belongs to the executor. The `validate` hook may
  reassert warehouse policy freely but must never rewrite `required_items` on a
  submitted Work Order or one with consumption history (D16).
- The synchronous preflight is advisory. No execution path may create a
  document on the strength of it without revalidating under Bin locks (D17).

## Definition of done

- One Production Plan exists per department per Sales Plan, each owning one
  Department Warehouse, its targets, its Transfer MR, its Work Orders and its
  own state.
- Production Plans include direct PRE_PRODUCED items and PRE_PRODUCED assemblies
  derived from MTO demand; MTO finished items, raw materials and DIRECT_RETAIL
  items are excluded.
- BOM structure, production policy and readiness live in three separate modules
  with the stated dependency direction and no back-edges.
- One consolidated Purchase MR per Sales Plan, one Transfer MR per department
  plan, all natively linked and idempotent.
- Prepare Production blocks before mutation when Store stock is insufficient,
  and a blocked department never blocks a ready one.
- URY Work Order `required_items` reflect URY's selective explosion, not
  ERPNext's all-or-nothing `use_multi_level_bom`.
- Each Production Plan exposes every blocker and generated document.
- Retrying, double-clicking, concurrent department execution or recovering a lost
  job cannot duplicate stock movement or production.
- A Production Plan cannot be cancelled out from under posted production.
- The Sales Plan UI shows each department's plan and state in the department
  grouping it already renders.
- Locking a Sales Plan creates its department Production Plans when the toggle
  is on, and a failure to do so blocks the lock visibly rather than leaving a
  gap.
- PRE_PRODUCED manufacturing output and POS availability read the same
  warehouse.
- Generated Material Requests are submitted and need no manual step before
  Prepare Production.
- The manager completes the workflow without opening a single Work Order.

# URY POS Checklist Flow — Reference

> Final semantics as implemented on `feat/checklist-migration-v2` (PR #509).
> Read this before changing anything about the Opening/Closing checklist.

## Business Rules (FINAL)

Every checklist objective has exactly two valid results:

- **PASS** — objective passed
- **FAIL** — objective failed (requires a remark)

**FAIL is a valid response. FAIL never blocks anything.**

Submission is allowed when:

1. every mandatory objective has a result (PASS or FAIL), and
2. every FAIL carries a non-empty remark.

Once submitted — **any PASS/FAIL mix** — the checklist counts as **SUBMITTED /
completed** for:

- the submitter's own gate (modal closes, workflow continues), and
- the **role hierarchy** (the next role is unlocked).

The only thing that blocks is: a mandatory objective with **no result**, a FAIL
without a remark, or a **predecessor role that has not submitted** its checklist.

## Role Hierarchy

The hierarchy controls **sequence only** — who must submit before whom. It does
**not** require any objective to PASS.

| Phase   | Order                                   |
| ------- | --------------------------------------- |
| Opening | Restaurant Manager → Cashier → Order Taker |
| Closing | Order Taker → Cashier → Restaurant Manager |

Both `/pos` (pos app) and `/ury/serve` (serve app, incl. captain routes in the
`frontend` app) consume the same backend API and enforce the identical rules.
The desk URY Order form and the POS Opening/Closing Entry hooks enforce the same
sequence server-side (no API/frontend bypass).

## State Model

Keep these concepts separate — past regressions came from conflating them:

```
Objective result:   PASS | FAIL            (stored per review row)
Checklist state:    submitted | not-submitted
                    submitted ⇔ a Quality Review exists whose objectives all
                    carry an explicit result (ERPNext doc status Passed OR Failed)
Submission validity: all mandatory answered + FAIL remarks
```

- `submit_checklist` returns **`Complete`** (submitted) or **`In Progress`**
  (some objective unanswered). There is intentionally **no "Failed" response
  state** — do not reintroduce one.
- Failed objectives do **not** resurface in the gate; only objectives with no
  result do.
- Failures remain recorded per-objective (with remarks) on the Quality Review
  for reporting.

## Data Model

- **POS Profile → `dependent_checklist`** (child table `Dependent Checklist`):
  `quality_checklist` (Link: Quality Goal), `select_2` (Option), `role` (Link: Role).
- **Option → phase mapping** (`OPTIONS_BY_CHECKLIST_TYPE` in `ury/ury_pos/api.py`):
  - Opening: `POS Opening Entry`, `Order Taking` (legacy), `RM Opening Checklist`,
    `Order Taker Opening Checklist`
  - Closing: `POS Closing Entry`, `RM Checklist` (legacy), `RM Closing Checklist`,
    `Order Taker Closing Checklist`
  - Legacy options keep their original phase binding so old configurations do not break.
- **Role ranking** (name-based, never usernames/emails): manager→RM (0),
  cashier→Cashier (1), captain/order/waiter→Order Taker (2). A user acts at their
  lowest configured rank. Unranked roles are outside the sequence.
- **Completion storage**: `Quality Review` per user/goal/branch/date; one
  `reviews` row per objective (`Passed`/`Failed` + remark). Resubmits update the
  same review. Legacy path also writes `URY POS Checklist Log` items (with the
  `status` Select; `is_checked` kept in sync for backward compatibility).

## Scoping

A checklist belongs to a **branch + business day + phase** (`_checklist_period_date`
= open shift's posting date, else today). Yesterday's, another branch's, or the
other phase's checklist never satisfies anything.

## Key Code Map

| Area | Location |
| --- | --- |
| Gate/status API | `ury/ury_pos/api.py` — `get_checklist`, `submit_checklist`, `_checklist_blocker`, `_goal_submitted`, `_own_position_goals`, `_phase_dependent_rows`, `_role_rank` |
| POS Opening Entry hook | `ury/ury/hooks/pos_opening.py` (requires the FULL opening hierarchy submitted: RM + Cashier + Order Taker) |
| POS Closing Entry hook | `ury/ury/hooks/pos_closing.py` (requires the FULL closing hierarchy submitted: Order Taker + Cashier + RM) |
| Desk URY Order form gate | `ury/ury/hooks/order_taking.py` (`ordertaker_checklist`) |
| Option values | `ury/ury/doctype/dependent_checklist/dependent_checklist.json` |
| Dialogs (PASS/FAIL radios) | `pos/src/components/ChecklistGateDialog.tsx`, `frontend/src/pages/Pos/components/ChecklistGateDialog.tsx`, `serve/src/operations/components/OpeningChecklist.tsx` |
| API clients | `pos/src/lib/checklist-api.ts`, `frontend/src/lib/pos/checklist-api.ts`, `serve/src/operations/api/checklist.ts` |
| Tests | `ury/ury_pos/test_api.py` (`TestDependentChecklistBridge`, `TestSubmitChecklistSEC10`), dialog tests beside each component |

## API Contract

`get_checklist(pos_profile, checklist_type)` →
`{ items: [{ item_label, is_mandatory, status, remarks, goal }], log_name,
log_status, blocked_by: { role, role_label, goals } | null }`

- `blocked_by` set → gate shows the named predecessor ("{Restaurant Manager}
  has not completed the {Opening Checklist} yet…") with **no items** and no submit.
- Otherwise items = the user's own objectives (numbered, prefilled with saved
  results); `log_status: "Complete"` when nothing is pending.

`submit_checklist(pos_profile, checklist_type, items, pos_opening_entry?)` →
`{ status: "Complete" | "In Progress", name }`; throws `ValidationError` for a
FAIL without remarks, `PermissionError` when a predecessor has not submitted.

## Setup Required on a Site (configuration, not code)

1. One **Quality Goal** per role/phase with its objectives (e.g. "RM Opening
   Checklist", "Cashier Opening Checklist", "Order Taker Opening Checklist" and
   the three closing counterparts).
2. POS Profile **Dependent Checklist** rows binding goal → phase option → role.
3. Users given the roles (URY Manager / URY Cashier / URY Captain or equivalents)
   and branch-linked via the Branch's `URY User` child table.
4. `bench migrate` after pulling the doctype changes.

## Change History (PR #509)

1. Role-based checklist surfaced in the POS UI (v16 `check_opening_entry`
   empty-list fix; Order Taking/RM options mapped to gates).
2. Goals expanded into objectives; per-objective Quality Reviews.
3. Explicit PASS/FAIL radios replacing checkbox=PASS; FAIL requires a remark.
4. Role sequence enforced (Opening ascending, Closing descending) via
   `blocked_by`.
5. FAIL treated as a valid submitted state — the all-Passed unlock, the
   `Failed` response state, and all failed-specific blocker UI were removed.

## Change History (follow-up: user-flow fix)

1. Gate dialogs (pos/frontend/serve) implement the three-state UX explicitly:
   STATE 1 blocked-by-predecessor (message + **Recheck** — no Start action),
   STATE 2 eligible (**Start Checklist** button reveals the existing form),
   STATE 3 already-submitted (auto-continues). Load failures get a Retry.
2. `ServeRouteGuard` runs the Opening checklist gate BEFORE the
   "POS is not open" / prior-day-close blocks — the hierarchy is part of the
   opening sequence, so it must be submittable while the POS is still closed.
3. `pos_opening.py` / `pos_closing.py` gate the shift documents on the FULL
   role hierarchy (previously only the step before the Cashier):
   opening needs RM + Cashier + Order Taker submitted; closing needs
   Order Taker + Cashier + RM submitted.
4. `order_taking.ordertaker_checklist` exempts by Role (was Role Profile).

## Gotchas

- ERPNext derives the **Quality Review doc status** from its rows
  (`validate` → `set_status`): any Open row → `Open`, any Failed → `Failed`,
  else `Passed`. Never filter reviews by `status: ["in", ["Open", "Passed"]]`
  expecting to find failed ones — a failed review has status `Failed`.
- **Frappe v16 gates `run_before_save_methods` by action**: the `save` action
  runs `validate` + `before_save` hooks, the `submit` action runs `validate` +
  `before_submit` — and never `before_save`. The POS opening screen creates
  POS Opening Entries with `.submit()` on a new doc, so any hook registered
  only under `before_save` is silently skipped on that path. The checklist
  gate is therefore wired to BOTH `before_save` and `before_submit`
  (`ury/hooks.py`). The closing flow is safe because it inserts a draft
  (save action) before submitting, and its gate lives under `validate`
  (which runs for both actions).
- ERPNext v16's `check_opening_entry` returns `[]` (not `1`) when no entry is
  open — both `POSOpeningProvider` copies treat `1` or an empty list as
  "not opened".
- The full-module frappe test runner crashes on this dev site before reaching
  these tests (erpnext's test bootstrap inserts a fiscal year overlapping the
  site's real FY) — run the classes directly via `unittest` until that is fixed.

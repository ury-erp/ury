# URY Sales Plan — Workflow

Ships a standard Frappe `Workflow` record so admins can transition a
"URY Sales Plan" document's `status` field directly from Desk
(`/app/ury-sales-plan`), mirroring the state machine defined in
`ury/ury/api/ury_sales_plan.py::TRANSITIONS`.

## KNOWN GAP — Desk transitions bypass `transition_sales_plan()` guardrails

`transition_sales_plan()` in `ury/ury/api/ury_sales_plan.py` performs several
checks that are **not** re-implemented anywhere else:

- `_validate_plan_scope()` — branch/company consistency check
- `validate_plan_items()` + `freeze_approval_snapshot()` — run specifically
  on the transition into `Approved`, freezing a deterministic snapshot used
  downstream for production
- `append_audit()` — appends an entry to `audit_log` for every transition

The `URYSalesPlan` controller (`ury/ury/doctype/ury_sales_plan/ury_sales_plan.py`)
is a bare `pass` — it has no `validate()`/`before_save()` hook, so none of
the above logic runs on a plain `doc.save()`. Frappe's built-in Workflow
engine only flips the `status` field via the configured `update_field` /
`update_value` on a transition action; it does not call
`transition_sales_plan()` or any other custom Python.

**Net effect:** a System Manager (or "URY Manager") driving this Workflow's
actions from standard Desk can move a Sales Plan into `Approved` (or any
other state) without the scope check, without freezing an approval
snapshot, and without an audit log entry being recorded. Only the
custom frontend's API path (`transition_sales_plan`) currently gets those
guarantees.

**Follow-up (not done here, time-boxed per plan):** move the guardrail logic
from `transition_sales_plan()` into `URYSalesPlan.validate()` (or
`before_save()`) so it runs unconditionally regardless of which path changed
`status`, then have `transition_sales_plan()` just perform the transition check
and call `doc.save()`. Until that refactor lands, treat direct Desk-driven
transitions on this doctype as a way to bypass approval-snapshot freezing and
audit logging.

## Role assumption

`URY Manager` is used for the approval-and-later transitions (`Approve`,
`Lock for Production`, `Supersede/Cancel` from `Approved`/`Locked for
Production`), matching the role the frontend already gates its
manager-only actions on (see `isManager` / `NEXT_ACTION[...].managerOnly` in
`frontend/src/pages/Dashboard/SalesPlanPage.tsx`, sourced from
`frontend/src/store/useAuth.ts`'s check for `roles.includes('URY Manager')`).

`System Manager` is used for the earlier, non-approval transitions
(`Draft` → `Proposed` → `Submitted for Approval`) since no more specific
role for plan authors/proposers was found in the codebase. Adjust if a
dedicated role (e.g. "Sales Plan Proposer") is introduced later.

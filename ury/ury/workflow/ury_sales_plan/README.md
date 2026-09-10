# URY Sales Plan — Workflow

Ships a standard Frappe `Workflow` record so admins can transition a
"URY Sales Plan" document's `status` field directly from Desk
(`/app/ury-sales-plan`), mirroring the state machine defined in
`ury/ury/api/ury_sales_plan.py::TRANSITIONS`.

The actual fixture data lives at `ury/fixtures/workflow.json` (sibling of
`ury/fixtures/role.json` etc) — that is the only path
`frappe.utils.fixtures.sync_fixtures()` reads on `bench migrate`
(`frappe.get_app_path("ury", "fixtures")` resolves to the physical directory
of the top-level `ury` package, i.e. `<repo-root>/ury/`, since that's where
`hooks.py` itself lives — NOT the nested `ury/ury/` subpackage that
`ai_tools`, `commands`, etc. live under). Two earlier versions of this fix
got the fixture path wrong and the Workflow record silently never imported
on any real `bench migrate`, despite `before_migrate` correctly seeding its
`Workflow State`/`Workflow Action Master` dependencies each time:

1. First at `ury/ury/workflow/ury_sales_plan/ury_sales_plan.json` (mirroring
   a doctype-definition folder's `<name>/<name>.json` shape) — fixture sync
   doesn't scan doctype-shaped folders at all.
2. Then at `ury/ury/fixtures/workflow.json` (nested under the `ury/ury/`
   subpackage, since that's where this workflow's own `install.py` genuinely
   lives per the `ury.ury.workflow.ury_sales_plan.install` dotted hook path)
   — but `get_app_path` resolves to `ury/fixtures/`, one level up, not
   `ury/ury/fixtures/`.

Confirmed live both ways: `bench console` → `frappe.get_all("Workflow",
pluck="name")` returned `[]` after a full `bench migrate` with the fixture
at either wrong path, and returned `["URY Sales Plan"]` once it was moved to
the correct `ury/fixtures/workflow.json`. `install.py` (this directory,
`ury/ury/workflow/ury_sales_plan/`) is unaffected by this — its
`ury.ury.workflow.ury_sales_plan.install` dotted import path is a normal
Python package path, not a `get_app_path` fixtures lookup, and was correct
from the start.

## FIXED — Desk transitions used to bypass `transition_sales_plan()` guardrails

`transition_sales_plan()` in `ury/ury/api/ury_sales_plan.py` used to perform
several checks inline that were **not** re-implemented anywhere else:

- `_validate_plan_scope()` — branch/company consistency check
- `validate_plan_items()` + `freeze_approval_snapshot()` — run specifically
  on the transition into `Approved`, freezing a deterministic snapshot used
  downstream for production
- `append_audit()` — appends an entry to `audit_log` for every transition

Frappe's built-in Workflow engine only flips the `status` field via the
configured `update_field` / `update_value` on a transition action; it does
not call `transition_sales_plan()` or any other custom Python. So a plain
`doc.save()` driven from `/app/ury-sales-plan`'s Workflow actions used to
skip all of the above.

This is now fixed: `URYSalesPlan.validate()`
(`ury/ury/doctype/ury_sales_plan/ury_sales_plan.py`) runs these same
guardrails whenever `status` actually changes on a save, regardless of
whether the save was driven by the custom frontend's `transition_plan` API
or by a Desk/Workflow action. `transition_sales_plan()` itself now only
checks whether the requested transition is a legal edge in `TRANSITIONS`
and flips `doc.status` — it no longer duplicates the guardrail calls, so
`audit_log` is appended to exactly once per save.

## Role assumption

`URY Manager` is used for every transition in this workflow (`Propose`,
`Submit for Approval`, `Approve`, `Lock for Production`,
`Supersede/Cancel`), matching the roles this doctype's own permissions grant
write access to (`System Manager` and `URY Manager` — no third role exists)
and the frontend's actual gating: `SalesPlanPage.tsx`'s `NEXT_ACTION` offers
`Propose`/`Submit for Approval`/`Lock for Production` to any signed-in URY
Manager (no `managerOnly` flag) and gates only the `Approve` step behind
`managerOnly`/`isManager` (`useAuth.ts`, `roles.includes('URY Manager')`).
`System Manager` still gets through every transition via Administrator/System
Manager's implicit full access, so no separate `allowed` entry is needed for
it.

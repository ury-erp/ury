# URY Sales Plan — Workflow

Ships a standard Frappe `Workflow` record so admins can transition a
"URY Sales Plan" document's `status` field directly from Desk
(`/app/ury-sales-plan`), mirroring the state machine defined in
`ury/ury/api/ury_sales_plan.py::TRANSITIONS`.

The actual fixture data lives at `ury/ury/fixtures/workflow.json` — that is
the only path `frappe.utils.fixtures.sync_fixtures()` reads on `bench
migrate` (`frappe.get_app_path(app, "fixtures")`, one level per app, not
per-doctype). An earlier version of this fix placed the JSON at
`ury/ury/workflow/ury_sales_plan/ury_sales_plan.json` (mirroring a
doctype-definition folder's `<name>/<name>.json` shape) — that path is never
scanned by fixture sync, so the Workflow record silently never imported on
any real `bench migrate` despite `before_migrate` seeding the `Workflow
State`/`Workflow Action Master` rows correctly. Confirmed live: after moving
the JSON here, `bench --site <site> execute frappe.client.get_list
--kwargs '{"doctype": "Workflow"}'` returns the `URY Sales Plan` record after
migrate; it did not before. `install.py` (this directory) still owns the
`before_migrate` seeding of `Workflow State`/`Workflow Action Master`, since
those are separate doctypes fixture sync does not create for you.

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

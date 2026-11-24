# URY Approval & Control System — v16 Audit

## Scope and baseline

- Repository: `ury-erp/ury`, `upstream/version-16` at `c349e14d3`, feature branch `feature/approval-control-system-v16`.
- URY customizes ERPNext's standard `Item` and `Branch` DocTypes through fixtures and `doc_events`; neither is a URY-owned DocType.
- No URY hooks currently target Purchase Invoice, Purchase Order, Purchase Receipt, Payment Entry, Employee Advance, Expense Claim, Budget, Accounting Period, or Journal Entry for approval/control purposes.
- ERPNext core and HRMS core files are out of scope. New behavior must be additive through URY custom fields, controllers, fixtures, and document hooks.

## Existing v16 structures

### Item

Existing URY Item custom fields are `custom_opportunity_costs`, `disposable_items`, `is_disposable`, and the yield-standard fields `custom_yield_percent`, `custom_yield_tracked`, `custom_yield_check_cadence`, and `custom_yield_check_interval_days`.

`ury/ury/hooks/ury_item.py` updates menu/add-on data and enforces yield validation and yield-standard permissions. It contains no purchase price control, warning limit, approval limit, percentage limit, or authority-level logic. No Item Group price-limit fallback exists.

Reusable pattern: add server-side Item validation to the existing `Item.validate` hook and keep mandatory-field enforcement independent of Desk field properties so API/import writes are covered.

### Branch

Existing URY Branch fields are company, a required URY User child table, aggregator settings, unpaid/no-tax settings, reservation settings, and branch timing statistics. `Cost Center`, `Journal Entry`, `Stock Entry`, `Stock Reconciliation`, POS documents, and POS Profile have separate URY branch customizations.

There is no master approval switch, purchase/payment/expense/backdated configuration, branch buying price list, approval-level table, payment threshold, period lock day, or P&L finalization setting. Purchase Invoice, Purchase Order, Purchase Receipt, Payment Entry, and Employee Advance have no URY `branch` custom field in the v16 fixture.

Reusable pattern: `Branch-company` already links a branch to its company, and `Cost Center-branch` can associate native budgets with a branch when the budget is cost-center based.

### Purchase, payment, expense, advance, and budget

- Purchase Invoice/Order expose native `buying_price_list`; URY has no purchase validation hook. Standard Item Price records can be reused for comparison.
- Payment Entry has native posting date, mode of payment, paid/base paid amount, payment accounts, and cost center. URY has no Payment Entry controller or hook.
- Employee Advance is supplied by the installed HRMS app, not ERPNext core. It has draft/submit lifecycle, advance amount, posting date, mode of payment, and paid/status fields. Its native controller sets status and validates accounts and payments; URY must add `validate`/`before_submit` guards without replacing them.
- HRMS Expense Claim has its own native approval status. No URY integration exists, and the specification's term “Expense” does not identify a unique target DocType.
- ERPNext v16 Budget is a submittable, single-account document budgeted against Cost Center or Project. It has `budget_start_date`/`budget_end_date`, `distribution_frequency`, and `Budget Distribution` child rows with explicit start/end dates and amounts. This replaces older monthly-percentage-only assumptions.
- Native actuals come from GL Entry. Native commitments include open Material Requests and unbilled Purchase Order item balances (`amount - billed_amt`), which naturally handles partial invoicing. Returns affect actual GL amounts; cancellation excludes documents/ledger entries.
- Native Budget Stop is enforced by `erpnext/controllers/budget_controller.py` and `erpnext/accounts/doctype/budget/budget.py`. URY must not bypass or replace those calls.

### Existing approvals, workflows, alerts, and period logic

- The `URY Sales Plan` Workflow and its approval snapshot/hash logic are specific to production planning. `URY Issue Authorization` consumes that snapshot. These are useful implementation patterns for state fixtures, hashes, and audit evidence, but are not a general approval engine and must remain unchanged.
- No URY Approval Request, append-only Approval Log, branch Period Lock, or general approval API exists.
- `URY Daily P and L` is a daily operational report with branch/date and financial details. It is not a monthly finalization/lock mechanism and has no finalized-period state suitable for the requested control.
- Alert Rule/Alert Settings support a fixed set of operational alert types; there is no backdated-entry alert type or generic approval notification service.
- No URY period-lock validation was found.

### Native restrictions to preserve

- Accounting Period document and GL validations remain in ERPNext and throw `ClosedAccountingPeriod`.
- Company accounts-freeze and Period Closing Voucher checks remain in ERPNext's GL posting path.
- Native Budget Stop/Warn/Ignore behavior and its exception approver role remain unchanged.
- Employee Advance and Payment Entry native validation, payment, and ledger behavior must not be overridden.

## Version-15 price-control audit

`upstream/version-15` was inspected read-only through Git object lookups. Its Item hook is materially the same yield/menu hook as v16. Its Item and Branch custom-field fixtures contain no price-control fields. Searches across v15 Python, JavaScript, JSON, and Markdown found no `enable_price_control`, price-control, warning/approval price-limit, or warning/approval percentage-limit implementation. Repository-wide history search for `enable_price_control` also returned no match. `fork/version-15` is not present.

Therefore the requested existing v15 item price-control feature could not be located and cannot be ported from the supplied branches. This is recorded as a blocking open question; no substitute source or Item Group design will be invented.

## What can be reused

1. Existing URY `doc_events`, custom-field fixtures, workflow fixtures, patch conventions, and IntegrationTestCase test style.
2. Existing Sales Plan snapshot/hash concepts as design evidence only, without changing its workflow.
3. Native Item Price, Price List, Budget, Budget Distribution, GL Entry, Purchase Order billed amounts, Mode of Payment, and Accounting Period APIs/data.
4. Existing Branch-company and Cost Center-branch fields.
5. Existing role fixtures and URY permission patch patterns.

## What must be ported

No price-control implementation was found in the available v15 branch. Porting is blocked pending the correct source branch/commit or confirmation that a new implementation is acceptable.

## What must be built new

1. General URY Approval Request, append-only URY Approval Log, approval-level/configuration child DocTypes, URY Period Lock, workflow fixture, server APIs, permissions, version/action hashing, independent control instances, status-change notifications, and self-approval policy.
2. Branch master/control settings and server-side approver validation, plus branch fields and branch price-list configuration for supported transactions.
3. Item price-control fields and validation once the missing v15 source question is resolved.
4. Purchase price evaluation, warnings, request upsert, version invalidation, and submit guards for the confirmed purchase DocTypes.
5. Payment/advance routing and draft/submit/payment guards without changing native payment validation.
6. Branch-aware expense/budget resolution, available-budget calculation, concurrency-safe reservations and release/adjustment lifecycle for confirmed expense DocTypes.
7. Monthly P&L finalization/reopen permission, branch period locks, exception approvals, and alerts for confirmed transaction coverage.
8. Mixed-branch detection and server-side submission blocking for the confirmed document/row branch sources.
9. Required Frappe automated tests, baseline comparison, REST/API checks, native restriction regression checks, and end-to-end regression report.

## Test/tooling findings

- Python uses Ruff with 110-character lines, tab indentation, and the rule set in `pyproject.toml`.
- Backend tests use Frappe `IntegrationTestCase` and run with explicit `bench --site <site> run-tests ...` commands.
- `.github/workflows/test-v16-nightly.yml` is the v16 backend suite reference. It shards per-module runs and documents known excluded/pre-existing failures; both the baseline and feature runs must use the same method for a meaningful comparison.
- Tests must use a separate test site, not the active development site. New DocTypes/custom fields require an explicit site migration before integration tests.

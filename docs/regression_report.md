# URY Approval & Control System — Regression Report

## Environment and method

- Feature branch: `feature/approval-control-system-v16`.
- Clean baseline: unmodified `version-16` at `c349e14d3`, loaded from `apps/ury-version16-baseline` and confirmed with `frappe.get_app_path("ury")`.
- Test site: `g1v16.localhost`, not the active development site.
- Focused command: `bench --site g1v16.localhost run-tests --app ury --module ury.ury.approval.test_approval_controls`.
- Full-suite command on both branches: `bench --site g1v16.localhost run-tests --app ury`; the baseline used `PYTHONPATH` to select its worktree.
- REST checks used real HTTP requests to the running test server with temporary API credentials. Record-specific transactions, approval requests/logs/notifications, credentials, GL rows for temporary accounts, and budget reservations were removed. Broad cleanup of older interrupted fixtures was stopped when native links led to unrelated stock history; those older records were left untouched, and no full database-cleanliness audit is claimed.

## Focused automated tests

Final result: **33 tests passed**.

| Test | Expected result | Actual result | Result |
|---|---|---|---|
| `test_approval_log_cannot_be_edited_or_deleted` | Normal document writes and deletes are denied | `PermissionError` on edit and delete | PASS |
| `test_approval_records_cannot_be_forged_through_document_api` | Direct creation of approved requests/logs is denied | Both forged creates raised `PermissionError` | PASS |
| `test_branch_requires_approver_when_control_enabled` | Enabled control without an approver cannot be saved | Branch validation raised `ValidationError` | PASS |
| `test_budget_reservations_change_routing_and_release` | Within-budget uses level 1; excess uses all levels; rejection releases reservation | Plans had 1 and 2 levels; rejected reservation became `Released` | PASS |
| `test_changed_amount_invalidates_approval` | Amount change invalidates old approval and opens a new request | Old `Invalidated`; new `Pending` | PASS |
| `test_changed_purchase_rate_invalidates_price_approval` | Rate change invalidates a purchase-price approval | Old request invalidated; new pending request created | PASS |
| `test_concurrent_expenses_do_not_share_available_budget` | Simultaneous expenses serialize against available budget | Committed requests had plans of lengths 1 and 2 | PASS |
| `test_consumed_reservations_do_not_double_count_actuals_or_po_commitments` | Native actuals/commitments are not double counted | Available amounts matched expected values | PASS |
| `test_disabled_feature_preserves_pending_request` | Disabled payment control stops checks and preserves configuration/request | Status/hash/configuration unchanged | PASS |
| `test_disabled_purchase_price_control_preserves_pending_request` | Disabled purchase control preserves its pending request and level configuration | Request/hash and both levels unchanged | PASS |
| `test_employee_advance_payment_fields_do_not_invalidate_draft_approval` | Native payment lifecycle fields do not invalidate draft approval | Approved request still matched | PASS |
| `test_item_price_control_limits_are_mandatory` | Enabled Item control rejects missing warning/approval amount or percentage limits | Every incomplete variant raised `ValidationError`; complete Item saved | PASS |
| `test_locked_period_requires_approval_and_alert` | Finalized month and earlier months require exception approval and alert; reopen clears lock | Request/alert created; reopen cleared both checks | PASS |
| `test_missing_price_list_price_warns_without_purchase_approval` | Missing Item Price warns only and native submission remains allowed | Warning present; no request; Purchase Order submitted | PASS |
| `test_mixed_branch_is_blocked_before_request` | Mixed-branch submit is blocked before request creation | Submit raised `ValidationError`; no request existed | PASS |
| `test_multiple_controls_are_independent` | One approval type never satisfies another | Payment approved; expense stayed `Pending` | PASS |
| `test_native_accounting_period_still_blocks` | Native closed Accounting Period still blocks | Native `ClosedAccountingPeriod` raised | PASS |
| `test_native_budget_stop_still_blocks` | Native Budget Stop still blocks with URY enabled | Native `BudgetError` raised | PASS |
| `test_no_budget_warns_without_request` | Missing budget warns only and creates no expense approval | Orange warning present; no request | PASS |
| `test_payment_limit_boundaries` | ₹99,999 and ₹1,00,000 route to RM; ₹1,00,001 to Finance Head | All three routes matched | PASS |
| `test_purchase_approval_survives_native_item_price_auto_update` | Native Item Price auto-update cannot erase the original comparison basis | Item Price changed to 125; request retained reference 100; block/approve/submit succeeded | PASS |
| `test_purchase_price_amount_or_percentage_crossing_routes_higher` | Crossing either measure escalates to the higher authority | Amount-only and percentage-only cases both routed to level 2 | PASS |
| `test_purchase_price_snapshot_cannot_be_forged` | Client-edited reference snapshot cannot bypass approval | Stored reference stayed 100; request stayed pending; submit blocked | PASS |
| `test_purchase_price_warning_and_approval_levels` | Within warning is silent; above warning warns; above level-one approval routes higher | No request for first two; level 2 Finance Head request for last | PASS |
| `test_real_advance_requires_independent_draft_approvals_before_submit` | Advance needs independent payment and expense approvals | Both unapproved submits blocked; approved submit succeeded; reservation lifecycle correct | PASS |
| `test_real_backdated_payment_requires_exception_approval` | Locked-period payment blocks, alerts, then submits after exception approval | All steps passed | PASS |
| `test_real_bank_payment_limit_boundaries` | Real payments follow exact configured boundaries and approved boundary payment submits | ₹99,999/RM, ₹1,00,000/RM, ₹1,00,001/Finance; approved submit passed | PASS |
| `test_real_expense_above_budget_uses_all_configured_levels` | Over-budget advance requires sequential configured levels | Level 1 then level 2 decisions required; submission succeeded | PASS |
| `test_real_purchase_price_approval_blocks_then_allows_submit` | Real Purchase Order blocks until exact version is approved | Unapproved submit blocked; persisted hash matched; approved submit succeeded | PASS |
| `test_repeated_save_reuses_open_request_and_notifies_once` | Repeated save reuses request and sends no duplicate status notification | Same request; no notification increase | PASS |
| `test_self_approval_requires_explicit_branch_permission` | Self-approval works only when explicitly enabled | Enabled branch allowed requester approval | PASS |
| `test_submit_lifecycle_changes_do_not_invalidate_approval` | `docstatus`/status changes alone do not invalidate approval | Approved request still matched | PASS |
| `test_unauthorized_and_self_approval_are_blocked` | Unauthorized user and requester cannot approve | Both decisions raised `PermissionError` | PASS |

## HTTP REST end-to-end checks

Final purchase/branch-limit run:

| Test | Expected result | Actual result | Result |
|---|---|---|---|
| Warning-only Purchase Order | Creation succeeds without approval | Zero `purchase_price` requests | PASS |
| Approval-required Purchase Order | Unapproved submit blocked; Finance Head decision and requester submit succeed | Block HTTP 403; decision HTTP 200; submit HTTP 200; level 2 | PASS |
| Branch bank limits | ₹1,00,000 routes to RM; ₹1,00,001 to Finance Head; approved boundary payment submits | Roles matched exactly; decision/submit HTTP 200 | PASS |
| Branch expense budget limits | Within budget uses one level; excess uses two; payment approval remains independent | Plans 1 and 2; both advances had independent payment and expense requests | PASS |
| Disabled purchase control | Native submit proceeds without auto-approving or changing pending request | Submit HTTP 200; request stayed `Pending` with original hash | PASS |

The earlier REST permission suite also passed: unapproved payment HTTP 403, requester self-approval HTTP 403, configured approval/submission HTTP 200, disabled payment control preserving its request, and an uncontrolled branch submitting natively with zero requests.

## Full-suite baseline comparison

Clean baseline run:

- DocType-oriented phase: 37 tests, 5 failures and 7 errors.
- App-wide phase: 1,041 tests, 7 failures, 4 errors, 1 skipped.
- Final test-record preload stopped on the existing overlapping Fiscal Year `2025-2026` fixture.

Feature run after Item/purchase implementation:

- DocType-oriented phase: 70 tests completed, 5 failures and 7 errors.
- App-wide phase: 1,041 tests, 7 failures, 4 errors, 1 skipped.
- Final preload stopped on the same Fiscal Year fixture.
- Parsed comparison against the clean baseline: **23 failing test names on each branch, zero new failures**.

A repeat baseline run after migrating the shared test database produced ten additional Sales Plan errors because the baseline Python tree cannot import the newly migrated `URY Item Price Approval Limit` DocType. These are baseline/schema mismatch artifacts, not feature regressions; the original clean baseline remains the comparison reference.

Both normal full-suite commands remain red because of the existing baseline failures. No new failing test was introduced by this feature.

## Not separately exercised

| Scenario | Status | Evidence |
|---|---|---|
| Native accounting freeze | NOT SEPARATELY RUN | URY does not override GL posting/freeze validation; Budget Stop and Accounting Period were explicitly tested. |
| Real partial-invoicing and returns round trip | PARTIALLY COVERED | Native unbilled PO and GL queries implement the math; rejection/cancellation/consumption and double-count tests passed, but no full partial-invoice/return business round trip was run. |

## Lint and formatting

`uvx ruff format` and `uvx ruff check` were used because Ruff was unavailable globally and in the bench environment. Final changed-file checks passed, and `git diff --check` reported no whitespace errors.

## Fixes made during regression testing

1. Corrected the native Budget Stop fixture and prevented forged approval/log/period records through normal document APIs.
2. Normalized lifecycle/persistence-only hash fields. Nested child-row names are excluded because Frappe assigns some only during database insert; parent name, row order, amounts, rates, quantities, branches, and business fields remain hashed.
3. Preserved valid approvals through submission while amount/rate/branch changes still invalidate them.
4. Restricted native workflow bypass to internal URY approval writes; approver authorization remains enforced.
5. Fixed finalized-period coverage for earlier months and prevented double counting of native PO commitments/actuals.
6. Captured purchase reference prices before native validation so ERPNext's automatic Item Price update cannot change the basis of an existing approval.
7. Persisted server-owned price snapshots and ignored forged client snapshot values on both save and direct submit.
8. Kept purchase-price, payment, and expense requests independent throughout REST and real-document flows.

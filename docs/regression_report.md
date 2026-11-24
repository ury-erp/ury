# URY Approval & Control System — Regression Report

## Environment and method

- Feature branch: `feature/approval-control-system-v16`.
- Baseline: unmodified `version-16` at `c349e14d3`, loaded from the separate `apps/ury-version16-baseline` worktree and confirmed with `frappe.get_app_path("ury")`.
- Test site: `g1v16.localhost` (not the active development site).
- Focused tests: `bench --site g1v16.localhost run-tests --app ury --module ury.ury.approval.test_approval_controls`.
- Full suite: identical `bench --site g1v16.localhost run-tests --app ury` commands on feature and baseline. The baseline command used `PYTHONPATH` to select the baseline worktree.
- REST checks used real HTTP requests to the running test server with temporary API credentials. All temporary users, credentials, documents, requests, ledger rows, accounts, and branches were removed afterward.

## Focused automated tests

Final result: **23 tests passed**.

| Test | Expected result | Actual result | Result |
|---|---|---|---|
| `test_approval_log_cannot_be_edited_or_deleted` | Normal document writes and deletes are denied | `PermissionError` on edit and delete | PASS |
| `test_approval_records_cannot_be_forged_through_document_api` | Direct creation of approved requests/logs is denied | Both forged creates raised `PermissionError` | PASS |
| `test_branch_requires_approver_when_control_enabled` | Enabled control without an approver cannot be saved | Branch validation raised `ValidationError` | PASS |
| `test_budget_reservations_change_routing_and_release` | Within-budget expense uses level 1; excess uses all levels; rejection releases reservation | Plans had 1 and 2 levels; rejected reservation became `Released` | PASS |
| `test_changed_amount_invalidates_approval` | Amount change invalidates the old approval and opens a new request | Old request `Invalidated`; new request `Pending` | PASS |
| `test_concurrent_expenses_do_not_share_available_budget` | Two simultaneous expenses serialize against available budget | Two committed requests had plans of lengths 1 and 2 | PASS |
| `test_consumed_reservations_do_not_double_count_actuals_or_po_commitments` | Submitted PO/actual expenses are not double counted; consumed advances remain counted | Available amounts matched expected values | PASS |
| `test_disabled_feature_preserves_pending_request` | Disabled control stops checks without changing configuration or pending request | Status/hash/configuration unchanged | PASS |
| `test_employee_advance_payment_fields_do_not_invalidate_draft_approval` | Native submit/payment lifecycle fields do not invalidate a draft approval | Approved request still matched | PASS |
| `test_locked_period_requires_approval_and_alert` | Finalized month and earlier months need exception approval and create an alert; reopen removes lock | Request and `Notification Log` alert created; reopen cleared both month checks | PASS |
| `test_mixed_branch_is_blocked_before_request` | Mixed-branch submit is blocked before request creation | Submit raised `ValidationError`; no request existed | PASS |
| `test_multiple_controls_are_independent` | Approving one control does not approve another | Payment approved; expense stayed `Pending` | PASS |
| `test_native_accounting_period_still_blocks` | Native closed Accounting Period still blocks with URY enabled | Native `ClosedAccountingPeriod` raised | PASS |
| `test_native_budget_stop_still_blocks` | Native Budget Stop still blocks with URY enabled | Native `BudgetError` raised | PASS |
| `test_no_budget_warns_without_request` | Missing budget warns only and creates no approval | Orange warning present; no request | PASS |
| `test_payment_limit_boundaries` | ₹99,999 and ₹1,00,000 route to RM; ₹1,00,001 to Finance Head | All three routes matched | PASS |
| `test_real_advance_requires_independent_draft_approvals_before_submit` | Real advance needs payment and expense approvals before submit; cancellation releases reservation | Both unapproved submits blocked; approved submit succeeded; reservation `Consumed` then `Released` | PASS |
| `test_real_bank_payment_limit_boundaries` | Real payment saves route at exact boundary; persisted hash remains valid; approved payment submits | ₹1,00,000/RM and ₹1,00,001/Finance matched; approved ₹1,00,000 payment submitted | PASS |
| `test_repeated_save_reuses_open_request_and_notifies_once` | Repeated save reuses request, preserves requester, and sends no duplicate status notification | Same request name; no notification count increase | PASS |
| `test_self_approval_requires_explicit_branch_permission` | Self-approval works only when explicitly enabled | Enabled branch allowed requester approval | PASS |
| `test_submit_lifecycle_changes_do_not_invalidate_approval` | `docstatus`/status changes alone do not invalidate approval | Approved request still matched | PASS |
| `test_unauthorized_and_self_approval_are_blocked` | Unauthorized user and requester cannot approve | Both decisions raised `PermissionError` | PASS |
| `test_real_backdated_payment_requires_exception_approval` | Real locked-period payment is blocked, alerts, then submits after exception approval | Unapproved submit blocked; alert existed; approved submit succeeded | PASS |

## HTTP REST end-to-end checks

| Test | Expected result | Actual result | Result |
|---|---|---|---|
| Unapproved bank payment | Server blocks submission | HTTP 403 | PASS |
| Requester approves own request | Server denies decision | HTTP 403 | PASS |
| Configured approver, then requester submits | Decision and submission succeed | Decision HTTP 200; submit HTTP 200 | PASS |
| Payment control disabled with pending request | Native submission proceeds; request and hash remain unchanged | Submit HTTP 200; request stayed `Pending` with original hash | PASS |
| Branch with no URY control | Native submission proceeds and no request is created | Submit HTTP 200; zero URY requests | PASS |

The REST checks also verified that an Accounts User without read permission on `URY Approval Request` can submit an approved payment. Internal approval writes bypass native workflow transition checks, while configured approver and self-approval checks remain enforced.

## Full-suite baseline comparison

Baseline combined run:

- DocType-oriented phase: 37 tests, 5 failures and 7 errors.
- App-wide phase: 1,041 tests, 7 failures, 4 errors, 1 skipped.
- Final test-record preload also stopped on the existing overlapping Fiscal Year `2025-2026` fixture.

Feature final run:

- DocType-oriented phase: 60 tests (including all 23 new approval tests), 5 failures and 7 errors.
- App-wide phase: 1,041 tests, 7 failures, 4 errors, 1 skipped.
- Final test-record preload stopped on the same overlapping Fiscal Year `2025-2026` fixture.
- Automated comparison parsed 23 failing test names on each branch: **0 new failures and 0 missing baseline failures**. The comparison was repeated after Ruff formatting with the same result.

Both branches therefore have the same pre-existing failure set; the feature introduces no detected full-suite regression. The full-suite commands themselves remain red because those baseline failures still exist.

## Blocked or not fully exercised

| Scenario | Status | Reason / evidence |
|---|---|---|
| Item price-control mandatory fields | BLOCKED | No v15 implementation exists in the supplied branch, site database, or available Git history. See `docs/open_questions.md` question 1. |
| Warning-only and approval-required purchase price increases | BLOCKED | Depends on the missing v15 Item price-control source. No replacement design was invented. |
| Purchase price warning/block/approve/submit business flow | BLOCKED | Same missing source. |
| Native accounting freeze | NOT SEPARATELY RUN | URY does not override GL posting or freeze validation; Budget Stop and Accounting Period were explicitly tested. |
| Partial invoicing and return reservation lifecycle | PARTIALLY COVERED | Native unbilled PO and GL queries implement the math; rejection/cancellation/consumption and double-count tests passed, but no real partial-invoice/return round trip was run. |

## Lint and formatting

`uvx ruff format` and `uvx ruff check` completed successfully for all approval modules and new DocType controllers. Ruff was run in an isolated `uv` tool environment because it was not installed globally or in the bench virtual environment.

## Fixes made during regression testing

1. Corrected the native Budget Stop test to use an existing Cash account; the original fixture had no Bank account and failed before reaching Budget Stop.
2. Prevented forged approval/log/period records through normal document APIs.
3. Normalized lifecycle and persistence-only hash fields, including child-row metadata, so valid draft approvals survive submission while amount/branch/rate changes still invalidate them.
4. Allowed only internal URY approval writes to bypass native workflow transition permission checks; approver authorization remains in the URY API.
5. Fixed finalized-period coverage for entries dated before the finalized month.
6. Prevented double counting of native PO commitments/actuals and retained consumed Employee Advance expenses in available-budget math.
7. Reused test users to avoid Frappe's native 60-users-per-minute throttle during the full focused module.

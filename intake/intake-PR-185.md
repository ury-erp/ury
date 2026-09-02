# Intake dossier — PR #185: "Feat/thermal printing v2"

- **Source:** https://github.com/ury-erp/ury/pull/185
- **State:** open, not draft · **Base:** `develop` · **Head:** `Vijay-micronxt:feat/thermal-printing-v2` @ `9cd9eaa`
- **Author:** tushar-git26 · **Created:** 2026-07-17 · **Last update:** 2026-07-17
- **Size:** 22 commits, 56 files, +4731 / −1610
- **Mergeable:** **no** (`mergeable_state: dirty`, `rebaseable: false`) — content conflicts with `develop`
- **PR body:** empty; **Reviews/comments:** none
- **Local refs:** head fetched to `origin/pr/185` (`9cd9eaa`); merge-base with `develop` (`87e6d5e`) is `d889a90`
- **Relationship to PR #179:** PR-185's head is **strictly ahead of PR-179's head (`f197c8b`) by 8 commits, 0 behind** — PR-185 is a superset containing every PR-179 commit (see `intake/intake-PR-179.md` on `task/PR-179-intake` for the dossier of the shared base).

## 1. Purpose and current implementation

No description; the title advertises thermal printing, but the PR is a **two-layer bundle**:

**Layer A — everything from PR #179 (first 14 commits):** Website Settings branding in the POS header, waiter avatar picker + `get_waiters` API, order merge (`merge_invoices`), table switch dialog, `show_item_code` on the menu grid, default-customer preselect, cart special instructions, fixture re-sync, committed build bundle. Fully analyzed in the PR-179 dossier; summarized only where relevant below.

**Layer B — the 8 new commits unique to PR-185** (`8513552`…`9cd9eaa`), which are the actual substance of this PR:

1. **Thermal printing v2** (`ury/ury/api/ury_print.py`, +289/−~60): the old fire-and-forget `network_printing` becomes `print_via_cups` with:
   - a raw-socket reachability probe before opening a pycups connection (pycups has no connect timeout, so a dead print node previously blocked the request for minutes);
   - `check_printer_ready()` pre-flight — print server reachable, queue exists, queue accepting jobs and not stopped;
   - **strict mode** (`strict=True`): polls IPP job state (RFC 8011) until completed; on timeout it cancels **and purges** the job so it can never ghost-print when the printer comes back, then raises a new `PrintFailedError`;
   - strict mode is driven by a new POS Profile field **`custom_block_on_print_failure`** ("Fail Order When Printer Offline"), exposed to the POS via `getPosProfile` (uses `.get()` so an unmigrated site doesn't break).
2. **Per-printer, deduplicated KOT slips** (`ury_kot.py::multi_print_kot` rewrite): print targets are collected first, deduplicated by `(printer, format)` pair (same printer on POS Profile + production unit + room now prints once; same printer with two formats still prints both — the documented way to get Kitchen + Billing slips from one printer), pre-flight-verified in strict mode, then printed. Print failures propagate in strict mode and are logged-and-swallowed otherwise.
3. **Sequential KOT ticket number**: new `URY KOT.kot_number` Int field, set in `before_submit` as branch-scoped count + 1, resetting daily when the POS Profile's `custom_reset_order_number_daily` is on. Shown on the printed KOT in place of the internal document name.
4. **Optional KOT naming series**: `kot_execute` and `ury_kot_validation` no longer throw when `custom_kot_naming_series` is blank — they default to `"KOT-"`.
5. **KOT reprint hardening** (`ury_kot_reprint.py`): uses `print_via_cups(strict=…)` instead of `print_by_server`; its own `frappe.throw` messages and `PrintFailedError` pass through unwrapped so the user sees the real reason.
6. **`URY Waiter` role** (order-taking without billing):
   - new Role fixture entry + **27 `Custom DocPerm` fixture records** (read/select on ERPNext masters — Account, Item, Customer, POS Profile, etc. — and POS Invoice without submit), wired via a new `hooks.py` fixture filter and removed by `uninstall.py` (ROLES list extended);
   - `config-slice.ts` lets `URY Waiter` holders open the POS even when not in `role_allowed_for_billing`;
   - new `canUserBill()` in `pos/src/lib/role-utils.ts`: a waiter can only bill if they also hold one of the profile's explicit billing roles (`All` deliberately doesn't count; Administrator/System Manager exempt);
   - `Table.tsx` gates the payment dialog behind `canUserBill` — waiters may print the bill but never collect payment; commit `9cd9eaa` additionally gives waiters a KOT-only print path (no Bill option in the chooser; Print hidden entirely when KOT reprint is disabled).
7. **Payment-gated tables**: new POS Invoice `on_submit` hook releases the table only when the bill is **settled** — printing the bill keeps the table occupied. New whitelisted `getTableInvoiceStatus(room)` returns per-table open-invoice + `invoice_printed` state; `Table.tsx` shows a **Payment** action / "Awaiting payment" badge for printed-but-unpaid tables, and a second Print tap goes straight to payment instead of reprinting.
8. **KOT/Bill print chooser**: new `PrintChoiceDialog.tsx` on the table page (KOT = full order, codes & qty, no prices, to the billing-area printer; Bill = normal bill flow). Shown only when the POS Profile enables KOT reprint.
9. **Docs + fixtures**: `DEPLOYMENT.md` — a 110-line deployment runbook **specific to the fork's production bench** (`chefworks.storenxt.in`, `Vijay-micronxt/ury-mxt` fork, "pull-only deploy" workflow); `custom_docperm.json` fixture names fixed (`242c8ef`); the PR-179-committed minified JS bundle is deleted but `ury/public/pos/index.html`, `ury.ico`, `ury_pos.png`, and `ury/www/pos.html` remain committed build output.

## 2. Diff and affected modules

| Area | Files | Nature |
|---|---|---|
| POS frontend (`pos/src`) | ~25 files: Table.tsx (+304), Orders.tsx, Header/Footer, MenuCard/MenuList, OrderPanel, App.tsx, pos-store, config-slice, role-utils, invoice/order/table/menu/pos-profile/website-settings APIs, 6 new components (PrintChoiceDialog, WaiterPickerDialog, WaiterSelect, WaiterAvatar, MergeOrdersDialog, TableSwitchDialog), i18n ×3 (ar.json heavily rewritten), doctypes.ts | feature code |
| Print pipeline (`ury/ury/api/ury_print.py`) | +289/−~60 | full rewrite of network printing |
| KOT (`ury/ury/api/ury_kot_*.py`, `ury/ury/doctype/ury_kot/*`) | `ury_kot.py` +97, `ury_kot.json` +23 (`kot_number`, URY Waiter perms), `ury_kot_generate.py`, `ury_kot_reprint.py`, `ury_kot_validation.py` | feature + fixes |
| Frappe API (`ury/ury_pos/api.py`) | +114 total | `get_waiters`, `getTableInvoiceStatus`, merged-field SQL, `block_on_print_failure` |
| Order doctype (`ury_order.py` +145) | | `merge_invoices` (from PR-179 layer) |
| POS Invoice hook (`ury/ury/hooks/ury_pos_invoice.py`) | +6 | `on_submit` → table release on settle; `hooks.py` registers it |
| Fixtures | `custom_docperm.json` **new** (+569, 27 records), `custom_field.json` (+2705/−~1100 re-export churn; real new fields: `custom_block_on_print_failure`, `show_item_code`, merge fields), `role.json` (+43: URY Waiter), `client_script.json` (+22, unrelated) | config as data |
| Doctype JSON churn | `ury_menu`, `ury_menu_course`, `ury_order`, `ury_production_unit`, `ury_restaurant`, `ury_room`, `ury_table`, `ury_kot_error_log` (+8–10 each) | mostly re-export noise |
| Build output | `ury/public/pos/index.html`, `ury.ico`, `ury_pos.png`, `ury/www/pos.html` | committed artifacts (bundle itself deleted in e691cc1) |
| Docs | `DEPLOYMENT.md` (+110), `ury/ury/workspace/ury/ury.json` | fork-specific runbook |

## 3. Relationship to `develop`

`develop` (`87e6d5e`) has moved far ahead of the merge-base (`d889a90`):

- **POS frontend was refactored onto shared packages** (`@ury/ui`, `@ury/core`, PR #181) — virtually every `pos/src` file the PR touches has been restructured. Role helpers now live in `packages/core/src/frappe/roles.ts` (a conflict file), not only `pos/src/lib/role-utils.ts`.
- **Bill/table merge & split already merged via PR #153** with a different data model — PR-185's `merge_invoices` (inherited from #179) competes with it.
- **Table transfer UI already exists** (`TableTransferDialog`, `CaptainTransferDialog`) — the PR's `TableSwitchDialog` duplicates it.
- **Cart comments/instructions already exist** (`CommentDialog`).
- `develop` has **no counterpart** for: strict/verified thermal printing (`print_via_cups`, `check_printer_ready`, `custom_block_on_print_failure`), deduplicated per-printer KOT slips, `kot_number` ticket numbering, optional KOT naming series, the `URY Waiter` role + Custom DocPerm fixture + `canUserBill` gating, payment-gated tables (`getTableInvoiceStatus`, `on_submit` table release, "Awaiting payment" UI), or the KOT/Bill `PrintChoiceDialog`. Develop still uses fire-and-forget `print_by_server`/`network_printing`. **Layer B is genuinely new functionality.**

### Conflicts

`git merge-tree --write-tree develop 9cd9eaa` reports **content conflicts in 15 files**: `packages/core/src/frappe/roles.ts`, `pos/src/components/Header.tsx`, `MenuCard.tsx`, `OrderPanel.tsx`, `pos/src/lib/invoice-api.ts`, `order-api.ts`, `table-api.ts`, `pos/src/pages/Orders.tsx`, `Table.tsx`, `ury/fixtures/custom_field.json`, `ury/fixtures/role.json`, `ury/hooks.py`, `ury/ury/api/ury_print.py`, `ury/ury/doctype/ury_order/ury_order.py`, `ury/ury_pos/api.py`. The fixture conflicts are structural (both sides re-exported); the `pos/src` conflicts stem from the #153/#181 refactors. A rebase is effectively a rewrite of the frontend half; the backend printing/KOT changes are largely self-contained and would port cleanly.

## 4. Overlapping PRs

- **PR #179** ("Deploy/develop logo and merge fields", same fork, `f197c8b`): a **strict subset** of this PR (PR-185 = PR-179 + 8 commits). Merging #185 makes #179 redundant; see the PR-179 dossier. Both are `dirty` against `develop`.
- **PR #188** (`pricing-rule-discount`): touches `pos/src` and `ury/ury_pos/api.py`; moderate overlap with the invoice SQL sections.
- PRs #108, #129, #125 also touch `pos/src` / KOT-printing territory but are not direct duplicates.

## 5. Remaining work (if salvaged)

- Rebase/rewrite onto current `develop`: the entire `pos/src` half must be redone on the `@ury/ui`/`@ury/core` codebase (role logic into `packages/core/src/frappe/roles.ts`); backend printing/KOT/waiter-perm changes port mostly as-is.
- Drop the PR-179 layer or reconcile each piece with `develop`'s equivalents: `merge_invoices` vs PR #153's data model, `TableSwitchDialog` vs existing transfer dialogs, cart comments vs `CommentDialog`.
- Remove committed build output (`ury/public/pos/index.html`, `ury.ico`, `ury_pos.png`, `ury/www/pos.html`) — repo convention (AGENTS.MD) forbids it; the deleted bundle also means the committed `index.html` references assets that don't exist in the repo.
- Drop `DEPLOYMENT.md` — it documents the fork's private production bench (hostname, deploy user, workflow) and is not upstream material.
- Drop the unrelated Client Scripts fixture additions (Event/Sales Order calendar redirects — inherited from #179).
- Re-export `custom_field.json` cleanly from a current site so the diff shows only genuinely new fields; verify the `role.json` re-export didn't strip keys (a known regression in the #179 layer).
- Verify the 27 `Custom DocPerm` records against a current ERPNext version (perm matrix drifts between versions; wrong perms silently break the waiter role).
- Write a PR description with screenshots; split into atomic PRs (see §9).
- Add permission checks and remove the raw `frappe.db.commit()` in `merge_invoices` if it survives in any form.
- Fix the no-newline-at-EOF regressions (`role.json`, `role-utils.ts`).

## 6. Risks

- **Two competing merged-bill data models** if merged alongside PR #153 (inherited from #179).
- **`merge_invoices` deletes POS Invoices and commits mid-request** (inherited from #179) — audit-trail and permission concerns.
- **`on_submit` table-release changes a core lifecycle invariant** — any code that assumed printing frees the table (reports, closing entries, the KOT validation scheduler) must be re-audited.
- **Strict printing blocks the request thread** (socket probe + up to 8s IPP polling inside `before_submit` of KOT) — a slow print node now delays order submission; the trade-off is intentional ("fail order when printer offline") but changes operational behavior and needs a real CUPS environment to validate.
- **Fixture regressions**: `custom_field.json` re-export churn (+2705) may drop/reorder fields from other branches; `role.json` key-stripping regression inherited from #179; 27 hand-maintained Custom DocPerms are fragile across ERPNext versions.
- **Committed build artifacts and fork-specific ops docs** (`DEPLOYMENT.md` leaks internal host/workflow details).
- **Scope creep**: two PRs' worth of unrelated features (8+ features), no description, no reviews, no tests.
- **`URY Waiter` gating is client-side only** (`canUserBill` in the POS) — server-side submit permissions rely entirely on the Custom DocPerm fixture being correctly imported; if it drifts, waiters may be able to settle via API or be unable to take orders at all.

## 7. Required tests

No automated tests exist in the repo for this area, and the PR adds none. Required validation before any salvage merge:

- **Printing (needs a bench + CUPS print node):** strict mode on/off; printer powered off mid-print (job purged, no ghost print, `PrintFailedError` surfaces, order fails only when `custom_block_on_print_failure` is on); unreachable print server (socket timeout ~3s, not minutes); dedup — same printer on POS Profile + production unit prints exactly one slip; same printer with two formats prints both.
- **KOT numbering:** sequential `kot_number` per branch; daily reset on/off via `custom_reset_order_number_daily`; blank `custom_kot_naming_series` no longer throws (order placement and the every-minute KOT validation scheduler both covered).
- **Waiter role:** fresh-site fixture import of role + 27 Custom DocPerms; waiter can open POS, take/modify orders, print KOT/bill, **cannot** open payment or submit POS Invoice (UI **and** direct API call); waiter + billing role **can** bill; Administrator/System Manager unaffected; `bench uninstall` removes the role's DocPerms.
- **Payment-gated tables:** table stays occupied after bill print, freed on settle (`on_submit`); "Awaiting payment" badge and Payment action render; second Print tap routes to payment; closing/cancel flows still release tables.
- **KOT/Bill chooser:** appears only with KOT reprint enabled; waiters never see the Bill option.
- **Frontend:** `yarn build` for `pos` against current `develop` after any rebase; i18n keys (en/fr/ar) resolve.

## 8. Recommended disposition

**Close as-is; salvage Layer B as new atomic PRs.** The PR is unmergeable (15 conflict files, frontend half written against a pre-#181 codebase), undocumented, and bundles a redundant subset PR (#179). However, the Layer-B work — verified thermal printing, per-printer KOT dedup, KOT ticket numbers, the waiter role, and payment-gated tables — is well-implemented, genuinely new (no `develop` counterpart), and worth porting. The PR-179 layer should be dropped or individually reconciled per the PR-179 dossier. Do not review/merge #179 separately — #185 supersedes it.

## 9. Atomic subtasks (salvage plan)

| # | Subtask | Difficulty | Risk | Uncertainty |
|---|---|---|---|---|
| 1 | Port `ury_print.py` v2 (`print_via_cups`, `check_printer_ready`, `PrintFailedError`, strict mode) + `custom_block_on_print_failure` field/fixture + `getPosProfile` exposure | Medium | Medium (blocks request thread; needs CUPS env to validate) | Low |
| 2 | Port `multi_print_kot` dedup + strict pre-flight + `ury_kot_reprint` hardening | Medium | Medium | Low |
| 3 | Port `kot_number` field + `set_kot_number` + optional naming series (incl. `ury_kot_validation` fix) | Low | Low (daily-reset boundary at midnight; count-based race on concurrent submits) | Medium (concurrent KOT submits may duplicate numbers — needs unique constraint or locking decision) |
| 4 | Port `URY Waiter` role: Role fixture, Custom DocPerm fixture (re-derived for current ERPNext), `hooks.py`/`uninstall.py` wiring | Medium | High (perm matrix drift; client-side-only gating) | Medium (needs decision on server-side enforcement beyond DocPerms) |
| 5 | Port `canUserBill` + waiter POS access into `packages/core/src/frappe/roles.ts` + `config-slice` on the post-#181 frontend | Medium | Low | Low |
| 6 | Port payment-gated tables: `on_submit` table release, `getTableInvoiceStatus`, Table.tsx "Awaiting payment"/Payment flow, `PrintChoiceDialog` | High | High (lifecycle invariant change; largest UI conflict surface) | Medium (interactions with PR #153 merged-bill flows unverified) |
| 7 | Reconcile or drop PR-179 layer (merge_invoices vs #153, TableSwitchDialog vs existing transfer, branding, waiter picker, `show_item_code`, default customer) | High | High | High (product decision required per feature) |
| 8 | Drop `DEPLOYMENT.md`, committed build output, unrelated Client Scripts; clean fixture re-export | Low | Low | Low |

Subtasks 1–3 are independent and can land first; 4–6 form the waiter/billing arc and should land together; 7 is a set of separate product decisions, not one task.

## 10. Acceptance criteria for this dossier

- `intake/intake-PR-185.md` exists with all dossier sections (purpose, diff/modules, relationship to develop, conflicts, overlapping PRs, remaining work, risks, required tests, disposition, subtasks). ✔
- No other file changed. ✔ (read-only analysis; PR head fetched to `origin/pr/185` for diffing only)

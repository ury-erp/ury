# Intake dossier — PR #179: "Deploy/develop logo and merge fields"

- **Source:** https://github.com/ury-erp/ury/pull/179
- **State:** open, not draft · **Base:** `develop` · **Head:** `Vijay-micronxt:ury-mxt` branch `deploy/develop-logo-and-merge-fields` @ `f197c8b`
- **Author:** tushar-git26 · **Created:** 2026-07-12 · **Last update:** 2026-07-14
- **Size:** 14 commits, 37 files, +3301 / −1325
- **Mergeable:** **no** (`mergeable_state: dirty`, `rebaseable: false`) — content conflicts with `develop`
- **Local refs:** head commit object `f197c8b` present in the repo; merge-base with `develop` (`87e6d5e`) is `d889a90`

## 1. Purpose and current implementation

The PR has **no description**; the title only mentions "logo and merge fields". A maintainer (shzdb, 2026-07-14) commented: *"Please provide description of the PR and screenshots."* — unanswered. There are no reviews.

In practice the PR is a **mixed-purpose bundle** of at least eight independent changes:

1. **Website Settings branding in POS header** — new `pos/src/lib/website-settings-api.ts` reads `app_logo`/`favicon` from the Website Settings single (cached, never rejects); `Header.tsx` uses them with a bundled fallback and swaps the favicon dynamically. Adds `WEBSITE_SETTINGS` to `pos/src/data/doctypes.ts`.
2. **Waiter tagging** — new `WaiterSelect.tsx` + `WaiterAvatar.tsx` (employee avatar picker), `selectedWaiter` in `pos-store.ts`, new whitelisted `get_waiters` in `ury/ury_pos/api.py` (active Employees, Employee image falling back to linked User image), and `ury_kot.py::userSetting` now prefers the invoice's `waiter` field over the KOT creator.
3. **Order merge ("merge fields")** — new whitelisted `merge_invoices(primary_invoice, invoices_to_merge)` in `ury/ury/doctype/ury_order/ury_order.py`: validates both sides (draft, unbilled, non-aggregator, same customer/branch/POS profile/company/price list), copies items onto the primary, repoints the secondary orders' KOTs, stamps `custom_is_merged` / `custom_merged_tables` / `custom_merged_invoices` on the primary, then **deletes** the secondary POS Invoices and calls `frappe.db.commit()`. New `MergeOrdersDialog.tsx` + `mergeInvoices` client in `invoice-api.ts`; `getInvoiceForCashier` / `getPosInvoice` / `searchPosInvoice` SQL extended to return the merged flags.
4. **Table switch UI** — new `TableSwitchDialog.tsx` + typed `transferTable` client wrapper. The server-side `table_transfer` whitelisted method already exists in the base (`ury_order.py:430`); the PR adds no server code for this.
5. **Item code on the menu grid** — new `POS Profile.show_item_code` custom field; `getRestaurantMenu` returns `item_code`; `MenuCard`/`MenuList` render the code as primary label when enabled.
6. **Default customer handling** — POS Profile default customer preselect (`defaultCustomerOf` in `pos-store.ts`) and "keep the default customer when a table is selected".
7. **Special instructions in cart** — item `comment` surfaced in the cart (`MenuList.tsx`/`OrderPanel.tsx`), plus i18n strings in en/fr/ar.
8. **Fixture re-sync + built bundle for "pull-only deploy"** — `ury/fixtures/custom_field.json` rewritten (+1654/−1226), `role.json` stripped of keys, two unrelated Client Scripts added (Event and Sales Order "calendar view" redirects), `hooks.py` fixture filters extended, and the **built POS bundle committed** (`ury/public/pos/*`, `ury/www/pos.html`).

## 2. Diff and affected modules

| Area | Files | Nature |
|---|---|---|
| POS frontend (`pos/src`) | 21 files: Header, MenuCard, MenuList, OrderPanel, Orders, Table, pos-store, invoice/order/table/menu/pos-profile/website-settings APIs, 3 new dialogs + WaiterSelect/WaiterAvatar, i18n ×3, doctypes | feature code |
| Frappe API (`ury/ury_pos/api.py`) | +62/−22 | `get_waiters`, `item_code` in menu, merged fields in invoice queries |
| Order doctype (`ury/ury/doctype/ury_order/ury_order.py`) | +110 | `merge_invoices` + helpers |
| KOT doctype (`ury/ury/doctype/ury_kot/ury_kot.py`) | +10/−2 | waiter display name resolution |
| Fixtures | `custom_field.json` (+1654/−1226), `role.json` (+3/−27), `client_script.json` (+22) | re-export churn + 3–4 real new fields + unrelated scripts |
| Hooks (`ury/hooks.py`) | +4 | fixture filters for the new custom fields |
| Build output | `ury/public/pos/*` (7 files incl. 542-line minified bundle), `ury/www/pos.html` | committed artifacts |

Real new custom fields (vs. re-export noise): `POS Invoice-custom_is_merged`, `POS Invoice-custom_merged_tables`, `POS Invoice-custom_merged_invoices`, `POS Profile-show_item_code`.

## 3. Relationship to `develop`

`develop` has moved far ahead of the merge-base (`d889a90`) and **already contains equivalent or superseding functionality**:

- **Bill/table merge & split was merged via PR #153** (`table-and-bill-features`): `BillMergeDialog`, `TableMergeDialog`, `TableUnmergeDialog`, `MergedBillPanel`, `MergeLinkConnector`, `BillSplitDialog`, batch merge API, merged print format, "correct rounded total for merged bills". It uses a **different data model** (`custom_merged_pos_invoice`, `custom_merged_pos_invoice_details`, `custom_merged_total`, `custom_split_from`, `custom_split_group`) — `develop`'s `custom_field.json` contains **no** `custom_is_merged`. PR-179's merge feature is a competing, simpler (delete-the-losers) implementation of the same feature.
- **Table transfer UI already exists**: `TableTransferDialog.tsx` + `CaptainTransferDialog.tsx` (PR-179's `TableSwitchDialog` duplicates it).
- **POS frontend was refactored onto shared packages** (`@ury/ui`, `@ury/core`, commit `a8fec7b`, PR #181), touching virtually every `pos/src` file the PR edits.
- **Comment/instructions in cart already exists** (`CommentDialog`, comment handling in `OrderPanel`).

Features in PR-179 with **no counterpart on `develop`** (verified absent): Website Settings branding in the header, waiter avatar picker + `get_waiters` API + KOT waiter-name resolution, `show_item_code` on the menu grid, POS Profile default-customer preselect.

### Conflicts

`git merge-tree --write-tree develop f197c8b` reports **content conflicts in 11 files**: `pos/src/components/Header.tsx`, `MenuCard.tsx`, `lib/invoice-api.ts`, `lib/order-api.ts`, `lib/table-api.ts`, `pages/Orders.tsx`, `pages/Table.tsx`, `ury/fixtures/custom_field.json`, `ury/fixtures/role.json`, `ury/hooks.py`, `ury/ury_pos/api.py`. 21 files were changed on both sides since the merge-base. The fixture conflicts are structural (both sides re-exported); the `pos/src` conflicts stem from the #153/#181 refactors. A rebase is effectively a rewrite of the frontend half, and the merge feature would need reconciling with #153's data model.

## 4. Overlapping PRs

- **PR #185 "Feat/thermal printing v2"** (same fork, `Vijay-micronxt:feat/thermal-printing-v2` @ `9cd9eaa`): its head is **strictly ahead of PR-179's head by 8 commits, 0 behind** — i.e. PR-185 is a **superset containing every PR-179 commit** plus thermal printing. 32 of PR-179's 37 files overlap. Also `dirty` against `develop`. Merging either one decides the fate of the other.
- **PR #188** (`pricing-rule-discount`): touches `pos/src` and `ury/ury_pos/api.py` areas; moderate overlap with the invoice SQL sections.
- PRs #108, #129, #125 also touch `pos/src` / KOT-printing territory but are not direct duplicates.

## 5. Remaining work (if anything were salvaged)

- Rebase/rewrite onto current `develop` — the frontend half must be redone on the `@ury/ui`/`@ury/core` codebase, and the merge feature reconciled with (or dropped in favor of) PR #153's implementation.
- Remove committed build artifacts (`ury/public/pos/*`, `ury/www/pos.html`) — repo convention (AGENTS.MD) forbids editing build output; these will conflict on every build.
- Drop unrelated Client Scripts (Event/Sales Order calendar redirects) — global desk behavior change, out of scope.
- Fix `role.json` fixture regression: the re-export stripped `bulk_actions`, `dashboard`, `form_sidebar`, `list_sidebar`, `notifications`, `search_bar`, `timeline`, `view_switcher` keys from URY Manager/Captain/Cashier (exported from an older Frappe version).
- Re-export `custom_field.json` cleanly from a current site so the diff shows only the 4 genuinely new fields.
- Write a PR description with screenshots (explicitly requested by maintainer).
- Add permission checks and remove the raw `frappe.db.commit()` in `merge_invoices` if the merge endpoint survives in any form.

## 6. Risks

- **Duplicate/competing data model for merged bills** — merging this alongside #153 would leave two incompatible merge mechanisms and field sets on POS Invoice.
- **`merge_invoices` deletes POS Invoices** and commits mid-request; deletion relies on `on_trash` hooks to release tables, bypasses audit trails, and has no explicit permission checks.
- **Fixture regressions** (`role.json` key stripping; `custom_field.json` re-export churn may drop or reorder fields created by other apps/branches).
- **Committed build bundle** — 542-line minified JS artifact guarantees future merge conflicts and violates repo conventions.
- **Scope creep**: 8 unrelated features + unrelated Client Scripts in one PR, no description, no tests.
- **Superset PR #185 exists** — any review effort on #179 alone is partially wasted.

## 7. Required tests

None exist in the repo for these paths and the PR adds none. Before any salvage merge, at minimum:

- `yarn workspace @ury/core typecheck` and `cd pos && yarn build` for the frontend parts.
- `bench migrate` on a test site to validate fixture import (watch for role/custom-field regressions).
- Manual: header logo/favicon from Website Settings; waiter picker end-to-end (tag → KOT display shows waiter name); item-code grid toggle via POS Profile; default customer preselect.
- If the merge endpoint were kept: merge two open table orders (KOTs repointed, tables released, bill totals/rounded total correct), reject printed/submitted/aggregator/cross-customer orders.

## 8. Recommended disposition

**Close as superseded — do not merge.** Rationale: (a) the headline merge feature is already on `develop` via PR #153 with a richer data model and UX; (b) table transfer UI already exists; (c) PR #185 from the same fork is a strict superset of this PR, so even the author has moved on; (d) the PR is unmergeable (dirty, 11 conflicting files) and unreviewed, with the maintainer's information request unanswered since 2026-07-14. The genuinely novel pieces (Website Settings branding, waiter avatar picker, `show_item_code` grid, default-customer preselect) should be re-submitted as **small, single-purpose PRs rebased on current `develop`** — likely by splitting them out of PR #185, since that branch already carries these commits forward.

## 9. Atomic subtasks (if the salvage route is chosen)

| # | Subtask | Difficulty | Risk | Uncertainty |
|---|---|---|---|---|
| 1 | Close PR #179 with a pointer to #153 and #185 | trivial | none | low |
| 2 | Extract Website Settings branding (website-settings-api + Header) onto `develop`'s `@ury/core` client | easy | low | low |
| 3 | Extract waiter picker (WaiterSelect/WaiterAvatar, `get_waiters`, KOT `userSetting`) onto `develop` | medium | medium — `ury_kot.py` and `api.py` conflict zones; needs Employee/User image fallback testing | medium |
| 4 | Extract `show_item_code` menu-grid feature (API field, POS Profile field, MenuCard) onto `develop` | easy | low | low |
| 5 | Extract default-customer preselect onto `develop`'s CustomerPicker flow | easy | low | medium — interplay with #153's customer step in bill split |
| 6 | Decide fate of `merge_invoices`: drop (recommended) or reconcile with #153's model | hard | high — data-model conflict, destructive delete semantics | high |
| 7 | Re-export fixtures cleanly (only the 4 new fields; restore `role.json` keys; drop unrelated Client Scripts) | easy | medium — requires a current test site | low |
| 8 | Rebuild and stop committing `ury/public/pos/*` artifacts | trivial | low | low |

## 10. Acceptance criteria (for the salvage route)

- PR #179 closed with explanation, or reduced to a single-purpose, conflict-free diff.
- Any salvaged feature lands as its own PR against `develop`, builds cleanly (`cd pos && yarn build`), and contains no committed build output.
- Fixture diffs contain only intended fields; `role.json` round-trips without key loss.
- No second bill-merge mechanism is introduced alongside #153's.

# Intake Dossier — PR #165: URY Demo Data Creation

- **PR:** https://github.com/ury-erp/ury/pull/165 (state: **open**, not a draft)
- **Author:** ShahalaKP-Tridz (fork: `ShahalaKP-Tridz/ury`, head branch `feature/demo_data`)
- **Head SHA:** `895967d4ff5c0b3913f9fae954d42baf65b116fe`
- **Base:** `develop` @ `032002908cf384832e83a5fd7f671f20b3ff0bd6` (at last GitHub check)
- **Size:** 34 files changed, +2156 / −4, 5 commits (2026-05-10 → 2026-07-14)
- **GitHub mergeability:** `mergeable: true`, `mergeable_state: clean`
- **Reviews / comments:** none (no review decision, no issue comments)
- **Labels / milestone / assignees:** none

---

## 1. Current purpose and implementation

### Purpose (stated)
Populate all URY-related DocTypes with realistic demo records so a fresh site can be
set up quickly for development, QA, training, and stakeholder demos. The PR integrates
with the ERPNext setup wizard: the standard "Generate ERPNext Demo Data" checkbox is
hidden and replaced with a "Generate URY Demo Data" checkbox.

### Implementation summary
The PR adds a new Python package `ury/setup/` plus data files and hooks:

- **`ury/setup/setup_wizard.py`** (new, 78 lines) — whitelisted entry point
  `setup_ury_or_erpnext_demo(args)`, wired in via the `setup_wizard_complete` hook.
  When `setup_ury_demo` is checked it creates a demo company (`"<RealCompany> (Demo)"`,
  abbr + "D") using the first real company as a template, sets it as the user/default
  company, sets `demo_data_type = "ury"`, sets `setup_complete = 1` early (to avoid an
  infinite redirect loop if demo generation times out), creates a default bank account
  via ERPNext's internal `create_bank_account`, then calls `setup_ury_demo_data(company)`.

- **`ury/setup/demo.py`** (new, 574 lines) — the core generator:
  - `setup_ury_demo_data(company)`: enables `allow_negative_stock`, inserts master
    records then transaction records, runs the POS demo, adds URY roles
    (`URY Cashier`, `URY Captain`, `URY Manager`) to Administrator, resets stock
    settings, clears bootinfo cache, publishes `demo_data_complete` realtime event,
    and emits telemetry (`capture("demo_data_creation_*", "ury")`).
  - `process_masters()` / `process_transactions()`: iterate doctype lists from hooks
    (`ury_demo_master_doctypes`, `ury_demo_transaction_doctypes`), load per-doctype
    JSON from `ury/setup/demo_data/<scrubbed>.json`, substitute dynamic placeholders
    (`__COMPANY__`, `__WAREHOUSE__`, `__CASH_ACCOUNT__`, `__BANK_ACCOUNT__`,
    `__RECEIVABLE_ACCOUNT__`, `__PAYABLE_ACCOUNT__`, `__WRITE_OFF_ACCOUNT__`,
    `__COST_CENTER__`, `__BOM_FOR_<ITEM>__`) with live lookups, insert (and submit
    submittable) documents, swallowing duplicate-type errors.
  - Post-processing: `add_global_opening_stock()` (1000 units of every stock item in
    every warehouse), `convert_production_plan_to_work_orders()`,
    `convert_material_requests()` (MR → PO / Stock Entry),
    `convert_order_to_invoices()` (PO → PR/PI with 3 randomized flows; SO → Sales
    Invoice with `order_type = "Dine In"`, partial quantities and partial payments).
  - `clear_demo_data()` (whitelisted, System Manager only): **overrides**
    `erpnext.setup.demo.clear_demo_data` (via `override_whitelisted_methods` in
    hooks.py). Routes to ERPNext's own clearer when `demo_data_type == "erpnext"`;
    otherwise finds all companies matching `%(Demo)%` (plus the one in Global
    Defaults), runs a `Transaction Deletion Record`, force-deletes POS Profiles and
    "Demo" Price Lists, deletes masters in reverse hook order, deletes User
    Permissions, and finally force-deletes the demo company/companies.

- **`ury/setup/pos_demo.py`** (new, 110 lines) — creates two POS Opening Entries
  (hardcoded cashier `cashier@ury.com`, Cash opening balance 1000), 5 + 3 randomized
  POS Invoices (random stock item, qty 1–5, rate 50–200, Cash payment), and one POS
  Closing Entry via ERPNext's `make_closing_entry_from_opening`. Owner is force-set
  via `frappe.db.set_value` after submit because Frappe overwrites `owner`.

- **`ury/public/js/setup_wizard.js`** (new, 27 lines) — loaded via
  `setup_wizard_requires` alongside ERPNext's own setup wizard JS. On `before_load`
  it finds the "organization" slide, hides the `setup_demo` field and splices in a
  `setup_ury_demo` Check field. Includes a `console.log("🔥 URY setup_wizard.js loaded")`
  debug line and no trailing newline.

- **`ury/setup/demo_data/*.json`** (27 new files) — static demo records for:
  masters (`gender`, `item_group`, `item`, `item_price`, `customer_group`,
  `customer`, `user`, `employee`, `bom`, `supplier_group`, `supplier`, `branch`,
  `ury_menu_course`, `ury_menu`, `ury_room`, `ury_restaurant`, `ury_table`,
  `product_bundle`, `ury_production_unit`, `ury_report_settings`, `pos_profile`)
  and transactions (`production_plan`, `material_request`, `purchase_order`,
  `sales_order`, `journal_entry`, `payment_entry`).

- **`ury/hooks.py`** (modified, +43/−3) — adds `setup_wizard_requires`,
  `setup_wizard_complete`, the two demo doctype lists, and replaces the commented-out
  `override_whitelisted_methods` block with an active override of
  `erpnext.setup.demo.clear_demo_data` → `ury.setup.demo.clear_demo_data`.

- **`ury/setup.py`** (modified, +9/−1) — `after_install()` now also calls
  `add_roles_to_administrator()` which adds URY Cashier/Manager/Captain roles to the
  Administrator user (errors logged, not raised).

## 2. Relevance

- Fills a real gap: URY currently has no demo dataset, and the stock ERPNext demo data
  contains nothing restaurant-specific (no URY Restaurant, Menu, Tables, Rooms,
  Production Units, or POS activity), so demos/QA/training on a fresh site require
  manual data entry.
- It is additive and self-contained: nearly all weight sits in a new `ury/setup/`
  package and JSON data files. The only touches to existing code are hooks.py and
  `after_install` in setup.py.
- Caveat: it activates a **global method override** of an ERPNext whitelisted method
  (`clear_demo_data`) and mutates the setup wizard UI for every site that has URY
  installed — that is a footprint beyond pure demo data.

## 3. Diff and affected modules

| Module | Files | Nature of change |
|---|---|---|
| `ury/setup/` (new package) | `__init__.py`, `demo.py`, `pos_demo.py`, `setup_wizard.py` | New demo generation/cleanup engine |
| `ury/setup/demo_data/` | 27 JSON files | New static demo records |
| `ury/hooks.py` | 1 | New hook keys; activates `override_whitelisted_methods` |
| `ury/setup.py` | 1 | `after_install` adds URY roles to Administrator |
| `ury/public/js/` | `setup_wizard.js` | Setup wizard UI injection |

- **Affected Frappe/ERPNext surface:** setup wizard flow, `System Settings.setup_complete`,
  Global Defaults (`demo_company`, `company`), Stock Settings (`allow_negative_stock`
  toggled during generation), Administrator user roles, and every doctype listed in
  the two hook lists (masters + transactions).
- **Not touched:** POS frontends (`pos/`, `urypos/`, `URYMosaic/`, `frontend/`,
  `packages/`), `ury/ury_pos/api.py`, doctype definitions, fixtures, patches. Zero
  overlap with the React/Vue apps.

## 4. Relationship to `develop`

- The PR branch already merged `ury-erp:develop` on 2026-07-13 (commit `a23a641`),
  so its merge-base with develop is the PR's recorded base `0320029`.
- Local `origin/develop` (`87e6d5e`, merge of PR #181) is exactly **one commit ahead**
  of that base. The only backend change in that delta is a single added line in
  `ury/hooks.py` (the `/ury/<path:app_path>` route rule) — adjacent to, but not
  overlapping, the PR's hooks.py insertion.
- A local read-only test merge (`git merge-tree --write-tree 895967d4 origin/develop`)
  completes cleanly (exit 0, no conflict entries). GitHub agrees: `clean`.
- All five touched/added Python files at the PR head compile under `python3`
  (`compile()` check passed for `demo.py`, `pos_demo.py`, `setup_wizard.py`,
  `hooks.py`, `setup.py`).

## 5. Conflicts and overlapping PRs

**Textual conflicts with current `develop`: none.**

Open PRs that touch the same files (risk of future conflict or semantic interaction):

| PR | Title | Overlap with #165 | Severity |
|---|---|---|---|
| #118 | Rename URYMosaic → Mosaic | `ury/hooks.py` (route rules, doc_events, fixture lists) and `ury/setup.py` (**removes** custom-field blocks) | Low textually (different regions of both files); semantic — both edit hooks.py, whichever merges second should re-verify |
| #154 | Invoice-printed timestamp + custom fields | `ury/hooks.py`, `ury/fixtures/custom_field.json` | Low — different hooks.py region |
| #179 | Deploy/develop logo and merge fields | `ury/hooks.py`, fixtures | Low — different hooks.py region |
| #96 | Three-layer permission system | `ury/hooks.py`, `fixtures/role.json` | Low textually; **semantic** — #165 hardcodes role names `URY Cashier/Manager/Captain` in two places and assumes they exist |
| #185 | Thermal printing v2 | `ury/hooks.py`, fixtures | Low — different hooks.py region |

No other open PR touches `ury/setup/`, `ury/setup/demo_data/`, or
`ury/public/js/setup_wizard.js` (the directory/file do not exist on develop).

## 6. Remaining work (gaps in the PR)

1. **Code hygiene:** duplicate import of `setup_ury_demo_data` in `setup_wizard.py`
   (imported twice at top and again inside the function); debug `console.log` with
   emoji in `setup_wizard.js`; emoji in code comments; missing trailing newlines on
   several new files.
2. **Fragile error handling:** `process_masters()` swallows exceptions by matching
   exception *class-name strings* (`"DuplicateEntryError" in type(e).__name__`) —
   brittle across Frappe versions.
3. **ERPNext version coupling:** depends on ERPNext internals —
   `erpnext.setup.setup_wizard.operations.install_fixtures.create_bank_account`,
   `erpnext.setup.demo.clear_demo_data` signature, `make_closing_entry_from_opening`,
   `Transaction Deletion Record`, and the setup wizard slide name "organization".
   Not pinned or guarded against any ERPNext version.
4. **Hardcoded values:** cashier user `cashier@ury.com` must exist in `user.json`
   demo data; role names hardcoded in both `demo.py` and `setup.py`; demo company
   detection relies on the name suffix `"(Demo)"`.
5. **No tests at all** — no unit/integration tests for generation or cleanup, and the
   PR's "Testing" section is manual-only.
6. **Unverified in this intake:** actual end-to-end run on a fresh bench (setup
   wizard → generate → clear) could not be executed here (no bench reservation;
   intake is read-only).
7. **`ury/setup.py` naming collision:** the PR adds a package `ury/setup/` next to
   the existing module `ury/setup.py`. This works in Python 3 (package wins on
   import), but it is confusing and tooling-unfriendly — worth renaming the package
   (e.g. `ury/demo_setup/`) before merge.

## 7. Risks

- **Global override risk:** `override_whitelisted_methods` for
  `erpnext.setup.demo.clear_demo_data` changes behavior for *every* site with URY
  installed, including sites using plain ERPNext demo data (mitigated by the
  `demo_data_type == "erpnext"` pass-through, but the default path when the flag is
  unset falls into URY logic that force-deletes companies named `%(Demo)%`).
- **Destructive cleanup heuristic:** `clear_demo_data()` deletes **all** companies
  matching `%(Demo)%`, not just the one it created — a user-created company with
  "(Demo)" in its name would be wiped, via `Transaction Deletion Record` and
  `frappe.delete_doc(..., force=1)`.
- **Setup-wizard coupling:** hiding ERPNext's `setup_demo` checkbox by mutating
  `slides_settings` can silently break if ERPNext renames the slide/field (the JS
  fails safe — early returns — but then no demo option appears at all).
- **`setup_complete = 1` set before generation:** if generation then fails, the site
  is marked set up with partial demo data and no redirect guard.
- **Idempotency:** re-running generation relies on duplicate-error swallowing;
  `ignore_if_duplicate=True` plus name-based cleanup means partial re-runs may leave
  inconsistent state (e.g. opening stock added twice is *not* guarded).
- **Data validity drift:** the 27 JSON files reference doctype schemas that can drift
  as develop evolves (e.g. PR #118 removes custom fields, PR #154 adds new ones);
  there is no CI to catch a broken fixture.
- **Security/permissions:** generation and cleanup run with `ignore_permissions=True`
  (cleanup is at least gated by `frappe.only_for("System Manager")`; generation runs
  in the setup-wizard context).
- **Telemetry:** `capture("demo_data_*", "ury")` sends telemetry events; acceptable
  but should be noted for privacy-conscious deployments.

## 8. Required tests

No automated checks are named in the PR. Recommended verification before merge:

1. **Fresh-site E2E:** new bench site → install erpnext + ury → run setup wizard with
   "Generate URY Demo Data" checked → assert: no infinite redirect; demo company
   `* (Demo)` exists; all 21 master doctypes populated; transactions submitted; POS
   opening/invoices/closing created; Administrator has URY roles.
2. **Cleanup E2E:** from the populated site, run "Clear Demo Data" from the UI →
   assert: demo company and all linked records removed; no `LinkExistsError`; real
   company untouched; `demo_data_type` default reset; ERPNext-demo path still works
   when `demo_data_type == "erpnext"`.
3. **Regression on existing site:** install/ migrate URY on a site with real data →
   confirm `after_install` role addition doesn't fail when roles are absent and
   doesn't disturb existing users.
4. **POS smoke:** open `/pos` against the demo company — menu loads from URY Menu,
   order → KOT → payment flow works with demo data.
5. **Static:** `python -m compileall ury/setup`, `bench build` (setup_wizard.js is
   a static asset — confirm it is served under `assets/ury/js/`).
6. **Re-run safety:** run generation twice; document/verify behavior.

## 9. Recommended disposition

**Merge after revisions (request changes first).** The feature is valuable,
self-contained, currently conflict-free with develop, and the author has iterated on
real failure modes (LinkExistsError, redirect loop). But it should not merge as-is:
the cleanup heuristic (`%(Demo)%` company wipe), the global whitelisted-method
override, code-hygiene issues, and the `ury/setup/` vs `ury/setup.py` collision all
warrant at least one revision round, plus the E2E verification in §8 which no one has
demonstrated. It is not a candidate for close (feature wanted) nor for blind merge
(destructive paths unverified). Given it merges cleanly today, merging sooner rather
than later also avoids future hooks.py conflicts with PRs #118/#154/#179/#185.

## 10. Atomic subtasks

| # | Subtask | Difficulty | Risk | Uncertainty |
|---|---|---|---|---|
| 1 | Rebase/merge develop into `feature/demo_data`; confirm clean merge (expected trivial) | Low | Low | Low |
| 2 | Rename `ury/setup/` package to avoid collision with `ury/setup.py`; update all imports and hook paths | Medium | Medium (hooks paths, JS asset path unaffected) | Low |
| 3 | Remove duplicate import, debug `console.log`, emoji comments; add trailing newlines | Low | Low | Low |
| 4 | Scope `clear_demo_data()` to the company recorded in Global Defaults instead of all `%(Demo)%` companies; keep pass-through for `demo_data_type == "erpnext"` and unset | Medium | High (destructive path) | Medium |
| 5 | Replace exception-name string matching with proper exception classes / `frappe.db.exists` pre-checks | Low | Medium | Low |
| 6 | Guard or version-check ERPNext internal imports (`create_bank_account`, `Transaction Deletion Record`, `make_closing_entry_from_opening`) | Medium | Medium | High (which ERPNext versions to support) |
| 7 | Move `setup_complete = 1` to after successful generation, or wrap generation in try/except that resets it on failure | Low | Medium | Low |
| 8 | Derive cashier user from demo data instead of hardcoded `cashier@ury.com`; fail with clear message if missing | Low | Low | Low |
| 9 | Run fresh-site E2E generation + POS smoke test (§8.1, §8.4) on a bench | Medium | High (unverified core flow) | Medium |
| 10 | Run cleanup E2E (§8.2) including the ERPNext-demo pass-through path | Medium | High (destructive) | Medium |
| 11 | Add minimal integration test (e.g. `bench run-tests`) that generates demo data on a test site and asserts record counts | High | Medium | High (no test infra for this in repo today) |
| 12 | Final maintainer review + merge into develop | Low | Low | Low |

## 11. Acceptance criteria for the PR (proposed)

- [ ] Merges cleanly into current `develop` (re-verified at merge time).
- [ ] Fresh site: setup wizard with URY demo checked completes without redirect loop;
      all demo masters/transactions/POS records exist and are consistent.
- [ ] Clear Demo Data removes exactly the demo company's data; real companies and
      companies not created by the wizard are never deleted; ERPNext demo path intact.
- [ ] No debug logging, duplicate imports, or missing EOF newlines in new files.
- [ ] Package/module naming collision (`ury/setup/` vs `ury/setup.py`) resolved.
- [ ] `after_install` role assignment is a no-op-safe when URY roles are missing.
- [ ] No regressions on sites that never use demo data (hooks.py additions inert
      outside setup wizard and cleanup invocation).

---

*Intake performed read-only on 2026-07-21 against `origin/develop` @ `87e6d5e` and PR head @ `895967d4`. GitHub data fetched via unauthenticated REST API; merge check via local `git merge-tree` (no working-tree mutation). No bench environment was reserved, so runtime behavior (§8) is unverified.*

# Draft Documentation Verification — Backend Half

**Scope:** `docs/index.md`, `docs/overview.md`, `docs/project-structure.md`, `docs/architecture/*.md`, `docs/backend/*.md`, `docs/reference/*.md`  
**Ground truth:** `.worktrees/ury-src/ury` (origin/develop)  
**Date:** 2026-07-08  
**Method:** Read-only comparison of checkable factual claims against source code. Vague prose and "Not determined from source" statements were skipped.

---

## Executive Summary

| Metric | Value |
|---|---|
| Files reviewed | 14 |
| Total checkable claims | ~426 |
| Inaccurate claims | 3 |
| Overall accuracy | ~99.3% |
| Worst file | `docs/backend/frappe-backend.md` |
| Best file | `docs/reference/glossary.md` (or any 100% file) |
| **Overall verdict** | **KEEP** — fix the 3 specific inaccuracies noted below |

---

## Per-File Verdicts

### `docs/backend/api-reference.md`

- **Claims checked:** ~51
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Comprehensive for the listed endpoints. Two additional whitelisted methods exist in source but are not documented here:
  - `ury.ury.doctype.ury_daily_p_and_l.ury_daily_p_and_l.get_proft_loss_details` (`ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.py:537`)
  - `ury.www.pos.get_context_for_dev` (`ury/www/pos.py:47`, guest POST)
- **Verdict:** KEEP

**Notes:**
- All 20 methods in `ury/ury_pos/api.py` match names, signatures, and purposes.
- All 11 `URY Order` methods match names and signatures.
- All 8 KOT API paths, names, and purposes verified.
- All 6 printing API paths and purposes verified.
- `cancel_check`, `overrided_past_order_list`, and the three `Sub POS Closing` helpers verified.

---

### `docs/backend/hooks-and-jobs.md`

- **Claims checked:** ~21
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Complete for the documented hooks, scheduler, and realtime channels.
- **Verdict:** KEEP

**Notes:**
- `doc_events` table matches `ury/hooks.py:128-155` exactly.
- Scheduler `cron` block matches `ury/hooks.py:160-181`.
- `kot_update_{branch}_{production}` channel format confirmed in `ury/ury/doctype/ury_kot/ury_kot.py:105` and `ury/ury/doctype/ury_order/ury_order.py:658`.
- `print_{branch}` channel confirmed in `ury/ury/api/ury_print.py:162-163`.

---

### `docs/backend/database.md`

- **Claims checked:** ~54
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Accurate inventory of doctypes, child tables, roles, and custom-field targets.
- **Verdict:** KEEP

**Notes:**
- 35 custom doctype folders confirmed under `ury/ury/doctype/`.
- Primary Doctype field/link summaries spot-checked against JSON schemas (`ury_restaurant.json`, `ury_room.json`, `ury_table.json`, `ury_menu.json`, `ury_order.json`, `ury_kot.json`, `ury_production_unit.json`, `aggregator_settings.json`, `sub_pos_closing.json`).
- Child-table list matches actual doctype folders with `istable: 1`.
- Roles in `ury/fixtures/role.json`: `URY Manager`, `URY Captain`, `URY Cashier`.
- Custom-field target doctypes and example fields confirmed in `ury/hooks.py:252-383` and `ury/setup.py:14-367`.

---

### `docs/backend/frappe-backend.md`

- **Claims checked:** ~35
- **Accuracy score:** ~94.3%
- **Inaccuracies:**
  1. **Fixtures claim.** The doc states that `ury/hooks.py` registers fixtures for "custom fields, roles, property setters, custom HTML blocks, and client scripts". The `fixtures` list in `ury/hooks.py:252-383` includes Custom Field, Property Setter, Role, and Client Script, but **does not** include Custom HTML Block. A `ury/fixtures/custom_html_block.json` file exists, but it is not registered in `hooks.py`.
  2. **`ury/public/` claim.** The doc says `ury/public/` is "generated frontend build output, not source". While `ury/public/pos/`, `ury/public/URYMosaic/`, and `ury/public/urypos/` are build outputs, `ury/public/js/` contains hand-written desk/source scripts (`quick_entry.js`, `pos_print.js`, `restrict_qty_edit_pos.js`, `ury_pos_kot.js`) per `ury/hooks.py:25-30`.
- **Coverage assessment:** Good module/controller inventory; the fixture and public-folder wording need tightening.
- **Verdict:** FIX

---

### `docs/backend/auth.md`

- **Claims checked:** ~16
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Accurate summary of authentication and authorization mechanisms.
- **Verdict:** KEEP

**Notes:**
- `ury/permission.py` contains `check_app_permission`.
- `sync_order` uses `posprofile.role_allowed_for_billing` (`ury/ury/doctype/ury_order/ury_order.py:136-138`).
- `pos_opening_check` special-cases `Administrator` (`ury/ury/doctype/ury_order/ury_order.py:389-394`).
- `captain_transfer` room validation confirmed (`ury/ury/doctype/ury_order/ury_order.py:469-483`).
- Guest-whitelisted `get_site_name` and QZ cert/key endpoints confirmed.

---

### `docs/architecture/module-dependencies.md`

- **Claims checked:** ~22
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Dependency graph matches imports and call relationships.
- **Verdict:** KEEP

**Notes:**
- `ury_order.py` imports `getBranch`, `getBranchRoom` from `ury/ury_pos/api.py` (`ury/ury/doctype/ury_order/ury_order.py:9`), confirming the Order → POSAPI edge.
- KOT publish/subscribe channel name confirmed in source.
- Frontend source files `pos/src/App.tsx` and `URYMosaic/src/components/kot.vue` exist.

---

### `docs/architecture/runtime-architecture.md`

- **Claims checked:** ~16
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Accurate request flow, route rules, lifecycle, and exit paths.
- **Verdict:** KEEP

**Notes:**
- Route rules match `ury/hooks.py:55-59`.
- Build scripts copy `index.html` to `ury/www/pos.html`, `ury/www/URYMosaic.html`, and `ury/www/urypos.html` (`pos/package.json:9`, `URYMosaic/package.json:10`, `urypos/package.json:10`).
- `ury_order.py` imports `frappe.cache` but does not use it in the order flow.

---

### `docs/architecture/system-architecture.md`

- **Claims checked:** ~27
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Accurate high-level component and pattern summary.
- **Verdict:** KEEP

---

### `docs/project-structure.md`

- **Claims checked:** ~22
- **Accuracy score:** ~95.5%
- **Inaccuracies:**
  1. **`ury/public/` description.** The doc states `ury/public/` is "generated frontend build output, not source". As noted above, `ury/public/js/` contains hand-written desk source scripts, so the blanket claim is inaccurate.
- **Coverage assessment:** Directory layout and build-output paths are otherwise correct.
- **Verdict:** FIX

---

### `docs/overview.md`

- **Claims checked:** ~22
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Accurate business-purpose summary.
- **Verdict:** KEEP

**Notes:**
- App metadata table matches `ury/hooks.py:3-11`.
- Functional scope items are supported by source.
- Actor roles align with doctype permissions and API behavior.

---

### `docs/index.md`

- **Claims checked:** ~29
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Accurate introduction and evidence-source list.
- **Verdict:** KEEP

---

### `docs/reference/repository-inventory.md`

- **Claims checked:** ~75
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Accurate folder/file inventory, doctype list, and report list.
- **Verdict:** KEEP

**Notes:**
- All 35 custom doctype folder names verified.
- All 15 query-report folder names verified under `ury/ury/report/`.
- Backend source file categories verified.
- `ury/ury/custom/item.json` confirms `ury/ury/custom/` exists.

---

### `docs/reference/source-evidence.md`

- **Claims checked:** ~20
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Backend and build evidence citations match source. Frontend citations were not deep-checked in this backend-scoped run.
- **Verdict:** KEEP

**Notes:**
- `ury_kot_validation.py` content confirms scheduled validation behavior.
- `ury_kot_order_number.py` confirms daily order number and last-invoice logic.
- `ury/hooks.py`, `ury_pos/api.py`, `ury_order.py`, `ury_print.py`, and `ury_kot_display.py` contain the cited behaviors.

---

### `docs/reference/glossary.md`

- **Claims checked:** ~16
- **Accuracy score:** 100%
- **Inaccuracies:** None
- **Coverage assessment:** Accurate definitions.
- **Verdict:** KEEP

---

## Inaccuracy Detail Table

| # | File | Claim | Source Evidence | Status |
|---|---|---|---|---|
| 1 | `docs/backend/frappe-backend.md` | `ury/hooks.py` registers fixtures for "custom HTML blocks" | `ury/hooks.py:252-383` lists only Custom Field, Property Setter, Role, Client Script; `ury/fixtures/custom_html_block.json` exists but is not registered | INACCURATE |
| 2 | `docs/backend/frappe-backend.md` | `ury/public/` is "generated frontend build output, not source" | `ury/public/js/quick_entry.js`, `pos_print.js`, `restrict_qty_edit_pos.js`, `ury_pos_kot.js` are hand-written desk scripts included via `ury/hooks.py:25-30` | INACCURATE |
| 3 | `docs/project-structure.md` | Same `ury/public/` build-output claim | Same source evidence as #2 | INACCURATE |

---

## Summary Table

| File | Claims Checked | Inaccuracies | Accuracy | Verdict |
|---|---|---|---|---|
| `docs/backend/api-reference.md` | ~51 | 0 | 100% | KEEP |
| `docs/backend/hooks-and-jobs.md` | ~21 | 0 | 100% | KEEP |
| `docs/backend/database.md` | ~54 | 0 | 100% | KEEP |
| `docs/backend/frappe-backend.md` | ~35 | 2 | ~94.3% | FIX |
| `docs/backend/auth.md` | ~16 | 0 | 100% | KEEP |
| `docs/architecture/module-dependencies.md` | ~22 | 0 | 100% | KEEP |
| `docs/architecture/runtime-architecture.md` | ~16 | 0 | 100% | KEEP |
| `docs/architecture/system-architecture.md` | ~27 | 0 | 100% | KEEP |
| `docs/project-structure.md` | ~22 | 1 | ~95.5% | FIX |
| `docs/overview.md` | ~22 | 0 | 100% | KEEP |
| `docs/index.md` | ~29 | 0 | 100% | KEEP |
| `docs/reference/repository-inventory.md` | ~75 | 0 | 100% | KEEP |
| `docs/reference/source-evidence.md` | ~20 | 0 | 100% | KEEP |
| `docs/reference/glossary.md` | ~16 | 0 | 100% | KEEP |
| **Total** | **~426** | **3** | **~99.3%** | **KEEP** |

---

## Recommended Fixes

1. In `docs/backend/frappe-backend.md` and `docs/project-structure.md`, clarify that `ury/public/js/` contains hand-written desk scripts, while `ury/public/pos/`, `ury/public/URYMosaic/`, and `ury/public/urypos/` are generated frontend build outputs.
2. In `docs/backend/frappe-backend.md`, remove "custom HTML blocks" from the `hooks.py` fixtures list, or note that `custom_html_block.json` exists as an exported fixture file but is **not** currently registered in `hooks.py`.

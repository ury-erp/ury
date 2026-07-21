# Intake Dossier — PR #145: Dynamic KOT Reprint Logic by Production Unit, Room, and Profile

## 1. PR Metadata

- **PR:** ury-erp/ury#145 (open, not draft)
- **Title:** Dynamic KOT Reprint Logic by Production Unit, Room, and Profile
- **Author:** swafa-as
- **Created:** 2026-06-25 · **Last updated:** 2026-07-06
- **Base:** `develop` · **Head:** `kot-reprint-by-production-unit` (head SHA `3ad45f8`, confirmed identical to local analysis branch `pr-test-145`)
- **Size:** 7 commits, 3 files changed, +229 / −37
- **Comments / reviews:** none recorded on the PR (checked via GitHub API, 2026-07-21)

## 2. Purpose and Current Implementation

**Purpose.** Replace the static KOT-reprint configuration (one "table order printer" + one "parcel order printer" + one reprint format, all set directly on the POS Profile) with dynamic, granular routing of KOT reprints by **Production Unit → Room → POS Profile** hierarchy.

**Implementation** (full rewrite of `ury/ury/api/ury_kot_reprint.py`):

1. `reprint_kot(invoice_number)` loads the full `POS Invoice` doc instead of `frappe.db.get_value`.
2. Keeps the existing kill-switch: `POS Profile.custom_enable_kot_reprint` must be set, else `frappe.throw`.
3. For every `URY Production Unit` in the invoice's `branch`, it collects the unit's `URY Production Item Groups`, filters invoice items (`qty > 0`) whose `Item.item_group` matches, and — if any match — deep-copies the invoice, replaces `items` with the filtered subset, stamps `temp_doc.custom_production_unit` and `temp_doc.order_no` (from `custom_ury_order_number`), and prints to each `URY Printer Settings` row on the production unit that has `custom_kot_reprint` + `custom_kot_reprint_format` set. Rows with `custom_block_takeaway_kot` are skipped for invoices without a `restaurant_table`.
4. If the invoice has a `restaurant_table`, it resolves the `URY Room` and prints the full item list to the room's `URY Printer Settings` rows (same reprint flags).
5. Otherwise (takeaway / direct), it falls back to the `URY Printer Settings` rows on the **POS Profile** itself.
6. `print_kot()` gained a `doc=None` parameter and calls `print_by_server("POS Invoice", docname, printer, kot_print_format, doc=doc)` so the print format renders the filtered clone.
7. If nothing printed, it logs an error and **returns** `"Failure: No valid printers found"` instead of throwing.

**Configuration surface added** (via `ury/fixtures/custom_field.json` + fixture-name list in `ury/hooks.py`):

- `URY Printer Settings.custom_kot_reprint` (Check) — row participates in reprints.
- `URY Printer Settings.custom_kot_reprint_format` (Link → Print Format) — per-row reprint format.
- Description-only updates marking legacy POS Profile fields (`custom_reprint_kot_format`, `custom_table_order_printer`, `custom_parcel_order_printer`) as **deprecated**; the fields themselves are kept.

## 3. Relevance

- The feature addresses a real gap: multi-kitchen restaurants currently cannot reprint a KOT to the correct production unit; everything goes to one static printer.
- **However, the only in-repo caller is the legacy Vue POS** (`urypos/src/stores/invoiceData.js:441` → `ury.ury.api.ury_kot_reprint.reprint_kot`). The current React POS v2 (`pos/`) has no caller of this endpoint, so the change only benefits the legacy frontend unless/until POS v2 wires it up.
- No print formats are shipped with the PR; `custom_kot_reprint_format` must be configured by each site, and the formats must know how to render `doc.order_no` / `doc.custom_production_unit` (both are ad-hoc attributes set on the cloned doc, not real fields).

## 4. Diff and Affected Modules

| File | Change |
|---|---|
| `ury/ury/api/ury_kot_reprint.py` | Rewritten (+~105/−37). See §2. Indentation switched from spaces to tabs (whole-file churn). `import copy` appears twice (module level and inside function). |
| `ury/hooks.py` | +2 lines: adds the two new `URY Printer Settings` custom fields to the `custom_field` fixture name list. |
| `ury/fixtures/custom_field.json` | +122 lines: two new custom-field records; description updates on three legacy POS Profile reprint fields. |

**Behaviorally affected modules:**

- `urypos` (legacy POS) — its reprint button now triggers the new routing; sites with only the old POS Profile fields configured will get `"Failure: No valid printers found"` until they reconfigure.
- Frappe print subsystem — relies on `frappe.utils.print_format.print_by_server` accepting a `doc=` kwarg.
- Doctypes used as config: `URY Production Unit` (has `branch`, `item_groups`, `printer_settings` child), `URY Room` (has `printer_settings` child), `POS Profile` (`printer_settings` child), `URY Printer Settings` (child table rows).

## 5. Relationship to `develop`

- Not merged. Head `3ad45f8` is not an ancestor of `develop` (`87e6d5e`).
- Merge-base with develop: `ad262a0`. The PR branched off before the shared-frontend-packages restructure (PR #181) but does not touch frontend code, so that restructure does not affect it.
- `print_by_server(..., doc=doc)` compatibility with the Frappe version pinned on `develop` is unverified — needs confirmation (see Risks).

## 6. Conflicts and Overlapping PRs

**Textual conflicts with current `develop`** (verified via `git merge-tree`):

- `ury/fixtures/custom_field.json` — **conflicts** (fixture file has moved on; large JSON array conflict).
- `ury/hooks.py` — **conflicts** (fixture name list changed on both sides).
- `ury/ury/api/ury_kot_reprint.py` — no textual conflict.

**Overlapping / competing open PRs:**

- **PR #185 `feat/thermal-printing-v2`** — *hard semantic conflict*. It rewrites the same `reprint_kot`/`print_kot` functions but keeps the **old static** `custom_table_order_printer`/`custom_parcel_order_printer` fields and swaps the transport to `print_via_cups`/`is_strict_print` from a new `ury_print` module. Whichever merges second must be rebased and reconciled — they take the same code in opposite directions (static vs. hierarchical routing, and different print transports).
- **PR #154 `order_delay`** — massive `custom_field.json` rewrite (~11.8k lines) + `hooks.py`; fixture conflict guaranteed.
- **PR #179 `deploy/develop-logo-and-merge-fields`** — large `custom_field.json` rewrite + `hooks.py`; fixture conflict guaranteed.
- **PR #125 `feature/room-level-waiter-print`** / **PR #129 `feature/waiter-delta-kot-print`** — waiter-order-slip printing; touch `custom_field.json`/`hooks.py` fixtures (conflict-prone) and live in the same KOT/print domain, though different files for logic.
- **Branch `origin/kot-print`** — an older iteration of essentially this same change (same three files, +199/−38); appears superseded by this PR's head branch but confirms churn in this area.

## 7. Remaining Work

- Rebase onto `develop` and resolve `custom_field.json` + `hooks.py` fixture conflicts (re-export fixtures from a migrated site rather than hand-editing JSON).
- Reconcile with PR #185: decide one print transport (`print_by_server` vs. `print_via_cups`) and one reprint-routing model; whichever PR lands second needs a rewrite of its `reprint_kot`.
- Add a data migration / patch copying existing POS Profile static reprint config (printer + format) into `URY Printer Settings` rows so existing sites don't silently lose reprints.
- Fix code-quality issues: duplicate `import copy`, spaces→tabs churn, per-item `frappe.db.get_value("Item", …, "item_group")` N+1 query (should be one `get_all` with `IN`), unused `order_type` variable.
- Decide the contract for `temp_doc.order_no` / `temp_doc.custom_production_unit` (ad-hoc attrs) and ship or document a compatible reprint print format.
- Verify `print_by_server(..., doc=...)` exists in the Frappe version in use; add a fallback if not.
- Wire the endpoint (or an equivalent) into React POS v2 (`pos/`) if reprint is expected there.
- Review the new `"Failure: …"` string return vs. throwing — callers currently only check for success implicitly.

## 8. Risks

- **Silent behavior regression:** existing sites configured with the deprecated POS Profile fields get no reprints (only an Error Log entry + `"Failure"` string) after upgrade — no migration path provided.
- **Direction clash with PR #185:** merging both without reconciliation will leave the codebase in a mixed state (static fields read by one transport, hierarchical config by another).
- **Fixture-only custom fields:** the new `URY Printer Settings` fields exist only in `fixtures/custom_field.json`; they are not created by `ury/setup.py::add_custom_fields()`, so installs that don't sync fixtures won't have them.
- **Untested:** no automated tests anywhere near this module; the repo has no test coverage for KOT reprint.
- **API fragility:** depends on a `doc=` kwarg in `print_by_server`; a Frappe upgrade that changes that signature breaks reprints at runtime (caught only by the generic `except`).
- **N+1 queries:** one DB hit per invoice item for `item_group`; fine for small tickets, poor for large aggregator orders.
- **Error-handling smell:** the broad `try/except` wraps intentional `frappe.throw`s into the generic "unexpected error" message, hiding actionable messages ("KOT Reprint is disabled…").
- **`deepcopy` of a full `POS Invoice` doc** per production unit is memory-heavy and brittle (child doc state, `__unsaved` flags); a slim DTO would be safer.

## 9. Required Tests

The repo has no existing test suite for this area; at minimum add/execute:

1. **Unit tests for `reprint_kot`** (new file, e.g. `ury/ury/api/test_ury_kot_reprint.py`):
   - reprint disabled on POS Profile → throws.
   - items split across two production units → each unit's printer receives only its item subset (mock `print_by_server`).
   - `custom_block_takeaway_kot` row skipped for invoice without table; honored for dine-in.
   - room-level printers used when `restaurant_table` set; POS Profile fallback when not.
   - no matching production unit / no configured rows → `"Failure"` path logs and does not throw.
2. **Fixture/patch test:** fresh site migrate yields the two new custom fields.
3. **Migration test (once written):** legacy POS Profile config is copied into printer-settings rows.
4. **Manual E2E:** legacy POS reprint button on a dine-in invoice with 2 production units, and on a takeaway invoice; verify printout shows only relevant items + order number.

## 10. Recommended Disposition

**Rework / hold — do not merge as-is.** The feature direction is sound and fills a real gap, but the PR (a) conflicts with `develop`, (b) heads in the opposite direction from open PR #185 on the exact same functions, (c) ships no migration for the config it deprecates, and (d) has no tests. Recommended path: sequence it **after** a decision on PR #185's print transport, rebase, add a config-migration patch, add unit tests, then merge. Alternatively split into two PRs: (1) new per-row reprint fields + migration, (2) routing rewrite.

## 11. Atomic Subtasks

| # | Subtask | Difficulty | Risk | Uncertainty |
|---|---|---|---|---|
| 1 | Decide routing + transport strategy vs. PR #185 (with maintainer) | Low | High (wrong choice = rework) | High — needs maintainer input |
| 2 | Rebase onto `develop`; resolve `hooks.py` conflict | Low | Low | Low |
| 3 | Re-export `custom_field.json` fixtures from a migrated site; resolve conflict | Medium | Medium (fixture churn across PRs 154/179) | Medium |
| 4 | Write patch migrating legacy POS Profile reprint config → `URY Printer Settings` rows | Medium | High (data loss if wrong) | Medium |
| 5 | Add new custom fields to `setup.py::add_custom_fields()` (not just fixtures) | Low | Low | Low |
| 6 | Code-quality pass: dedupe `import copy`, fix indentation churn, batch `item_group` lookup, drop unused var | Low | Low | Low |
| 7 | Unit tests for `reprint_kot` routing matrix (mock `print_by_server`) | Medium | Medium | Low |
| 8 | Verify/guard `print_by_server(doc=…)` against the pinned Frappe version | Low | Medium | Medium |
| 9 | Ship or document a KOT reprint print format using `order_no` / production unit | Medium | Low | Medium |
| 10 | (Optional) Wire reprint into React POS v2 | Medium | Medium | High — product decision |

## 12. Acceptance Criteria for the PR (proposed)

- Rebases cleanly onto `develop`; `bench migrate` on a fresh site creates `custom_kot_reprint` and `custom_kot_reprint_format`.
- Existing sites with only legacy POS Profile reprint config keep working post-migration (patch verified).
- `reprint_kot` routes items to the correct production-unit printers; takeaway-blocking, room-level, and POS Profile fallback paths all behave per spec.
- Unit tests in §9.1 pass (`bench run-tests`).
- No conflict with the merged state of PR #185 (single print transport, single config model).
- No regression in the legacy POS reprint button (manual check).

---

*Intake analysis performed 2026-07-21 against head `3ad45f8` and `develop` `87e6d5e`. All repository and PR content treated as data; no files modified except this dossier.*

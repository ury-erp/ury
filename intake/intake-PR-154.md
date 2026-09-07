# Intake Dossier — PR #154

- **PR:** [ury-erp/ury#154](https://github.com/ury-erp/ury/pull/154) — "feat: is update printing time when POS invoice printed and create custom fields"
- **State:** Open, **Draft**, 1 commit, no reviews, no comments, reviewer requested: `swafa-as`
- **Author:** shahalatridz · **Created:** 2026-06-30 · **Last update:** 2026-07-01
- **Head:** `ury-erp:order_delay` @ `d6481eaf` → **Base:** `develop` @ `ad262a04` (PR-open-time base)
- **GitHub mergeability:** `mergeable: false`, `mergeable_state: dirty` (conflicts with current `develop`)
- **Intake date:** 2026-07-21 · Intake performed against `origin/develop` @ `87e6d5e5`

## 1. Purpose / Current Implementation

**Stated purpose (PR body):** record the time a POS Invoice was printed — set `custom_printing_time` when the `invoice_printed` flag is flipped — and add two custom fields: `POS Invoice-custom_printing_time` and `POS Profile-custom_invoice_warning_time`.

**What the code actually does:**

1. `ury/ury/api/ury_print.py` — at every existing site that sets `POS Invoice.invoice_printed = 1`, the call is rewritten from the scalar form `frappe.db.set_value("POS Invoice", name, "invoice_printed", 1)` to the dict form, adding `"custom_printing_time": frappe.utils.now_datetime()`. Three functions touched:
   - `network_printing()` — both branches of the `restaurant_table and invoice_printed == 0` if/else (the two branches become identical for the POS Invoice update).
   - `qz_print_update()` — both the no-table branch (always) and the table branch (only when `invoice_printed == 0`).
   - `print_pos_page()` — only when `invoice_printed == 0` (first print).
2. `ury/fixtures/custom_field.json` — full re-export; adds the two new field definitions:
   - `POS Invoice-custom_printing_time` — fieldtype **Time**, label "Printing Time", insert_after `custom_aggregator_id`.
   - `POS Profile-custom_invoice_warning_time` — fieldtype **Int**, label "Invoice Warning Time", insert_after `custom_edit_order_type`, description: "Maximum time (in minutes) allowed to submit a POS Invoice after creation."
3. `ury/hooks.py` — registers the two new field names in the `fixtures` export filter list (auto-merges cleanly with develop).

**Not implemented:** `custom_invoice_warning_time` is defined and registered but **no code anywhere reads it** — the validation/warning logic it is meant to drive (presumably the "order_delay" feature the branch is named after) is absent from this PR. The PR delivers only the timestamp half of the feature.

## 2. Relevance

- The underlying need (audit timestamp of first invoice print) is still unmet: neither field exists on current `develop`, and nothing on develop writes a print timestamp.
- However, the feature is **partial**: the warning-time field is dead weight without consumer logic, and the branch name (`order_delay`) plus the field description suggest a larger feature (invoice submission delay warning) that was never finished.
- The PR has been idle since 2026-07-01 and is marked draft; the `ury_print.py` code it edits has since been substantially reworked on develop (multi-printer bill printing, bill merge/split, `release_merge_cluster_tables`).

## 3. Diff & Affected Modules

| File | +/- | Nature |
|---|---|---|
| `ury/fixtures/custom_field.json` | +6099 / −5719 | 2 genuinely new field definitions + full re-export churn: 101 pre-existing fields have incidental key changes (`show_dashboard`, `module`) from a newer Frappe export format |
| `ury/ury/api/ury_print.py` | +38 / −5 | The real logic change (4 `set_value` call sites, ~20 effective lines) |
| `ury/hooks.py` | +3 / −1 | Fixture filter registration |

**Effective change size is small (~60 real lines);** the 11.8k-line diff is 97% fixture re-export noise. Affected modules: print pipeline (`network_printing`, `qz_print_update`, `print_pos_page`), POS Invoice/POS Profile schema fixtures. Callers of these functions (`ury_pos/api.py`, QZ print path, `www` print page) are behaviorally affected only by the extra column write.

## 4. Relationship to `develop`

- Merge-base with develop = the PR's recorded base `ad262a04`; head is **1 commit ahead, 76 commits behind** develop (`87e6d5e5`).
- Since the base, develop landed: multi-printer bill printing (PR #143 / `261e122`), bill merge/split backend (`7ed262a`, `ea69bc1`, `3bddb54`, `1663330`) which refactored the exact `set_value(..., "invoice_printed", 1)` call sites and replaced direct `URY Table` occupied-flag updates with `release_merge_cluster_tables(...)`.
- Develop's `custom_field.json` gained 7 new merge/split fields (`custom_merged_pos_invoice`, `custom_split_group`, etc.) since the base.
- Neither `custom_printing_time` nor `custom_invoice_warning_time` exists on develop — no duplication, no superseding work.

## 5. Conflicts & Overlapping PRs

**Conflicts (verified with `git merge-tree origin/develop origin/order_delay`):**

- `ury/ury/api/ury_print.py` — **content conflict**. Mechanical: develop restructured the same lines (multi-printer loops, `release_merge_cluster_tables`). Resolution = re-apply the dict-form `set_value` with `custom_printing_time` onto develop's current structure. Low difficulty.
- `ury/fixtures/custom_field.json` — **content conflict**. Mechanical but tedious: develop added 7 fields; PR re-exported the whole file. Correct resolution is **not** "take theirs" — the re-export churn (101 fields with `show_dashboard`/`module` churn) should be dropped and only the 2 new field entries appended to develop's file.
- `ury/hooks.py` — auto-merges cleanly.

**Overlapping open PRs:**

- **PR #185 "Feat/thermal printing v2"** (open, not draft, updated 2026-07-17) — touches `ury/ury/api/ury_print.py`, `ury/fixtures/custom_field.json`, and `ury/hooks.py`. Highest collision risk; whichever merges second will conflict again. Coordinate ordering.
- PR #50 "enforce print-before-payment" — touches the same `invoice_printed`/print gating area (`hooks.py`, `ury_pos/api.py`); semantic overlap, no direct file conflict on `ury_print.py`.
- PRs #129 / #125 (waiter/KOT slip printing) — touch `custom_field.json` + `hooks.py` fixture lists; fixture-file conflict risk only.

## 6. Remaining Work (to make the PR mergeable/complete)

1. Rebase `order_delay` onto current `develop` and resolve both conflicts as described in §5 (re-apply logic onto new structure; strip fixture re-export churn).
2. Fix the fieldtype mismatch (see Risks): decide Time vs Datetime for `custom_printing_time` and align the write (`frappe.utils.now_datetime()` vs `nowtime()`).
3. Either implement the consumer for `custom_invoice_warning_time` (the actual order-delay warning/validation) or drop the field from this PR and split it into the branch's real feature PR.
4. Normalize the inconsistent write semantics: `qz_print_update` no-table branch writes the timestamp on every call; other sites write only on first print (`invoice_printed == 0`). Decide whether "printing time" means first-print or last-print and make all four sites agree.
5. Collapse the now-identical if/else branches in `network_printing` (both branches perform the same POS Invoice update after the change).
6. Undraft, add tests, re-request review.

## 7. Risks

- **Fieldtype defect:** `custom_printing_time` is declared `Time` but the code writes `frappe.utils.now_datetime()` (a full `"YYYY-MM-DD HH:MM:SS"` datetime). Frappe `Time` fields expect `HH:MM:SS`; this risks validation failure or silent truncation of the date, making cross-midnight analysis wrong. Likely should be `Datetime`.
- **Draft + abandoned signal:** idle 3 weeks, draft, zero review activity — author intent (is the delay-warning half coming?) is unknown. High uncertainty on scope.
- **Semantic ambiguity:** first-print vs last-print timestamp is not defined; current code mixes both.
- **Collision with PR #185:** thermal-printing-v2 rewrites the same module; merging #154 first may force rework there, or #154 may be fully superseded by it.
- **Fixture hygiene:** if merged naively ("accept theirs" on the JSON), the re-export churn silently mutates 101 unrelated field definitions (`show_dashboard`, `module` keys) — hard to review, easy to regress.
- **`update_modified=False` paths** in `qz_print_update` mean the timestamp write will not bump `modified` — fine, but downstream consumers must not rely on `modified`.

## 8. Required Tests

- **Manual/API:** print a POS Invoice via each of the three paths (network printer, QZ tray, print page) on a draft invoice and verify `invoice_printed = 1` and `custom_printing_time` populated with the correct value (and correct type after the fieldtype fix).
- **Reprint case:** print an already-printed invoice; verify timestamp behavior matches the chosen first-print/last-print semantics per path.
- **Table-release regression:** verify `release_merge_cluster_tables` still fires on print for table invoices (merged-bill flow from develop must keep working after conflict resolution).
- **Fixture round-trip:** `bench migrate` on a fresh site installs the two custom fields; `bench export-fixtures --app ury` produces no unrelated diff.
- **If warning-time consumer is implemented:** invoice submitted within/beyond `custom_invoice_warning_time` minutes triggers/blocks as designed.
- No automated tests exist in the repo for `ury_print.py`; consider adding a minimal unit test mirroring `ury/ury/api/test_ury_waiter_print.py` style.

## 9. Recommended Disposition

**Rework (rebase + fix) rather than merge-as-is or close.** The core change is small, still relevant, and not duplicated elsewhere, but the PR in its current form is unmergeable (conflicts), partially incorrect (Time vs Datetime), and incomplete (dead `custom_invoice_warning_time` field). Before investing the rebase, confirm with the author/reviewer whether the order-delay warning logic will follow in this PR or a separate one, and check sequencing against PR #185. If #185 lands first and subsumes the print pipeline, re-target this change onto it; the dict-form `set_value` addition is ~10 lines and cheap to re-apply anywhere.

## 10. Atomic Subtasks

| # | Subtask | Difficulty | Risk | Uncertainty |
|---|---|---|---|---|
| 1 | Rebase `order_delay` onto develop; resolve `ury_print.py` conflict by re-applying dict-form `set_value` + `custom_printing_time` onto the new multi-printer/merge-cluster structure | Low | Low | Low |
| 2 | Resolve `custom_field.json` conflict: append only the 2 new field entries to develop's file; discard the 101-field re-export churn | Low | Medium (easy to accidentally keep churn) | Low |
| 3 | Fix `custom_printing_time` fieldtype (Time → Datetime) or change the write to `nowtime()`; migrate fixture + code consistently | Low | Medium (data-shape decision) | Medium (needs product call) |
| 4 | Unify first-print vs last-print semantics across the 4 write sites; collapse duplicated if/else in `network_printing` | Low | Low | Medium (undefined requirement) |
| 5 | Decide fate of `custom_invoice_warning_time`: implement consumer validation/warning logic, or remove field from this PR | Medium–High if implemented | Medium | High (feature spec absent) |
| 6 | Coordinate merge order with PR #185 (thermal printing v2) | Low | Low | Medium (external dependency) |
| 7 | Manual end-to-end print tests (§8) + optional unit test for timestamp write | Low | Low | Low |
| 8 | Undraft PR, update title/description to conventional-commit format, re-request review | Low | Low | Low |

## 11. Acceptance Criteria (for the PR, post-rework)

- `custom_printing_time` is populated with a correct, consistently-typed timestamp on first (or last, per decided semantics) invoice print via network, QZ, and print-page paths.
- Reprint behavior is identical across all three print paths.
- Merged-bill table release (`release_merge_cluster_tables`) still works after resolution.
- `custom_field.json` diff contains exactly the intended new/changed field definitions — no re-export churn.
- `custom_invoice_warning_time` either has working consumer logic or is removed from the PR.
- PR merges cleanly into `develop` (no conflicts), CI/migrate passes on a fresh site.

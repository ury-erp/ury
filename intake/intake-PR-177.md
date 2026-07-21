# Intake Dossier — PR #177

> Source: https://github.com/ury-erp/ury/pull/177
> Intake date: 2026-07-21 · Analyzer: loopkit worker (task/PR-177-intake)

## 1. Summary / Purpose

| Field | Value |
|---|---|
| Title | `feat(mosaic): implement production dashboard landing page` |
| Author | ShahalaKP-Tridz (shahala@tridz.com) |
| State | **Open, DRAFT** |
| Base → Head | `develop` ← `Mosaic_PU_Card` (same repo, `ury-erp/ury`) |
| Created / Updated | 2026-07-08 / 2026-07-17 |
| Size | 41 files, +6,841 / −6,513 (but ~12,700 of those lines are a whitespace-only reformat of `ury/fixtures/custom_field.json`) |
| Commits | 7 |
| GitHub mergeability | `mergeable: true`, `mergeable_state: clean` |
| Reviews / comments | None |

The PR does three things bundled together:

1. **Rename the KOT display app** `URYMosaic/` → `mosaic/` (done in two steps: `URYMosaic` → `Mosaic` → `mosaic`), including all references: `.gitignore`, root `package.json` scripts, `ury/hooks.py` route rule (`/URYMosaic/<path>` → `/mosaic/<path>`), Vite `outDir`/`base`, and docs (`AGENTS.MD`, `FEATURES.md`, `SETUP.md`, `mosaic/AGENTS.MD`).
2. **Add a Production Dashboard landing page** to the Mosaic KOT display: new `ProductionDashboard.vue` + `ProductionCard.vue` components served at the root route `/mosaic/`, with KOT screens moved to `/:production`. A new whitelisted backend endpoint `ury.ury.api.ury_mosaic.get_production_dashboard` returns per-production-unit KOT counts. `kot.vue` is refactored to receive the production unit as a router prop instead of parsing `window.location`, and gains an empty-state message ("No active orders for X").
3. **Add a "Disabled" flag for Production Units**: new custom field `URY Production Unit.disable` (Check, label "Disabled") in `fixtures/custom_field.json`; disabled units render blurred on the dashboard and are not clickable.

### Commit list (oldest → newest)

- `1d245a9` feat(mosaic): implement production dashboard landing page
- `9f05413` chore: rename URYMosaic to Mosaic
- `abaa3c3` Merge branch 'develop' into Mosaic_PU_Card
- `4b01705` chore: remove temporary scripts before push
- `c0a95d1` chore: untrack build files and update gitignore
- `bf3b1ac` chore: completely rename Mosaic to mosaic
- `12e0dd1` feat(mosaic): add production unit disable support and refine dashboard UI

## 2. Diff and Affected Modules

### Backend (`ury/`)

- **`ury/ury/api/ury_mosaic.py` (new, 57 lines)** — `get_production_dashboard()` (whitelisted): lists all `URY Production Unit` records with `disable` flag; per unit counts submitted `URY KOT`s with `order_status = "Ready For Prepare"` ("active"), `"Served"`, and total.
- **`ury/ury/api/ury_kot_display.py`** — adds `build_dashboard_summary(kot_list)` and a new `Dashboard` key in the `kot_list` response. **Note: the new frontend never consumes this key** (the dashboard calls `get_production_dashboard` instead) — dead response payload with semantics that differ from `ury_mosaic.py`.
- **`ury/hooks.py`** — one line: website route rule `/URYMosaic/<path:app_path>` → `/mosaic/<path:app_path>`, `to_route: mosaic`.
- **`ury/fixtures/custom_field.json`** — the only semantic change is **+1 field** (`URY Production Unit-disable`, Check, label "Disabled"; 112 → 113 fields). The remaining ~12,700 changed lines are a pure indentation reformat of the entire fixture file.

### Frontend (`URYMosaic/` → `mosaic/`)

- Whole-directory rename; content changes within it:
  - `src/router/index.js` — new routes: `/` → `ProductionDashboard`, `/:production` → `KOT` (props: true); history base changed to `/mosaic/` (old code used deprecated `base` option with `/URYMosaic/`).
  - `src/main.js` — the old `router.beforeEach` guard (which referenced an undefined `auth` variable) replaced with a no-op `next()` guard. Router-level auth gating is effectively removed; `kot.vue` still does its own `auth()` check with a login modal.
  - `src/components/kot.vue` — `production` now arrives via router props; adds `loadingKots` flag + empty-state UI; login redirect updated to `/login?redirect-to=mosaic/<unit>`; fixes a real bug: `window.addEventListener("resize", this.masonryLoading())` (invoked immediately, registered `undefined`) → `this.masonryLoading`.
  - `src/components/production/ProductionDashboard.vue`, `ProductionCard.vue` (new) — dashboard grid; disabled units get `opacity-50 blur-[1px] cursor-not-allowed` and clicks are suppressed client-side only.
  - `index.html`, `vite.config.js`, `package.json` — renamed app (`name: "mosaic"`), build base `/assets/ury/mosaic/`, `outDir: ../ury/public/mosaic`, `copy-html-entry` → `../ury/www/mosaic.html`.

### Repo root / docs

- `package.json` — `ury-mosaic-*` scripts now `cd mosaic`; adds `ury-posv2-install` script (unrelated drive-by).
- `.gitignore` — `URYMosaic` paths → `mosaic` paths (incl. `ury/www/mosaic.html`, `ury/public/mosaic`).
- `AGENTS.MD`, `FEATURES.md`, `SETUP.md`, `mosaic/AGENTS.MD` — doc updates for the rename and new URL scheme.

## 3. Relevance

- The Mosaic KOT display is a live, documented product surface (`/URYMosaic/<unit>` per AGENTS.MD/FEATURES.md/SETUP.md). A landing dashboard is a genuine UX improvement for multi-kitchen sites that today must deep-link each unit.
- The `kot.vue` prop refactor and the resize-listener bug fix are real correctness improvements.
- The rename to lowercase `mosaic` aligns URL and directory naming, but is **duplicative of open PR #118** (see §5) and is a **breaking URL change**.
- The "disable production unit" feature is reasonable but implemented presentation-layer-only.

## 4. Relationship to `develop`

- Merge-base with `origin/develop` is `87e6d5e` — **the current tip of develop** (develop has not advanced since the PR was rebased/merged up on 2026-07-15/17). The PR is effectively a clean fast-forward; GitHub confirms `mergeable_state: clean`.
- The branch fully contains develop; no rebase needed as of intake date.
- Post-merge, **zero** references to `URYMosaic` remain outside build output (verified by `git grep` on the PR head).

## 5. Conflicts and Overlapping PRs

### Direct conflict — PR #118 ("Changed URYMosaic folder into Mosaic and its references")

- Open PR #118 performs **the same rename but to `Mosaic/` (capital M)** with route `/Mosaic/<path>`, and also touches unrelated POS/urypos files. PR #177 renames to lowercase `mosaic/`. These are mutually exclusive: merging either one makes the other unmergeable (same files moved to different destinations). **One must be chosen and the other closed.** PR #177 is the more complete and more recently updated of the two, and its lowercase choice matches the other app routes (`/pos`, `/ury`, `/urypos`).

### Fixture/hooks overlap — high textual-conflict risk

PR #177's whole-file reindent of `ury/fixtures/custom_field.json` guarantees merge conflicts with every other open PR that touches that fixture, even though each adds different fields:

- PR #185 (thermal printing v2) — touches `custom_field.json` + `hooks.py`
- PR #179 (logo/merge fields) — touches `custom_field.json` + `hooks.py`
- PR #154 (order_delay) — touches `custom_field.json` + `hooks.py`
- PR #145 (KOT reprint by production unit) — touches `custom_field.json` + `hooks.py`

The `hooks.py` change itself is a single line in `website_route_rules` and will merge cleanly in most cases; the fixture reformat is the conflict magnet. Whichever of these merges second will need a regenerate-and-re-export of the fixture.

No overlap found with PRs #165, #188, #132/#130, #129, #125, #116, #108, #97, #96, #91, #76, #74, #50 on the files this PR touches (spot-checked via name-only diffs).

## 6. Issues Found (Analysis, Not Fixed)

1. **`get_production_dashboard` counts are wrong-scoped.** `get_kot_counts` has **no `creation`/date filter and no `branch` filter**: "active" counts every submitted `Ready For Prepare` KOT ever created (any branch, any date), and "served"/"total" grow monotonically forever. `kot_list` (the existing API) filters to the last 3 hours and the current branch. The dashboard cards will show ever-inflating, cross-branch numbers that disagree with the actual KOT screens.
2. **Two divergent dashboard computations.** `build_dashboard_summary` (3-hour, per-KOT-list semantics, added to `kot_list` response as `Dashboard`) is unused by the frontend; `ury_mosaic.get_production_dashboard` (all-time counts) is the one actually called. One of them is dead code on arrival.
3. **Disable is cosmetic only.** Nothing server-side enforces a disabled production unit: `kot_list` still returns its KOTs, direct navigation to `/mosaic/<disabled-unit>` still renders the KOT screen (the router has no guard), and the POS can still generate KOTs for it. The blur/no-click is purely client-side on the dashboard card.
4. **Breaking URL change with no redirect.** `/URYMosaic/<unit>` stops resolving after merge (route rule replaced, not duplicated). Kitchen screens are typically bookmarked/printed on station signage — every existing KDS bookmark breaks. No compatibility redirect is kept.
5. **Custom field on a custom doctype.** `disable` is added via the fixtures `custom_field.json` even though `URY Production Unit` is URY's own doctype (`ury/ury/doctype/ury_production_unit/`) — the field belongs in the doctype JSON itself. Also note the Frappe-wide convention is `disabled`, not `disable`.
6. **Fixture reformat noise.** The 12,700-line whitespace reformat of `custom_field.json` obscures the one-field change and manufactures conflicts with four other open PRs.
7. **Router auth guard removed.** The old (broken) guard referencing undefined `auth` is replaced by a no-op `next()`. `kot.vue`'s own auth modal still gates the KOT screen, but the new `ProductionDashboard` component performs **no auth check at all** — it calls a whitelisted (login-required) API and on 403 just logs to console and renders an empty grid.
8. **Minor:** `package.json` gains an unrelated `ury-posv2-install` script; several files lost their trailing newline; PR is still marked **Draft**; PR body documents only commit `1d245a9` (the disable feature and rename are undocumented in the body).

## 7. Risks

- **Operational (high if merged as-is):** all existing `/URYMosaic/...` bookmarks and documented URLs break instantly on deploy; kitchen screens 404 until re-bookmarked.
- **Data-trust (medium):** dashboard counts diverge from KOT screens (all-time vs 3-hour window, cross-branch vs branch-scoped) — kitchen managers will see numbers that don't match reality.
- **Merge-train (medium):** the fixture reformat will conflict with PRs #145/#154/#179/#185; ordering matters.
- **Duplicate-work (medium):** unresolved overlap with PR #118 could waste review effort or produce a confusing double rename.
- **Security (low):** disabled-unit and dashboard access controls are client-side only; consistent with existing Mosaic posture (whitelisted, login-required APIs, no role checks) but not an improvement.
- **Build/deploy (low):** deploys must run the mosaic build (`yarn ury-mosaic-build` + `bench build --app ury`) or `ury/www/mosaic.html` won't exist and `/mosaic` 404s; the route-rule change and the asset build must land together.

## 8. Required Tests / Verification

There is no automated test suite in this repo for the Mosaic app or the API modules; verification is build + manual:

1. `yarn install` at repo root (postinstall must succeed with `cd mosaic`) and `yarn ury-mosaic-build` (or root `yarn build`) — confirms the renamed app builds and `ury/www/mosaic.html` is generated.
2. `bench build --app ury` + `bench migrate` on a test site — confirms the new `URY Production Unit.disable` custom field installs from fixtures.
3. Route smoke test: `/mosaic/` renders the dashboard; `/mosaic/<unit>` renders the KOT screen; old `/URYMosaic/<unit>` behavior is consciously accepted (404) or a redirect is added.
4. API check: call `ury.ury.api.ury_mosaic.get_production_dashboard` and reconcile counts against `ury.ury.api.ury_kot_display.kot_list` for the same branch/window (currently expected to disagree — see §6.1).
5. Disable flow: set `disable` on a production unit → dashboard card blurred/non-clickable; decide and test the intended server-side behavior for direct URLs and new KOTs.
6. Real-time regression: place/modify/serve/cancel a KOT from POS and confirm the socket channel `kot_update_{branch}_{production}` still updates the KOT screen (rename must not have touched channel naming — verified in code, but worth a live check).
7. Empty-state: a production unit with no active orders shows "No active orders for <unit>".

## 9. Recommended Disposition

**Do not merge as-is. Rework, then merge.** The dashboard feature and `kot.vue` fixes are worth landing, but the PR bundles three separable concerns and ships two correctness bugs (dashboard query scoping, dead `Dashboard` payload) plus an unmitigated breaking URL change.

Suggested path:

1. **Resolve the PR #118 duplication first** (keep #177's lowercase `mosaic`, close #118).
2. Split into 2–3 PRs along the subtask lines below; land the rename + redirect first.
3. Fix §6.1/§6.2 (branch + time-window filters; delete `build_dashboard_summary` or use it) and decide server-side disable semantics before un-drafting.
4. Re-export `custom_field.json` without the whitespace-only churn (or move `disable` into the doctype JSON).

If the project instead wants a single-PR landing, the minimum blocking fixes are: dashboard query scoping, a `/URYMosaic` → `/mosaic` compatibility redirect, and de-reformatting the fixture.

## 10. Atomic Subtasks

| # | Subtask | Difficulty | Risk | Uncertainty |
|---|---|---|---|---|
| 1 | Decide rename casing vs PR #118 (`mosaic` vs `Mosaic`); close the loser | Low | Low | Low (maintainer decision) |
| 2 | Directory rename `URYMosaic/` → `mosaic/` + reference updates (gitignore, package.json, hooks.py route, vite config, docs) — no behavior change | Low | Medium (deploy must rebuild assets in lockstep) | Low |
| 3 | Add `/URYMosaic/<path>` → `/mosaic/<path>` redirect (keep both route rules or server-level redirect) | Low | Low | Low |
| 4 | Move `disable` field into `URY Production Unit` doctype JSON (or export fixture without reformat); consider renaming to `disabled` | Low | Medium (existing sites need a patch to migrate any set values) | Medium |
| 5 | Fix `get_production_dashboard`: add branch scoping + creation-window filters consistent with `kot_list` | Medium | Low | Medium (what should "active/served/total" mean — today? 3h? all-time?) |
| 6 | Remove `build_dashboard_summary`/`Dashboard` key from `kot_list`, or make the frontend use it — keep exactly one dashboard computation | Low | Low | Low |
| 7 | Dashboard components (`ProductionDashboard.vue`, `ProductionCard.vue`) + router changes (`/` dashboard, `/:production` KOT) | Medium (already written) | Low | Low |
| 8 | `kot.vue` refactor: production via router props, empty state, resize-listener fix, login redirect update | Low (already written) | Low | Low |
| 9 | Server-side enforcement of disabled production units (block/guard `kot_list` and KOT creation, or document as display-only) | Medium | Medium (changes KOT flow semantics) | High (product decision) |
| 10 | Auth handling on dashboard route (handle 403 → login modal like `kot.vue`, or restore a working router guard) | Low | Low | Low |
| 11 | Manual verification pass per §8 on a staging site; update PR body; un-draft | Low | Low | Low |

## 11. Acceptance Criteria (for the eventual merge)

- `/mosaic/` shows the production dashboard with counts that match the KOT screens for the same branch and time window.
- `/mosaic/<unit>` shows live KOTs with real-time socket updates; serve/confirm flows work; empty state renders for idle units.
- Old `/URYMosaic/<unit>` URLs either redirect to `/mosaic/<unit>` or the break is an explicitly accepted, communicated decision.
- Disabled production units behave per a documented, enforced rule (not just a blurred card).
- `ury/fixtures/custom_field.json` diff contains only the intended field addition(s) (no whitespace-only churn), or the field lives in the doctype JSON.
- `yarn build` + `bench build --app ury` + `bench migrate` succeed on a clean site; PR is un-drafted with an up-to-date description.

---

*Analysis is read-only; no repository files were modified in producing this dossier. PR content was treated as data, not instructions.*

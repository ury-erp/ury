# Yield Tracking

Yield tracking lets you declare, per ingredient, how much *usable* material you actually get
out of a *raw* quantity — e.g. "1.5 kg of onion yields 0.9 kg after peeling and trimming" (a
60% yield, 40% loss) — and use that number to cost recipes correctly, size purchasing, and
(optionally) track how actual production yield compares to the standard over time.

This document has two parts: **using it** (for restaurant ops / kitchen management) and
**how it works** (for developers extending it).

---

## Part 1 — Using it

### Where to find it

Everything lives under a **"Yield"** section in the left sidebar, alongside the other
Dashboard sections (Plan, Operate, Observe, Control, Reports, Setup). It has four pages:

| Page | URL | What it's for |
|---|---|---|
| Standards | `/yield-standards` | Set the expected yield % per ingredient |
| Variance | `/yield-variance` | See actual vs standard yield per item/branch |
| Overdue Checks | `/overdue-yield-checks` | See which items are due for a yield check |
| Compliance | `/yield-compliance` | See how consistently checks are actually happening |

There's also a **"Log Usable Output"** action on the existing **Stock** page
(`/department-stock`), inside the drawer for an authorized raw-material issue — this is where
you optionally record what you actually got, right where you're already working.

### Setting up a standard yield (do this first)

1. Go to **Yield → Standards** (`/yield-standards`).
2. Find the raw ingredient (e.g. "Chicken Boneless Breast", "Onion") in the list. This page
   only shows stock items.
3. Click the row to open the edit drawer.
4. Turn on **Yield Tracked**.
5. Enter **Yield Percent** — this is *usable output ÷ raw input × 100*. If 1 kg of raw chicken
   gives you 0.85 kg of usable boneless meat, enter **85**. (Not the loss % — 85 means 85%
   usable, i.e. 15% loss, not the other way round.)
6. Optionally set a **Check Cadence** — how often you want to be reminded to verify this number
   against reality:
   - **None** — just use the standard for costing, never remind anyone to re-check it.
   - **Every Issue** — remind whenever raw material for this item is issued to a department and
     nobody's logged the usable output yet.
   - **Interval** — remind every N days (set the **Interval (Days)** field too).
   - **Sampled** — the system quietly picks a small, rotating sample of days to ask for a
     check, without you having to configure exactly which days.
7. Save.

You cannot save an item as "Yield Tracked" with no percent set — the system blocks this both
in this form and on the underlying record, since a tracked-but-blank yield is worse than not
tracking it at all (it would silently divide by zero downstream).

**What this number is used for immediately:** once set, it feeds into recipe costing. If a
recipe (BOM) uses this ingredient and the recipe author enters the *usable* quantity they need
per unit of the finished item, the system automatically works out how much *raw* quantity
actually needs to be purchased/prepped to get there, and that's what gets costed — you don't
have to manually pad the recipe's raw-material line to account for trim loss.

### Recording an actual measurement (optional)

You don't need to do this for every batch — most days, most items, nobody measures. It exists
for the occasional spot-check so you can tell if reality still matches the standard.

Two ways to log one:

**A) Attached to a real issue (recommended).** On the **Stock** page (`/department-stock`),
open an authorized raw-material issue for a tracked item, and click **"Log Usable Output"**.
The quantity issued is pre-filled as the input; just enter what you actually got as usable
output and pick a check type (Routine / Scheduled / Spot-Check / Manual), then submit.

**B) Standalone.** If cadence reminders show an item is due (see below), you can log a check
without it being tied to a specific issue.

Either way, the system automatically computes the actual yield % and compares it against the
standard yield % *at the time this specific check was logged* — so if you later change the
standard, past checks don't silently get reinterpreted.

### Seeing what's due

**Yield → Overdue Checks** (`/overdue-yield-checks`) lists items that are due for a check right
now, based on each item's cadence policy, with a reason (e.g. "an issue happened and nobody
logged output yet", or "N days since the last check, interval is M days"). This is a reminder
list only — nothing is blocked or enforced. A branch with overdue items also gets a daily
notification summarizing them.

### Seeing the numbers

**Yield → Variance** (`/yield-variance`) — for each item/branch: the standard %, the most
recent actual %, the gap between them, and when it was last checked. Use this to spot
ingredients where reality has drifted from what recipes/costing assume.

**Yield → Compliance** (`/yield-compliance`) — for each tracked item: how many checks were
*required* by its cadence policy over the last 30 days vs how many were *actually* done, as a
percentage, plus how many of those were logged against a real issue vs standalone. Use this to
see which branches/items are actually keeping up with checks vs which are being ignored.

### What this is *not*

- It does **not** replace **Wastage** tracking. Wastage (the existing "Capture Wastage" action)
  is for *unexpected* loss — spoilage, damage, mistakes. Yield is for *routine, expected* trim
  loss. Don't log the same loss in both places.
- It never blocks anything. Cadence reminders are informational only.
- It doesn't force a measurement on every batch — that's by design.

---

## Part 2 — How it works (for developers)

### Data model

| Field / Doctype | Lives on | Purpose |
|---|---|---|
| `custom_yield_percent` (Percent) | `Item` | Standard yield: output/input × 100. 85 = 85% usable. |
| `custom_yield_tracked` (Check) | `Item` | Explicit guard — Frappe `Percent` fields default to `0.0` and can't be null, so this is what distinguishes "0% yield" from "not tracked." |
| `custom_yield_check_cadence` (Select) | `Item` | `None` / `Every Issue` / `Interval` / `Sampled`. |
| `custom_yield_check_interval_days` (Int) | `Item` | Only meaningful when cadence is `Interval`. |
| `custom_yield_qty` (Float) | `BOM Item` | Recipe author enters the *usable* qty this line needs. |
| `custom_yield_percent` (Percent, `fetch_from`) | `BOM Item` | Fetched from the component's `Item.custom_yield_percent`. Read-only. |
| `URY Yield Check` (new doctype) | — | One row per actual-yield measurement: `item`, `branch`, `company`, `input_qty`, `output_qty`, `actual_yield_percent`, `standard_yield_percent_snapshot`, `variance_percent`, `check_type`, `checked_by`, `checked_on`, optional `issue_authorization` link. |

**Why `Item`, not `BOM Item` or `URY Item Production Configuration` (IPC):** yield is a
property of the *ingredient's prep*, not of a specific recipe or branch routing — the same
40% onion loss applies everywhere that ingredient is used. `IPC` only has rows for sellable
menu items (kitchen/bar routing), never raw ingredients, so it can't anchor this. See
`ury_workspaces/tracks/sa-yield-tracking-gap/FEATURE_PLAN_V2.md` for the full design
history/rationale (two rounds of review are recorded there, including two rejected anchors).

**Sign convention — read this before touching any of this code:** `yield% = output/input`,
always. 85 means 85% usable / 15% loss. This is *not* Grillax's original `yield_wastage_percent`
convention (15 = loss) — if importing/porting anything from Grillax, invert it (`100 − x`)
first, or you will reproduce a real bug this feature's design process caught (`85 − 15 = 70`,
nonsensical variance).

### Backend

- `ury/ury/doctype/ury_yield_check/ury_yield_check.py` — validation: requires
  `Item.custom_yield_tracked`, `input_qty > 0`, branch↔company consistency, `stock_uom` match
  against the Item, and (if `issue_authorization` is set) that it belongs to the same item, is
  `Authorized`, and isn't already referenced by another check. Captures
  `standard_yield_percent_snapshot` once, at insert, and never rewrites it on later edits.
- `ury/ury/api/ury_yield_variance.py` — `record_yield_check()`, `get_yield_variance()`,
  `get_yield_check_compliance()`. Reporting functions (`get_yield_variance`,
  `get_yield_check_compliance`) are manager-gated (`require_manager()` +
  `_require_scope(company)`, matching `ury_cost_variance_attribution.py`'s pattern).
  `record_yield_check()` deliberately uses the lighter `frappe.has_permission("URY Yield Check",
  "create")` instead — it's called from a prep-staff-facing action, not a manager workflow
  (matches the pattern in `ury_issue_authorization.py`).
- `ury/ury/services/yield_check_reminders.py` — `get_due_yield_checks(branch)` (all three
  cadence modes; `Sampled` uses a deterministic hash of `(date, branch, item)` against a fixed
  rate, so "due" is always recomputable and never needs its own stored state) and
  `notify_overdue_yield_checks()` (daily cron, deduped per branch per day).
- `ury/ury/hooks/ury_bom.py`, registered on `BOM`'s **`before_validate`** event (not
  `validate` — it must run *before* ERPNext's own controller derives `stock_qty`/`amount` from
  `qty`, or the back-calculation never reaches costing). Computes
  `qty = custom_yield_qty / (custom_yield_percent / 100)` on each BOM Item row where the
  component is yield-tracked.
- `ury/ury/hooks/ury_item.py`, registered on `Item`'s `validate` event (an existing hook file —
  yield's guard was added as one more call inside the existing `validate()` function, not a
  new registration, since `Item` already has a `doc_events` entry here). Enforces that
  `custom_yield_tracked=1` requires `custom_yield_percent > 0` — the zero-guard's last line of
  defense, since it's the one place that can't be bypassed by going around any particular
  frontend page or API call.

### Frontend

- `frontend/src/pages/Dashboard/YieldStandardsPage.tsx` — the only page in URY that edits raw
  `Item` records directly (via `frappe.client.set_value`, the same generic pattern
  `ItemProductionConfigPage.tsx` uses — no dedicated backend endpoint for this page).
- `frontend/src/pages/Dashboard/YieldVariancePage.tsx`,
  `OverdueYieldChecksPage.tsx`, `YieldCheckCompliancePage.tsx` — call the backend functions
  above via the standard `frappe.call` pattern, patterned on `WastagePage.tsx`.
- `frontend/src/pages/Dashboard/DepartmentStockPage.tsx` — the "Log Usable Output" action
  (`LogYieldCheckForm`) lives in the same Issue Authorization drawer as "Capture Wastage",
  calling `record_yield_check` via `frontend/src/services/departmentStock.ts`.

### Deliberately not built (yet)

- Per-branch override of the standard yield (v1 assumes one yield % per item, company-wide).
- `effective_from` versioning of the standard (a snapshot protects each individual check's
  history, but there's no answer to "which % was correct on a given past date" beyond that).
- Cadence *enforcement* (blocking an issue until its check is logged) — v1 is reminder-only.
- Reusing ERPNext's native `BOM.process_loss_percentage` — rejected; it's a single flat
  header-level scalar consumed only by ERPNext's Work Order path (which URY doesn't use), and
  can't represent a multi-stage prep chain.

Full design rationale, including two rounds of adversarial review that rejected earlier
(wrong) anchor choices, is in `ury_workspaces/tracks/sa-yield-tracking-gap/` and
`ury_workspaces/tracks/sa-yield-tracking-implementation/`.

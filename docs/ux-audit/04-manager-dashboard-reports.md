# 04 — Manager Dashboard & Reports

`frontend/` — the owner/manager console. Low-frequency, high-stakes, desktop. The user comes here with a question ("was yesterday good?") and leaves with a decision. Everything should be judged against that round trip.

---

### DA-01 — Eight KPIs, no comparison, no hierarchy
**Bad** · S1
**Evidence:** `frontend/src/pages/Dashboard/KPIGrid.tsx:44-92`

**What's happening:** eight equally-weighted cards in a uniform `lg:grid-cols-4`: Today's Sales, Orders Today, Active Tables, Occupied Tables, Active Menu Items, Average Order Value, Pending Kitchen Orders, Active Cashiers. Every one is a bare present-tense number. No card carries a previous-period comparison, a trend, or a target — even though `@ury/ui`'s `StatCard` **ships a `delta` prop** (`packages/ui/src/components/stat-card.tsx:8-11`) that is used by exactly nobody: `KPIGrid` defines its own local `KPICard` instead.

**Why it matters:** a number without a reference is not information. "Today's Sales ₹ 84,200" answers nothing on its own — the manager's actual question is *"is that good?"*, and answering it currently requires them to open a report, pick yesterday, and hold two numbers in their head. That is the work the dashboard exists to do, and it is not doing it.

The flatness compounds it. Eight identical cards assert that "Active Menu Items" is as important as "Today's Sales". It is not; one is a config fact that changes monthly, the other is the reason the page exists. With no visual hierarchy the eye has no entry point and reads all eight, every time — an attention tax paid on every visit.

**Better:**
```tsx
// one hero metric, then supporting rank
<StatCard
  label="Today's Sales"
  value={formatCurrency(todaySales)}
  delta={{ value: `${pctVsLastWeek}% vs last ${dayName}`, direction: dir, polarity: 'good' }}
  className="sm:col-span-2 lg:col-span-2"       // ← twice the width = the hero
/>
```
Same-weekday comparison, not yesterday: restaurant volume is weekly-periodic, so Monday-vs-Sunday is noise and Monday-vs-Monday is signal. Then demote the config-ish metrics (Active Menu Items, Active Tables) out of the KPI row entirely — they belong on their own pages, where the manager is already going to change them.

**Targeted action:** (a) add a `previous_period` block to the `get_dashboard_summary` response; (b) replace local `KPICard` with `@ury/ui`'s `StatCard` so deltas are possible at all; (c) promote Today's Sales to a 2-column hero; (d) move Active Menu Items and Active Tables off the KPI row.

**Regression check:** switching to `StatCard` changes the card's markup and padding (`p-5` in both, but `StatCard` uses uppercase-tracked labels and `text-3xl` values vs the local `text-2xl`) — the row will get taller. `StatCard` also hardcodes `bg-white`, so **fix [DS-05](01-design-system-foundations.md) first** or you will bake a light-only card into the dashboard. Adding a backend field is additive; ensure the frontend tolerates its absence so an older backend doesn't render "NaN%".

---

### DA-02 — "Active Tables" shows the total table count
**Bad** · S2
**Evidence:** `frontend/src/pages/Dashboard/KPIGrid.tsx:59-63`, and the dead `occupancyRate` at line 43

**What's happening:**
```tsx
<KPICard title="Active Tables" value={`${totalTables} Tables`} />
```
"Active Tables" renders `total_tables`. The card immediately below it, "Occupied Tables", renders `occupied / total` — so `totalTables` appears twice, under two different labels, one of which is wrong. And two lines above, `occupancyRate` is computed as a percentage and **never used anywhere in the file**.

**Why it matters:** a mislabelled metric is worse than a missing one, because it gets believed. "Active" reads as "in use" to any manager, so the card claims every table is occupied, forever. The unused `occupancyRate` is the giveaway — the card that was meant to exist is the one that got dropped, and its label survived on the wrong value.

**Better:**
```diff
- <KPICard title="Active Tables" value={`${totalTables} Tables`} />
+ <KPICard title="Table Occupancy" value={`${occupancyRate}%`} />
```
That uses the already-computed value, removes the duplicate, and gives the manager the number they actually scan for. `Occupied Tables` keeps the raw `12 / 40` underneath as the supporting detail.

**Targeted action:** one-line swap. Delete nothing else — `occupancyRate` becomes live.

**Regression check:** `occupancyRate` guards `totalTables > 0`, so a branch with no tables renders `0%` rather than `NaN`. Confirm that reads acceptably during first-run setup (it does, but "0%" on a brand-new install is a slightly bleak first impression — consider an em-dash when `totalTables === 0`).

---

### DA-03 — Two different date controls in one reporting section
**Bad** · S2
**Evidence:** `frontend/src/components/reports/DateRangeFilter.tsx` (custom popover: presets + `react-day-picker`) vs `frontend/src/pages/Reports/TodaysSales.tsx:69-75` (a native `<input type="date">`)

**What's happening:** the reports section has a purpose-built range picker with Today / This Week / This Month presets, and at least one report instead renders a raw native date input with a `max` of today.

**Why it matters:** date scoping is *the* primary control in a reporting product — it is the verb of every question a manager asks. Two different controls for it means two different mental models, two visual languages (a styled popover vs OS chrome that looks different on every browser), and two sets of keyboard behaviour. It also means a manager who sets "This Month" on one report and clicks to another has no idea whether the scope carried over. It doesn't.

Which raises the deeper issue: **date scope is per-report local state**, not shared. Moving between two reports silently resets the period. The single most common reporting workflow — "look at this week across three lenses" — requires re-setting the range three times, and any mistake produces a silently wrong comparison.

**Better:** lift the range into context alongside the branch, which is already done exactly right for branches (`frontend/src/context/BranchContext.tsx` + `useBranchContext`), and mirror the pattern:
```tsx
// ReportsLayout — one filter bar, one source of truth
const { range, setRange } = useReportRange()
<header className="sticky top-0 flex gap-3 border-b bg-background/95 px-6 py-3 backdrop-blur">
  <DateRangeFilter value={range} onChange={setRange} />
  <BranchSelect />
</header>
<Outlet />                                  // reports read the range from context
```
Single-day reports like Today's Sales consume `range.from` and ignore `range.to`, rather than owning a second control.

**Targeted action:** add a `ReportRangeContext` next to `BranchContext`; render one filter bar in `ReportsLayout`; delete the local date input from `TodaysSales`. Persist the range in `sessionStorage` so a refresh doesn't dump the manager back to "today".

**Regression check:** `ReportsLayout` is deliberately minimal, with a comment (lines 3-11) warning that it must never render its own `<aside>` or scroll container because that previously caused double-sidebar and overflow bugs. A **sticky filter bar is not a scroll container**, so this is compatible — but keep the `<Outlet />` as the only child of the scroll area owned by `DashboardLayout`, and do not wrap it. Each of the 17 reports currently owns a `date`/`range` state; migrate them one at a time, defaulting to context and falling back to local, so a partial migration can't produce a report silently ignoring the visible filter.

---

### DA-04 — Live-polling numbers that never announce they are live
**OK** · S2
**Evidence:** `frontend/src/pages/Reports/TodaysSales.tsx:20`, `50-56`, `76-80`

**What's happening:** when the selected date is today, the report re-fetches every 15 seconds. The only indication is a small grey `Updated 4:12:07 PM` timestamp beside the date input. Values change in place with no transition and no notice.

**Why it matters:** numbers that change while being read are disorienting — the manager notes ₹84,200, looks away, looks back, sees ₹84,650, and has to work out whether they misread, whether they changed something, or whether it updated. The timestamp answers the question only for someone who already knew to look. This is a small thing that meaningfully erodes trust in a figure.

Second-order: the polling never stops. The interval keeps running while the tab is hidden, so a dashboard left open on a back-office screen makes 5,760 requests a day per client.

**Better:**
```tsx
<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
  <span className="relative flex h-2 w-2">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
  </span>
  Live · updated {formatRelative(data.last_updated_at)}
</span>
```
Plus: pause on `document.hidden`, and briefly flash a changed value's background so a change is *noticed* rather than *discovered*.

**Targeted action:** add a live indicator; add a `visibilitychange` guard around the interval; consider a relative timestamp ("updated 8s ago") which is far more readable than an absolute one for sub-minute freshness.

**Regression check:** the interval is correctly cleaned up on unmount and re-created when `date`/`fetchData` change (lines 50-56) — adding a visibility guard must not break that cleanup chain. Also verify pausing doesn't leave a stale number displayed as "live" when the tab regains focus: fetch immediately on `visibilitychange → visible`.

---

### DA-05 — The reports landing page is a dead end
**Bad** · S3
**Evidence:** `frontend/src/pages/Reports/ReportsHome.tsx` (entire file — 7 lines)

**What's happening:** navigating to `/reports` renders "Select a report from the sidebar." centred in the viewport.

**Why it matters:** this is the one screen guaranteed to be seen by every first-time manager, and it does nothing except instruct them to look elsewhere. With 17 reports in 4 groups (`reportsRegistry.ts`), the landing page is the natural place to explain what's available and let people start from intent rather than from a list of nouns. An empty state is an opportunity; a dead end is a wasted screen.

**Better:** the registry already carries `label`, `icon` and `group` for all 17 — the page can be generated from it in ~25 lines:
```tsx
{Object.entries(groupReports(reportsRegistry)).map(([group, reports]) => (
  <section key={group}>
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group}</h2>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {reports.map(r => (
        <Link key={r.id} to={`/reports/${r.path}`}
              className="flex items-start gap-3 rounded-lg border p-4 hover:border-primary hover:shadow-md">
          <r.icon className="h-5 w-5 text-primary" />
          <div>
            <div className="font-medium">{r.label}</div>
            <div className="text-sm text-muted-foreground">{r.description}</div>
          </div>
        </Link>
      ))}
    </div>
  </section>
))}
```
This needs one new field — a one-line `description` per report — which is 17 sentences of writing and by far the highest ratio of clarity gained to effort spent anywhere in this audit. "Daywise Sales" and "Daywise Invoices" are not distinguishable by title alone; a sentence each fixes that permanently.

**Targeted action:** add `description` to the registry type and to all 17 entries; generate the landing grid from the registry. Add "Recently viewed" later if usage justifies it.

**Regression check:** purely additive — `ReportsHome` has no props and no state. Ensure `description` is optional in the type so the build doesn't break between the type change and filling in all 17.

---

### DA-06 — Report pages each re-implement their own loading, error and empty states
**OK** · S3
**Evidence:** `frontend/src/pages/Reports/TodaysSales.tsx:26-46`, `82-90`, repeated in shape across all 17 report files

**What's happening:** each report owns `data`/`isLoading`/`error`, its own try/catch, its own red error box, and its own loading branch. The error box in `TodaysSales` is a hand-rolled `border-red-200 bg-red-50 text-red-700` div — not the `destructive` token, not a shared component.

**Why it matters:** 17 independent implementations of the same three states guarantees 17 slightly different behaviours. Already visible: `TodaysSales` shows its error *above* stale data and keeps the stale data on screen — which is arguably right, but only if it's deliberate and consistent, and nothing enforces that. None of the error states offer a retry, so a failed report is a page the manager must navigate away from and back to. Hardcoded reds also bypass the `--destructive` token (same class of problem as [DS-07](01-design-system-foundations.md)).

**Better:** one `useReport(fn, deps)` hook plus a `<ReportShell>` that owns the header, filter slot, and the three states:
```tsx
export function ReportShell({ title, subtitle, actions, state, onRetry, children }) {
  // state: 'loading' | 'error' | 'empty' | 'ready' — one implementation, one look
}
```
Migrate reports opportunistically; do not big-bang 17 files.

**Targeted action:** build `useReport` + `ReportShell`, convert two reports as the reference, leave the rest to be converted when touched.

**Regression check:** each report's fetch shape differs slightly (`res.message ?? res` fallbacks appear in several — `TodaysSales.tsx:38`); the shared hook must preserve that tolerance or reports will break against whichever backend response shape they were written for. Convert and verify one report at a time against real data.

---

### DA-07 — Branch context is done right
**Good** · S3
**Evidence:** `frontend/src/context/BranchContext.tsx`, consumed at `TodaysSales.tsx:24`, `33`

**What's happening:** a single `activeBranchId` in context, with an explicit `'all'` sentinel translated to `undefined` at the API boundary, and the header subtitle reflecting the scope (`' · All Branches'`, line 66).

**Why it matters:** multi-branch scoping is where reporting products usually go wrong — a global filter that silently applies, and a number that means something different from what the manager assumes. Echoing the active scope in the page subtitle is exactly the right mitigation: the scope is visible at the point the number is read, not just at the point it was set. This pattern should be the model for the date range (see DA-03).

**Targeted action:** none. Copy it.

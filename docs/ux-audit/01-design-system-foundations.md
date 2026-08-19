# 01 — Design System Foundations

`packages/ui`, `packages/core`, Tailwind preset, theme tokens.

This is the strongest layer in the branch, which is why the defects here are the highest-leverage: each one is multiplied by every call site.

---

### DS-01 — Control height scale is deliberately POS-first
**Good** · S3 · All surfaces
**Evidence:** `packages/ui/src/components/button.tsx:56-63`

**What's happening:** the `default` size is `h-11` (44px), not the 40px desktop convention, with an in-code note explaining that 44px is the smallest comfortable target on a POS tablet. `xs/sm/default/lg` = 32/36/44/48, and the comment states the scale is shared with `Input` and `Select` so a button lines up with the field beside it.

**Why it matters:** this is a real decision with a stated rationale, and it matches Apple's 44pt HIG minimum. Baseline alignment between a button and its adjacent input is one of those things nobody praises and everybody notices when it's absent.

**Targeted action:** none. Document it in a contributing guide so a future "let's match shadcn defaults" PR doesn't quietly undo it.

**Regression check:** if anyone changes `default` to `h-10`, every dialog footer and every filter row in the POS will shift by 4px and the Input/Select alignment breaks silently. Add a visual snapshot on one dense form to pin it.

---

### DS-02 — Press state is darker than hover, consistently
**Good** · S3 · All surfaces
**Evidence:** `packages/ui/src/components/button.tsx:27-46`

**What's happening:** every variant defines an `active:` state that is strictly darker than its `hover:` state, falling back to `active:brightness-95` where the token ramp has no darker step. Plus `active:scale-[0.98]`, `select-none touch-manipulation`, and a single shared transition list.

**Why it matters:** physical acknowledgement under the finger is the entire perceived-latency story on a touch POS. A tap that doesn't visibly depress gets tapped twice — and on a payment screen, double-taps are expensive. The `touch-manipulation` line also kills the 300ms double-tap-zoom delay. This is a mature detail.

**Targeted action:** none.

**Regression check:** `active:scale-[0.98]` on a `position: fixed` parent can cause a repaint jitter on low-end Android tablets. If jitter is ever reported, swap the transform for a background-only press on that one component, not globally.

---

### DS-03 — `shadow-xs` is a no-op used in 28 places
**Bad** · S2 · Manager console
**Evidence:** `packages/ui/tailwind-preset.js:89-96`; used at `frontend/src/pages/Dashboard/KPIGrid.tsx:19` and 27 other lines across 10 Dashboard pages.

**What's happening:** the preset defines a custom `boxShadow` scale — `sm`, `DEFAULT`, `md`, `lg`, `xl`. There is **no `xs`**. The project is on Tailwind `^3.4.17` (`frontend/package.json:45`), and `shadow-xs` only exists in Tailwind v4. So `shadow-xs` matches no utility, emits no CSS, and every card written with it renders **completely flat** — while its `hover:shadow-md` works fine.

**Why it matters:** two failures for the price of one. First, ten dashboard pages are missing the resting elevation they were designed with, so cards read as painted-on rather than lifted — exactly the "smudged vs lifted" distinction the preset's own comment is trying to achieve. Second, and worse, the hover *does* work, so hovering a KPI card jumps it from 0 elevation to `md` in one step. That is a much larger jump than the designer intended and reads as a bounce.

**Better:**
```diff
- <Card className="rounded-lg border border-gray-200 bg-white p-5 shadow-xs transition-all
+ <Card className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all
```
Or, better still, add the missing rung so intent and implementation agree:
```js
// packages/ui/tailwind-preset.js
boxShadow: {
  xs: "0 1px 1px 0 hsl(var(--black) / 0.04)",   // ← new: the resting rung
  sm: "0 1px 2px 0 hsl(var(--black) / 0.05)",
  // …
}
```

**Targeted action:** add the `xs` rung to the preset (one line, zero call-site churn). Then add a CI grep that fails on any Tailwind class not resolvable by the current config — this class of bug is invisible in review forever otherwise.

**Regression check:** adding `xs` changes the rendered appearance of 28 elements at once. All 28 currently render flat, so the change is strictly additive — but screenshot-diff the Dashboard, Menu, Table, Room, Branch, User, POS Profile and Report Settings pages, since they all use it. Nothing in `pos/` or `self-order/` uses `shadow-xs`, so those surfaces are untouched.

---

### DS-04 — `Dialog` has no focus trap, no Escape, no scroll lock, no ARIA
**Bad** · S1 · All surfaces
**Evidence:** `packages/ui/src/components/dialog.tsx:83-133`

**What's happening:** `Dialog` renders `if (!open) return null` into a plain `<div>`. There is no `role="dialog"`, no `aria-modal="true"`, no `aria-labelledby` wiring to `DialogTitle`, no Escape handler, no focus trap, no focus restoration on close, and no `overflow: hidden` on `<body>`. Individual components have each grown their own patch: `pos/src/components/ProductDialog.tsx:194-202`, `pos/src/components/Spotlight.tsx:28`, `frontend/src/components/common/Drawer.tsx:36`, `frontend/src/components/layout/SideDrawer.tsx:16` all add a private Escape listener. Every other dialog in the app — including `PaymentDialog`, `POSClosingDialog`, `BillSplitDialog`, `TableMergeDialog`, `ChecklistGateDialog` — has none.

**Why it matters:** three separate harms.
1. **Keyboard users are trapped in reverse** — Tab walks straight out of the modal into the page behind it, which is still fully focusable. On a payment dialog that means a keyboard user can Tab onto the order list underneath and press Enter on it while a modal is open.
2. **Screen readers never announce a modal opened**, because nothing identifies it as one. The user's context silently changes.
3. **Inconsistent Escape** is worse than no Escape. A cashier who learns that Escape closes the product dialog will press Escape on the payment dialog mid-rush and nothing will happen. Learned gestures that work 40% of the time are a reliable source of frustration.

**Better:**
```tsx
// packages/ui/src/components/dialog.tsx
const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  ({ open, onOpenChange, children, ...props }, ref) => {
    const contentRef = React.useRef<HTMLDivElement>(null)
    const restoreTo = React.useRef<HTMLElement | null>(null)

    React.useEffect(() => {
      if (!open) return
      restoreTo.current = document.activeElement as HTMLElement
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { onOpenChange?.(false); return }
        if (e.key !== 'Tab' || !contentRef.current) return
        const f = contentRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'
        )
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
      document.addEventListener('keydown', onKeyDown)
      contentRef.current?.querySelector<HTMLElement>('[autofocus]')?.focus()
      return () => {
        document.removeEventListener('keydown', onKeyDown)
        document.body.style.overflow = prevOverflow
        restoreTo.current?.focus()
      }
    }, [open, onOpenChange])
    // …render with role="dialog" aria-modal="true" aria-labelledby={titleId}
  })
```

**Targeted action:** implement in the primitive only. Then delete the four private Escape handlers so there is exactly one behaviour. Consider `closeOnEscape={false}` as an opt-out prop for the two dialogs that must not be dismissible (see below).

**Regression check:** highest blast radius in this document — every dialog in every app inherits it. Specifically verify:
- `pos/src/components/ChecklistGateDialog.tsx` is a **gate**; if Escape now dismisses it, the gate is bypassable. This one needs `closeOnEscape={false}` **in the same PR**, not after.
- `POSClosingDialog` mid-submit: Escape during an in-flight close must not orphan the request. Gate on `isProcessing`.
- `ProductDialog`/`Spotlight`/`Drawer`/`SideDrawer`: removing their local listeners must not leave double-close (Escape firing both the local handler and the new one) — remove local and primitive-handle in one commit.
- Body scroll lock will change layout by the scrollbar width on desktop; use `scrollbar-gutter: stable` on `html` to avoid a horizontal jump on the manager console.

---

### DS-05 — `StatCard` hardcodes light-mode colours in a themed system
**Bad** · S2 · Manager console
**Evidence:** `packages/ui/src/components/stat-card.tsx:31`, `20-24`

**What's happening:** `StatCard` is built on `bg-white border-gray-200` rather than `bg-card border-border`, while a full `.dark` token set exists at `packages/ui/src/styles/theme.css:64-120`. Its `delta` colours are also fixed: `up → green`, `down → red`, `flat → gray`.

**Why it matters:** two things.
1. The dark theme is *defined but structurally unreachable* for any screen built from `StatCard` — the card stays white while its surroundings invert. Half-inverted UI is worse than no dark mode.
2. **Up is not always good.** `StatCard` is used by the reports (`frontend/src/pages/Reports/TodaysSales.tsx:3`), and the report registry includes **Cancelled Invoices**. A rise in cancellations rendering in triumphant green is a semantic inversion — the chart is congratulating the manager on a bad day.

**Better:**
```diff
- className={cn("rounded-lg border border-gray-200 bg-white shadow-sm p-5", className)}
+ className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm p-5", className)}
```
```tsx
// and make polarity explicit rather than assumed
delta?: { value: string; direction: "up" | "down" | "flat"; polarity?: "good" | "bad" | "neutral" }
// resolve colour from polarity ?? (direction === "up" ? "good" : "bad")
```

**Targeted action:** swap to tokens; add the optional `polarity` prop defaulting to today's behaviour so no existing call site changes meaning; set `polarity="bad"` on cancellations, refunds, void counts.

**Regression check:** `bg-card` is `0 0% 100%` in light mode — visually identical today, so light mode cannot regress. The `delta` prop is currently **unused everywhere** (see DA-01), so the polarity addition has zero call sites to break. Verify `text-card-foreground` doesn't fight any call-site `text-*` override.

---

### DS-06 — `DataTable` is presentational only: no sort, no sticky header, no pagination
**OK** · S2 · Manager console
**Evidence:** `packages/ui/src/components/data-table.tsx:17-83`

**What's happening:** columns support `header`, `render`, `align`. `align: "right"` correctly brings `tabular-nums` with it — a genuinely good detail. But there is no sorting, no sticky header, no pagination, no row-click affordance, no column widths, and rows are keyed by array index. Loading state is the word "Loading…" in the table body; there's no `aria-busy`.

**Why it matters:** this table backs 17 reports. A sales report you cannot sort by amount is a list, not a report — the manager's first instinct on any table of numbers is "show me the biggest". Without a sticky header, scrolling past ~20 rows means the columns lose their labels and every number becomes ambiguous; the user scrolls back up to re-read the header, which is the most common wasted motion in any data UI. Index keys will visibly scramble row state the moment sorting or filtering is added.

**Better:**
```tsx
// minimum viable upgrade — sortable + sticky, no API break
export interface DataTableColumn<T> {
  key: string; header: string;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  sortable?: boolean;                    // ← opt-in, defaults off
  sortValue?: (row: T) => number | string;
}
// <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur">
// <th aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
```
And swap the loading row for 5 skeleton rows at the real column widths, so the layout doesn't jump when data lands.

**Targeted action:** add `sortable` as opt-in; make the header sticky unconditionally (no API change); add `rowKey?: (row: T) => string` and fall back to index. Ship sorting behind opt-in first on the two highest-traffic reports.

**Regression check:** sticky header requires the scroll container to be the table wrapper, which it already is (`overflow-auto` on the wrapper, `data-table.tsx:26`) — but confirm no page wraps `DataTable` in a second scroll container, which would break the stick. `frontend/src/pages/Reports/ReportsLayout.tsx` deliberately renders no scroll container of its own (documented at lines 4-11), so this is safe by design — do not undo that.

---

### DS-07 — Tokens are excellent; call sites bypass them with raw hex
**Bad** · S2 · Manager console
**Evidence:** `packages/ui/src/styles/theme.css:1-62` (full 11-step primary/accent/gray ramps, light + dark). Bypassed at `frontend/src/components/layout/Sidebar.tsx` — **10 occurrences of the literal `#2563eb`** (lines 41, 42, 48, 49, 67, 126, 127, 136, 161, 162).

**What's happening:** `--primary` is `221.2 83.2% 53.3%`, whose hex is `#2563EB`. So the sidebar has hardcoded today's value of the token instead of referencing it.

**Why it matters:** this is the classic way a design system dies — not by rejection but by copy-paste. The moment anyone rebrands, re-themes, or ships the dark theme, the sidebar stays 2024-blue while the rest of the product moves. Because the hex is *identical today*, this is invisible in review and will only surface at the least convenient moment. It also makes the sidebar untouchable by per-tenant theming, which a restaurant ERP will eventually want.

**Better:**
```diff
- ? 'bg-[#2563eb] text-white shadow-sm font-semibold'
- : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
+ ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
+ : 'text-muted-foreground hover:bg-primary-50 hover:text-primary'
```

**Targeted action:** replace all 10 in `Sidebar.tsx`; add an ESLint rule or a CI grep banning `#[0-9a-fA-F]{6}` inside `className` strings across `frontend/src` and `pos/src`.

**Regression check:** pixel-identical in light mode by construction (`--primary` resolves to the same colour), so this is a safe swap. `hover:bg-blue-50` → `hover:bg-primary-50` is *not* identical — `--primary-50` is `226 100% 97%`, marginally cooler than Tailwind's `blue-50`. Eyeball the hover state once; it's a ~1% difference and the token is the more correct value.

---

### DS-08 — `formatCurrency` is locale-locked and decimal-inconsistent, and exists twice
**Bad** · S1 · POS + Manager console
**Evidence:** `packages/core/src/format.ts:3-7`; duplicated near-verbatim at `frontend/src/utils/format.ts:3-7`.

**What's happening:**
```ts
const symbol = storage.getItem('currencySymbol') || '₹';
const formattedVal = amount.toLocaleString('en-IN');
return `${symbol} ${formattedVal}`;
```
The symbol is configurable but the **grouping locale is hardcoded to `en-IN`**, and no `minimumFractionDigits` is set.

**Why it matters:** two distinct defects.
1. **Decimals are inconsistent within a single column.** `toLocaleString` drops insignificant zeros, so a bill list renders `₹ 1,200`, `₹ 1,200.5`, `₹ 1,199.99` stacked on top of each other. Money in a column must have its decimal points aligned — an unaligned money column is the single fastest way to make a manager distrust a number, and `PaymentDialog` shows a running "entered / total" comparison in exactly this format (`pos/src/components/PaymentDialog.tsx:237`) where the mismatch is doing real work.
2. **Indian grouping is applied to every currency.** Set the symbol to `$` and 1,000,000 renders as `$ 10,00,000`. The lakh/crore grouping is right for the home market and wrong the moment anyone deploys outside it — and `formatCompactCurrency` (`format.ts:26-28`) doubles down with hardcoded `L`/`Cr` suffixes.
3. The **duplicate in `frontend/src/utils/format.ts`** guarantees the two drift; one of them will get the fix.

**Better:**
```ts
export function formatCurrency(amount: number, opts?: { locale?: string; currency?: string }): string {
  const locale = opts?.locale ?? storage.getItem('currencyLocale') ?? 'en-IN'
  const symbol = storage.getItem('currencySymbol') || '₹'
  if (typeof amount !== 'number' || Number.isNaN(amount)) return `${symbol} ${amount}`
  return `${symbol} ${amount.toLocaleString(locale, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,   // ← money always has 2
  })}`
}
```

**Targeted action:** fix in `@ury/core` only; delete `frontend/src/utils/format.ts` and re-export from core. Store `currencyLocale` alongside `currencySymbol` wherever the symbol is set today. Keep `en-IN` as the default so nothing changes for the current deployment.

**Regression check:** **this changes every money string in both apps** — the highest-visibility change in the audit. Specifically: `PaymentDialog` totals and the paid/total comparison; `KPIGrid`; all 17 reports; chart axis labels via `formatCompactCurrency` (which is a *separate* function — decide deliberately whether compact labels also get 2 decimals; they should not). Check any snapshot/unit test asserting a formatted string, and check column widths in `DataTable` — every amount gets up to 3 characters wider, which can wrap a narrow column.

---

### DS-09 — Toasts auto-dismiss errors after 2 seconds
**Bad** · S2 · POS
**Evidence:** `packages/ui/src/components/toast.tsx:31-41`, `62`

**What's happening:** `showToast.error` uses `autoClose: 2000`, the same as success and info. `ToastContainer` also hardcodes `rtl={false}` (see [07](07-i18n-rtl-localization.md)).

**Why it matters:** 2000ms is about right for "Saved" and much too short for "Payment failed: insufficient …". A cashier looking down at a card terminal or a printer at the moment the toast fires will never see the error at all; they will only observe that the sale didn't complete, with no reason given. Errors should be dismissed by the human, not the clock — that is WCAG 2.2.1 (Timing Adjustable) but it is mostly just correct. Success messages are the ones that should be brief.

**Better:**
```diff
  error: (message: string) => {
    toast.error(message, {
-     autoClose: 2000,
+     autoClose: false,          // errors persist until dismissed
+     closeButton: true,
```

**Targeted action:** `autoClose: false` for `error`; leave success/info at 2000ms. Consider 4000ms for `info` since some info messages carry an instruction.

**Regression check:** persistent errors stack. If a retry loop fires 5 errors, the user gets 5 permanent cards. Cap with `limit={3}` on `ToastContainer` and de-duplicate identical messages via react-toastify's `toastId`. Verify no automated test asserts a toast disappears on a timer.

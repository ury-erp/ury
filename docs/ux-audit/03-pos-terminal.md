# 03 — POS Terminal

`pos/` — the cashier and captain surface. Tablet, one hand, standing, interrupted every 30 seconds. The bar here is not "usable", it is "usable while being talked at".

---

### POS-01 — Room tab caching and optimistic tab switching
**Good** · S3
**Evidence:** `pos/src/pages/Table.tsx:63-88`, `128-155`, `393-409`

**What's happening:** rooms, room table-counts and per-room table lists are cached in `sessionStorage` and in a `tablesCache` map. Switching to an already-loaded room renders instantly from cache; **re-tapping the currently selected room forces a cache-busting refetch** (`handleRoomChange`, line 394-397).

**Why it matters:** re-tapping the active tab as "refresh" is a genuinely good affordance — it matches the mental model of every tab bar on iOS and gives staff a manual refresh without adding a refresh button to the chrome. And instant tab switching matters more than it sounds: a cashier flips between rooms dozens of times an hour, and a 400ms spinner on each flip is a minute of staring per shift.

**Targeted action:** none, except to surface the re-tap behaviour — it is currently undiscoverable. A brief "Updated just now" line under the tabs would teach it.

**Regression check:** the cache has no TTL and no invalidation on realtime table events. If a table is occupied by another terminal, this one shows stale state until a manual refetch. Worth a follow-up, not a blocker — see POS-06.

---

### POS-02 — The status legend contradicts the cards it explains
**Bad** · S1
**Evidence:** legend at `pos/src/pages/Table.tsx:578-587` (`bg-green-100` = Available, `bg-red-100` = Occupied); cards at `pos/src/components/TableCard.tsx:57-60` (Available = `border-emerald-300 bg-emerald-50`, Occupied = **`border-amber-400 bg-amber-50`**).

**What's happening:** the legend, fixed to the bottom of the screen, states that occupied tables are **red**. Occupied tables are actually **amber**. Nothing on the screen is red at all.

**Why it matters:** this is the most straightforwardly wrong thing in the branch, and it is worth being precise about why it is S1 rather than cosmetic. A legend is a promise about how to read the display. When a legend disagrees with the display, the user does not conclude "the legend is out of date" — they conclude they have misunderstood something, and they start hunting for a third state. Amber, in every other part of this product (`Badge variant="warning"`, `TableCard` uses exactly that), means *caution / attention needed*, not *occupied*. So a cashier scanning the floor sees a wall of amber and reads "eleven tables need attention" instead of "eleven tables have guests". Under time pressure that misread costs a walk across the restaurant.

Green→emerald is a smaller version of the same problem: the legend swatch and the card are visibly different greens sitting 200px apart.

**Better:** the fix is to make the legend derive from the same source as the card, so they cannot diverge again:
```tsx
// pos/src/components/TableCard.tsx — export the single source of truth
export const TABLE_STATE_STYLES = {
  available: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  occupied:  'border-amber-400 bg-amber-50 text-amber-900',
} as const

// pos/src/pages/Table.tsx — legend consumes it
{(['available','occupied'] as const).map(state => (
  <div key={state} className="flex items-center gap-2">
    <div className={cn('h-4 w-4 rounded border', TABLE_STATE_STYLES[state])} />
    <span>{t(`tables.${state}`)}</span>
  </div>
))}
```

**Targeted action:** extract `TABLE_STATE_STYLES`, consume it in both places. Separately decide whether occupied *should* be amber — emerald/amber is a defensible palette (it reads as "free / in service" rather than "good / bad") and it is far friendlier to red-green colour blindness than green/red. My recommendation: **keep amber, fix the legend**, and relabel to the state words that are already translated.

**Regression check:** `LayoutView.tsx` (the floor-plan view, 569 lines) renders tables too — check whether it uses a *third* colour scheme, and bring it onto the same constant in the same PR, or you will have fixed one of two divergences. Also verify the merged-group container's `border-blue-200/70 bg-blue-50/40` (`Table.tsx:507`) is intentionally a third colour meaning "merged" — if so, it belongs in the legend, which currently omits it entirely.

---

### POS-03 — Occupied tables are keyboard-unreachable and silently inert
**Bad** · S2
**Evidence:** `pos/src/components/TableCard.tsx:46-53`

**What's happening:**
```tsx
role={isOccupied ? 'group' : 'button'}
tabIndex={isOccupied ? -1 : 0}
onClick={() => { if (!isOccupied) onNavigate() }}
```
An occupied card cannot be reached by Tab, is announced as a generic `group`, and swallows taps with no feedback. Its two actual actions (Preview, Print) are nested buttons inside it and *are* reachable — so tabbing through the grid skips every occupied card's body and lands unpredictably on its inner buttons.

**Why it matters:** an occupied table is the *more* interesting table — it has a live bill. Making the whole card body a dead zone means a cashier who taps the middle of an occupied card (the natural target, it's 250px tall) gets nothing at all. No ripple, no shake, no toast. In interaction terms this is the worst possible response: silence is indistinguishable from a missed tap, so the user taps again, harder, and then wonders if the terminal has frozen. `role="group"` is also simply the wrong role for a container that has a click handler and visible state.

**Better:** keep the card focusable and make the tap do the obvious thing — occupied cards already have a primary action.
```diff
- role={isOccupied ? 'group' : 'button'}
- tabIndex={isOccupied ? -1 : 0}
- onClick={() => { if (!isOccupied) onNavigate() }}
+ role="button"
+ tabIndex={0}
+ aria-label={`${table.name}, ${isOccupied ? t('tables.occupied') : t('tables.available')}`}
+ onClick={onNavigate}                       // occupied → open the live order
+ onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate() } }}
```
Tapping an occupied table to see its order is what every POS on the market does and what `onPreview` already does anyway (see POS-04).

**Regression check:** the inner Preview/Print buttons call `event.stopPropagation()` already (`Table.tsx:176`, `181`) so they will not double-fire. But `TableActionsMenu` is also nested in the card header — confirm opening the kebab menu doesn't now also trigger navigation. And `isUserRestrictedFromTableOrders` (`Table.tsx:161-165`) already blocks the navigation with a toast for restricted roles, so making occupied cards clickable does not widen permissions — it routes through the same guard.

---

### POS-04 — "Preview" does not preview
**Bad** · S2
**Evidence:** `pos/src/components/TableCard.tsx:138-146` (button labelled `Preview`); handler at `pos/src/pages/Table.tsx:174-177` → `handleNavigateToPOS` → `navigate('/pos')`

**What's happening:** `handlePreviewTable` calls `handleNavigateToPOS`, which sets the selected table and order type and **navigates away to the POS screen**. It is identical to tapping an available card.

**Why it matters:** "Preview" universally means *look without leaving*. A cashier glancing at a table to check a total taps Preview expecting a peek, and instead loses the floor view and has to navigate back. Worse, `handleNavigateToPOS` also calls `setSelectedOrderType(DINE_IN)` and `setSelectedTable(...)` — so an intended read-only glance mutates POS store state. A label that under-promises is fine; a label that mis-promises causes destructive taps.

**Better:** pick one, don't split the difference.
- **Cheapest:** relabel to `Open` (and translate it — it is currently hardcoded English, see [07](07-i18n-rtl-localization.md)). One word, zero risk, removes the lie.
- **Right:** make it a real preview — a `Dialog` with the live order lines and total, plus `Open order` and `Print` inside it. The data is one `getTableOrder(table.name)` call away, which `handlePrintTable` already makes (`Table.tsx:187`).

**Targeted action:** ship the relabel now, scope the preview sheet next. Do not leave the current label.

**Regression check:** relabelling is safe. If the preview dialog is built, note that `getTableOrder` is currently called only inside the print path, which sets `printingTable` state for its spinner — a second caller needs its own loading state or the wrong card will show a spinner.

---

### POS-05 — The payment success toast has never fired
**Bad** · S1
**Evidence:** `pos/src/components/PaymentDialog.tsx:152-155`

**What's happening:**
```ts
// Show toast and reload orders (assume showToast and reload available globally)
if (typeof window !== 'undefined' && (window as any).showToast) {
  (window as any).showToast.success('Payment successful');
}
```
A repo-wide grep shows **`window.showToast` is never assigned anywhere**. The real helper is a normal export, `showToast` from `@ury/ui`, which this same file does not import — while `pos/src/pages/Table.tsx:16` imports it correctly. The comment "assume … available globally" is the tell: the assumption was never checked, and the `if` guard means it fails silently forever.

**Why it matters:** completing a payment is the single most important moment in the entire application, and it currently produces **no positive confirmation at all**. The dialog closes, the order list refetches, and that is the whole feedback. Closure-without-confirmation is precisely the condition that produces double-charges: the cashier isn't sure it went through, so they check, or they re-run it. Every other action in this app — including trivial ones like a failed print — gets a toast. The one that moves money gets nothing.

**Better:**
```diff
- import { Button, Input, Dialog, DialogContent } from '@ury/ui';
+ import { Button, Input, Dialog, DialogContent, showToast } from '@ury/ui';
...
-      if (typeof window !== 'undefined' && (window as any).showToast) {
-        (window as any).showToast.success('Payment successful');
-      }
+      showToast.success(t('payment.success', { amount: formatCurrency(finalTotal) }));
```
Include the amount. "Payment successful" answers *whether*; "₹ 1,240.00 paid" answers *whether and how much*, which is what the cashier actually needs to confirm against the card terminal in their other hand.

**Targeted action:** import the real `showToast`, add a `payment.success` key to `en/fr/ar`, delete the `window` guard. Then grep for any other `(window as any)` usage — this pattern rarely appears alone.

**Regression check:** the toast fires **before** `onClose()`, so the dialog unmount must not unmount the `ToastContainer` — it does not; `ToastProvider` lives at app root. Verify `autoClose` behaviour after the DS-09 change (errors persist, successes don't) so the success toast is still transient. If a print-receipt flow follows payment, sequence the toast so it isn't buried under a print dialog.

---

### POS-06 — The Pay button is enabled on an underpayment, and the total is green regardless
**Bad** · S1
**Evidence:** `pos/src/components/PaymentDialog.tsx:301-303`, `236-247`

**What's happening:**
```tsx
disabled={isProcessing || payments.length === 0}
```
and
```tsx
<span className={'text-green-600 font-semibold flex items-center gap-1'}>
  {formatCurrency(paymentsTotal)} / {formatCurrency(finalTotal)}
```
The gate is "at least one payment line has a non-zero amount". Entering ₹100 against a ₹1,240 bill leaves Pay fully enabled and primary-coloured. The running total is **hardcoded green** — never amber when short, never anything else. Overpayment gets a gold coin icon and a bare number with **no label at all** (lines 240-245), so change due is communicated entirely by an icon's colour.

**Why it matters:** this is the highest-consequence defect in the branch.
- Green is the universal "you're done" signal. Here it means "you have typed something". A cashier under pressure scans for green, sees green, taps the enabled primary button, and submits a short payment. The interface actively cooperated with the error.
- A disabled or clearly-warned button is the standard, cheap defence, and it is missing.
- On overpayment, the amount of change owed to the customer — a number the cashier must read aloud and hand over — is rendered as an unlabelled gold figure next to a coin glyph. Anyone who does not already know what that means will not work it out mid-transaction, and it is invisible to a screen reader and to anyone with a red-green deficiency.

**Better:**
```tsx
const shortfall = finalTotal - paymentsTotal
const isShort  = shortfall > 0.005
const change   = -shortfall

<div className="flex justify-between text-sm">
  <span className="font-medium">{t('payment.total_entered')}</span>
  <span className={cn('font-semibold tabular-nums',
    isShort ? 'text-amber-700' : 'text-green-600')}>
    {formatCurrency(paymentsTotal)} / {formatCurrency(finalTotal)}
  </span>
</div>
{isShort && (
  <p className="text-sm font-medium text-amber-700" role="status">
    {t('payment.short_by', { amount: formatCurrency(shortfall) })}
  </p>
)}
{change > 0.005 && (
  <p className="text-base font-semibold text-foreground" role="status">
    {t('payment.change_due')}: {formatCurrency(change)}   {/* labelled, in words */}
  </p>
)}

<Button disabled={isProcessing || payments.length === 0 || isShort}>…</Button>
```

**Targeted action:** (a) disable Pay while short; (b) colour the running total by state, not statically; (c) **label the change** in text. If partial payment is a genuine business case, make it explicit — a "Save as partial payment" secondary action — rather than an accident of a permissive `disabled` condition.

**Regression check:** confirm with the domain owner that short payment is never legitimate here before disabling. If split-across-shifts or deposit flows exist, gate on a `allowPartial` prop instead of removing the capability. Float comparison: use an epsilon (`0.005`), not `!==`, or rounding will make Pay unreachable on totals like `1240.005`. The existing `showAdjustment`/`showFinalAdjustment` logic already uses `> 0.001` (lines 100, 104) — match that convention.

---

### POS-07 — Discount: apply-to-see, no way to remove, and the submitted value can differ from the displayed one
**Bad** · S2
**Evidence:** `pos/src/components/PaymentDialog.tsx:77-89`, `141-143`

**What's happening:** the discount field requires pressing **Apply** before `appliedDiscount` updates and the summary re-renders. There is no "remove discount" — once applied, the only exit is to close the dialog. And on submit:
```ts
additionalDiscount: discountValue ? parseFloat(discountValue) : null,
```
The **raw input value** is sent, not the applied one. So a cashier who types `20`, presses Apply, sees the summary update, then edits the field to `30` and presses Pay **without** pressing Apply again will see a summary showing a 20% discount and submit a 30% discount. The screen and the invoice disagree.

**Why it matters:** the first two are friction; the third is a money defect. It fails silently, in the customer's favour or the restaurant's, with no trace in the UI, and it will be discovered in reconciliation weeks later. The generic root cause is having two sources of truth for one value (`discountValue` for the field, `appliedDiscount` for the maths) with a manual sync step between them.

**Better:** remove the Apply step entirely — compute on change, debounced, and let the summary be live:
```tsx
const pct = clamp(parseFloat(discountValue) || 0, 0, 100)
const appliedDiscount = (baseTotal * pct) / 100      // derived, not state
// submit the same derived number, never the raw field
additionalDiscount: pct > 0 ? pct : null,
```
Live feedback on a discount field is strictly better than apply-to-see: the cashier is usually discounting *to hit a target number*, and watching the total move as they type is the whole task.

Add a visible `× Remove discount` chip when a discount is active. Validation should be inline under the field, not in the shared error banner two columns away (`line 253`) — an error about the discount input should appear beside the discount input.

**Targeted action:** derive `appliedDiscount` from `discountValue`; delete the Apply button; add a remove affordance; move validation inline; clamp to 0-100 at the input (`max="100"` is currently absent from the field, though `handleApplyDiscount` checks it).

**Regression check:** `effectivePercentage` (lines 49-54) back-computes a percentage from an incoming `discountAmount` for invoice-level discounts — the derived approach must preserve that seed value, or pre-existing invoice discounts will silently reset to 0 when the dialog opens. Test with an order that already carries a pricing-rule discount. Also confirm the backend expects a *percentage* in `additionalDiscount` (it currently receives one), since the derived refactor is a good moment to accidentally send an amount.

---

### POS-08 — No cash-tendered helper on a cash-first POS
**Bad** · S2
**Evidence:** `pos/src/components/PaymentDialog.tsx:212-232`

**What's happening:** each payment mode is a bare numeric `Input`. Focusing an empty one auto-fills the remaining balance (`handlePaymentInputFocus`, lines 126-136) — a nice touch for exact-amount modes. For cash, the cashier types the tendered amount digit by digit on a tablet keyboard.

**Why it matters:** the auto-fill optimises the *card* case, which is the case that needed no help. Cash is the case with the real work: the customer hands over ₹2,000 for a ₹1,240 bill and the cashier needs change. Right now they type `2000`, and then read the change from an unlabelled gold number (POS-06). Every serious POS puts quick-tender buttons here because it is the highest-frequency arithmetic in the building.

**Better:**
```tsx
// under the cash input only
{QUICK_TENDER(finalTotal).map(amount => (      // e.g. exact, 500, 1000, 2000, next-100-up
  <Button key={amount} variant="outline" size="sm"
          onClick={() => setPaymentInputs(i => ({ ...i, [id]: String(amount) }))}>
    {formatCurrency(amount)}
  </Button>
))}
```
Plus an on-screen numpad for the amount field — the same one already built in `PortableTabletAssignment.tsx:118-135`. A tablet software keyboard covers half the dialog; a numpad does not.

**Targeted action:** add quick-tender chips for cash modes, and reuse the existing numpad component rather than writing a second one.

**Regression check:** quick-tender writes into the same `paymentInputs` state, so split payments continue to work. Verify the focus auto-fill doesn't immediately overwrite a quick-tender value — `handlePaymentInputFocus` only fills when the field is empty or zero, so it is safe, but a click on a chip that also focuses the input is worth testing.

---

### POS-09 — Escape is a coin-flip across the POS
**Bad** · S2 · (see [DS-04](01-design-system-foundations.md))
**Evidence:** Escape handled in `ProductDialog.tsx:194-202`, `Spotlight.tsx:28`, `CustomerPicker.tsx:217`. Absent in `PaymentDialog`, `POSClosingDialog`, `BillSplitDialog`, `BillMergeDialog`, `TableMergeDialog`, `TableUnmergeDialog`, `TableTransferDialog`, `CaptainTransferDialog`, `ChecklistGateDialog`, `TableSelectionDialog`.

**Why it matters:** 3 of the 14 dialog components respond to Escape. A learned gesture that works one time in four is worse than one that never works, because the user keeps trying. On a POS this is aggravated by the fact that the dialogs which *don't* close are the heavy, blocking ones — exactly where someone wants out fastest.

**Targeted action:** fix once in the `Dialog` primitive; see DS-04 for the implementation and its full regression list. `ChecklistGateDialog` must opt out.

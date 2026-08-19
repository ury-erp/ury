# 02 — Self-Ordering (Kiosk / Tablet / QR)

`self-order/` — four layout shells over one shared session hook. The newest surface on the branch and the one with the least forgiving audience: a guest with zero training, zero motivation, and a queue behind them.

---

### SO-01 — Layout selection is server-authoritative, not a client guess
**Good** · S3
**Evidence:** `self-order/src/App.tsx:15-48`

**What's happening:** a provisioned device resolves its layout from `deviceContext.layout` returned by the server, with an explicit comment stating it is "never a client guess". A device that has already bootstrapped skips straight to its layout with a resolved context and never re-bootstraps via QR token. `MobileQRLayout` is the fallback for everything else.

**Why it matters:** the tempting shortcut here is `window.innerWidth > 1024 ? Kiosk : Mobile`, and it fails immediately — a landscape kiosk and a tablet in a stand are the same pixels and wildly different ergonomics (standing at arm's length vs seated at 40cm). Deriving the layout from what the device *is* rather than how big it is, is the correct model. Similarly, `MobileQRLayout` reads `context.source === 'QR Pickup'` rather than inferring pickup from a missing table (`MobileQRLayout.tsx:52-55`) — inferring intent from an absent field is how you get a dine-in order silently treated as takeaway.

**Targeted action:** none. Keep the comments; they are load-bearing.

---

### SO-02 — The portrait kiosk's collapsed cart is a genuinely considered decision
**Good** · S3
**Evidence:** `self-order/src/layouts/PortraitKioskLayout.tsx:11-25`, `171-215`

**What's happening:** the cart is a bottom bar showing count + total, expanding to the item list on tap, with a 25-line comment explaining that an always-expanded cart on a tall portrait screen either eats browsing area or forces the grid to reflow as items are added.

**Why it matters:** reflow-on-add is a real and under-appreciated kiosk failure — the guest taps "Add", the grid jumps, and their next tap lands on a different item than the one they were aiming at. Keeping the cart anchored at the bottom also puts it in the thumb zone for a standing adult. The reasoning is sound and the implementation matches it.

**Caveat worth watching:** the whole cart bar is gated on `cartCount > 0` (line 171), so it appears and disappears, shifting the page's effective height. The `pb-24` on the container (line 88) reserves the space, so no content jumps — good. But confirm the same holds on `TabletLayout` and `LandscapeKioskLayout`.

---

### SO-03 — Prices and cart totals render as bare numbers with no currency
**Bad** · S1
**Evidence:** `self-order/src/layouts/MobileQRLayout.tsx:135`; `PortraitKioskLayout.tsx:265`; `self-order/src/layouts/shared/MenuGrid.tsx:35` (covers Tablet + Landscape Kiosk); cart total computed raw at `self-order/src/hooks/useOrderingSession.ts:151`.

**What's happening:** `<div className="text-base text-muted-foreground">{item.rate}</div>` — a raw JS number. `cartTotal` is `reduce((sum, e) => sum + e.qty * e.item.rate, 0)` and is rendered directly (`PortraitKioskLayout.tsx:205`). `formatCurrency` from `@ury/core` is **never imported anywhere in `self-order/`**. Meanwhile `order.grand_total` and `row.amount` come pre-formatted from the server, so the *same screen* mixes formatted server strings with unformatted client numbers.

**Why it matters:** this is the single most damaging defect in the guest app.
- A price displayed as `250` next to a total displayed as `₹ 1,250.00` is not a styling inconsistency, it is an unanswered question. The guest's eye stops.
- Floating-point arithmetic surfaces directly: three items at `33.33` renders a cart total of `99.99000000000001`. There is no rounding anywhere in the reduce.
- The kiosk is the *only* surface where the guest sees the price without a human to ask. This is where formatting matters most and it is the only place it's absent.

**Better:**
```diff
+ import { formatCurrency } from '@ury/core'
...
- <div className="mt-1 text-base text-muted-foreground">{item.rate}</div>
+ <div className="mt-1 text-base text-muted-foreground">{formatCurrency(item.rate)}</div>
...
- <span className="text-base font-semibold">{cartTotal}</span>
+ <span className="text-base font-semibold tabular-nums">{formatCurrency(cartTotal)}</span>
```

**Targeted action:** import `formatCurrency` in `MenuGrid`, `MobileQRLayout`, `PortraitKioskLayout`; apply to `item.rate`, `cartTotal`, and the per-line amounts. Add `tabular-nums` to every price so the cart column aligns.

**Regression check:** `self-order` must actually be able to resolve `@ury/core` — verify it is in the workspace list (root `package.json` lists `packages/*`, `pos`, `frontend`; **`self-order` is not currently a listed workspace**, so check its build resolves the alias before assuming this is a one-line fix). Also confirm `currencySymbol` is populated in the guest context — `formatCurrency` reads it from `storage`, which on a fresh kiosk session may be empty and will fall back to `₹`. If the guest app has no access to that storage key, pass the symbol through `OrderingContext` instead, which is the more honest fix.

---

### SO-04 — The idle-reset hook exists, is well written, and is wired to nothing
**Bad** · S1
**Evidence:** `self-order/src/hooks/useIdleReset.ts` (full file). A repo-wide grep for `useIdleReset` outside its own definition returns **zero results**.

**What's happening:** a clean, dependency-free 90-second idle hook was written and never imported. `useOrderingSession.ts:106-113` confirms this in a comment: reset is "the MVP alternative to an auto-idle-reset timer (**not wired up yet**)". The only reset path is a manual "New Order" / "Start Over" button.

**Why it matters:** an unattended public kiosk with no idle timeout leaks one guest's session to the next. Concretely: someone builds a ₹800 cart, gets called away or gives up, walks off — and the next person walks up to a kiosk showing a stranger's half-built order and, on a fixed-table device, that table's live order and totals. They will either pay for it, add to it, or press "New Order" while confused. All three are bad, and the first is a financial incident. This is not hypothetical; it is the default outcome of an abandoned kiosk session, which is a large fraction of all kiosk sessions.

**Better:**
```tsx
// PortraitKioskLayout / LandscapeKioskLayout / TabletLayout
import { useIdleReset } from '../hooks/useIdleReset'

const [idleWarning, setIdleWarning] = useState(false)
useIdleReset(() => setIdleWarning(true), 60_000)   // warn at 60s
useEffect(() => {
  if (!idleWarning) return
  const t = setTimeout(() => { setIdleWarning(false); resetSession() }, 15_000)
  return () => clearTimeout(t)
}, [idleWarning, resetSession])

{idleWarning && (
  <Dialog open onOpenChange={() => setIdleWarning(false)}>
    <DialogContent>
      <DialogTitle>Still there?</DialogTitle>
      <DialogDescription>We'll start a new order in 15 seconds.</DialogDescription>
      <Button autoFocus onClick={() => setIdleWarning(false)}>I'm still ordering</Button>
    </DialogContent>
  </Dialog>
)}
```
The 15-second warning is not optional politeness — a hard reset with no warning will wipe carts belonging to people who were simply reading the menu.

**Targeted action:** wire `useIdleReset` into the three *device* layouts (kiosk × 2, tablet). Do **not** wire it into `MobileQRLayout`: on a guest's own phone there is no next user, and `resetSession` on a QR session deliberately lands in the "missing ordering code" error state (documented at `useOrderingSession.ts:114-124`), which would be a hostile thing to do to someone who paused to talk to a friend.

**Regression check:** `resetSession` clears both sessionStorage keys and calls `init()`; for a device-bootstrapped session that re-derives a fresh session from the device credential, so this is safe. Verify the idle timer does **not** fire while an order submission is in flight (`submitting === true`) — resetting mid-POST would place an order and then discard the confirmation. Gate the reset on `!submitting && !payingOnline`.

---

### SO-05 — `window.confirm()` is the destructive-action pattern on a kiosk
**Bad** · S2
**Evidence:** `MobileQRLayout.tsx:32`, `TabletLayout.tsx:39`, `LandscapeKioskLayout.tsx:42`, `PortraitKioskLayout.tsx:53`

**What's happening:** all four layouts guard cart destruction with `window.confirm('Start a new order? Current cart will be cleared.')`.

**Why it matters:** a native `confirm()` on a full-screen kiosk renders as an OS-chrome dialog with a browser URL in the title bar on some Android WebViews, unstyled, in the system font, with buttons labelled "OK"/"Cancel". It shatters the illusion that this is a purpose-built ordering appliance and is the most obvious "this is a website" tell in the product. It is also unstyleable, untranslatable, blocks the JS thread, and — on locked-down kiosk browsers — is sometimes suppressed entirely, in which case `confirm()` returns `false` and the button silently does nothing.

Separately: "OK" is a terrible label for "destroy my order". Buttons should be labelled with the verb of the action.

**Better:**
```tsx
<Dialog open={confirmingReset} onOpenChange={setConfirmingReset}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Start a new order?</DialogTitle>
      <DialogDescription>Your {cartCount} item{cartCount > 1 ? 's' : ''} will be removed.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setConfirmingReset(false)}>Keep my order</Button>
      <Button variant="destructive" onClick={resetSession}>Start new order</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```
Note the labels: both buttons say what they do, and the count makes the loss concrete.

**Targeted action:** replace all four with `@ury/ui` `Dialog`. Extract one `ConfirmResetDialog` shared component rather than repeating it four times — the four copies of the same `window.confirm` string are already a small warning sign.

**Regression check:** the confirm is currently synchronous and blocking; the replacement is not, so make sure `resetSession` is only called from the dialog's confirm handler and the calling function no longer expects a boolean return. Also: if the cart is empty, skip the dialog entirely — confirming the destruction of nothing is friction with no purpose.

---

### SO-06 — No search, no item detail, no modifiers, no notes
**Bad** · S1
**Evidence:** `MenuGrid.tsx:28-44`; `PortraitKioskLayout.tsx:167-177`; `addToCart` at `useOrderingSession.ts:129-134`

**What's happening:** every menu item is a single button whose entire interaction is "tap → qty += 1". There is no search field on any layout. There is no detail view, so no description, no allergens, no photo enlargement, no portion size. There is no way to say "no onions", no variants, no add-ons. `MobileQRLayout` renders the **entire menu as one flat ungrouped `grid-cols-2`** with no category filter at all (line 128) — only `PortraitKioskLayout` has a category rail.

**Why it matters:** ranked by how much money each one costs:
1. **No modifiers** is the hard blocker on real deployment. Any restaurant with "no ice", "extra spicy", or "gluten free" cannot use this surface, and every such order becomes a staff interruption — which defeats the entire purpose of self-ordering.
2. **No search on a long menu.** A 120-item menu in an ungrouped two-column phone grid is ~60 rows of scrolling. Guests do not scroll 60 rows; they order the first acceptable thing they see, which flattens average order value and buries the high-margin items.
3. **No allergen or description information** is a safety and liability matter, not a nicety. A guest with a nut allergy cannot use this without asking staff.
4. **No item detail = no upsell surface.** The single highest-ROI screen in fast-food kiosk design is the post-add "make it a meal?" moment, and there is nowhere to put it.

**Better (staged):**
```tsx
// Stage 1 — sticky search + category chips in MobileQRLayout, ~40 lines
<div className="sticky top-[3.25rem] z-10 bg-background px-4 py-2">
  <input
    type="search" inputMode="search"
    value={query} onChange={e => setQuery(e.target.value)}
    placeholder="Search the menu"
    className="w-full rounded-lg border px-4 py-3 text-base"
    aria-label="Search the menu"
  />
</div>
// filter: menu.filter(i => i.item_name.toLowerCase().includes(query.toLowerCase()))
// Stage 2 — tap opens an item sheet: image, description, qty stepper, note field, Add
// Stage 3 — modifier groups from the server, rendered in that sheet
```
The category rail already built in `PortraitKioskLayout.tsx:139-166` is the reusable piece — lift it into `shared/` and give all four layouts categories before building anything new.

**Targeted action:** (a) lift the category grouping out of `PortraitKioskLayout` into `shared/CategoryRail.tsx` and use it in all four layouts; (b) add search to Mobile and Tablet; (c) scope the item-detail sheet and modifiers as the next real feature — this is the gap between demo and deployable.

**Regression check:** `MenuGrid` is shared by Tablet and Landscape Kiosk; changing its signature touches both. Filtering must apply to the *rendered* list only — `cart` is keyed by `item.item`, so a filtered-out item with a non-zero cart quantity must still appear in the cart panel (it does; the cart derives from `cart` state, not from `visibleMenu`). Verify the empty-search-result state exists — today a filter returning nothing renders a blank area with no explanation.

---

### SO-07 — Loading and error states are bare centred sentences
**OK** · S2
**Evidence:** `PortraitKioskLayout.tsx:71-86`; `App.tsx:29-42`; `MobileQRLayout.tsx:36-49`

**What's happening:** loading is the text "Loading menu…" centred in an otherwise empty screen; fatal errors are one line of `text-destructive` with no action. `App.tsx` shows "Starting up…" and, on failure, "This device could not be started. Please contact staff."

**Why it matters:** two separate issues.
- **The error states are dead ends.** Every one of them tells the guest something is wrong and gives them no button. "Please rescan the QR code" without a Retry means the guest must find and re-aim at a physical sticker; a `Try again` button resolves the majority of these (transient network) in one tap. On a wall-mounted kiosk, "please contact staff" is the *only* possible outcome, so the screen should at least display the device name/ID so staff can act on it without interrogating the guest.
- **A blank loading screen sets the wrong expectation.** A skeleton of the menu grid tells the guest "a menu is coming, roughly this shape", which measurably reduces perceived wait versus a spinner or a word. The kiosk always renders the same layout, so the skeleton is trivially accurate.

**Better:**
```tsx
if (error && !context) return (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
    <p className="text-destructive">{error}</p>
    <Button onClick={init}>Try again</Button>
    <p className="text-xs text-muted-foreground">If this keeps happening, please ask a member of staff.</p>
  </div>
)
```

**Targeted action:** expose `init` (or a `retry`) from `useOrderingSession`, add a Retry button to all three error states, and replace the loading text with a 6-card skeleton grid.

**Regression check:** `init` is already a `useCallback` and `resetSession` calls it, so exposing it is safe. Ensure Retry does not re-trigger the "missing ordering code" branch for a QR session whose token has been consumed — if there's no token and no stored context, Retry should be hidden rather than looping the same error.

---

### SO-08 — The portable-tablet PIN screen advances on length, not on validity
**OK** · S2
**Evidence:** `self-order/src/layouts/PortableTabletAssignment.tsx:56-64`, `77-86`

**What's happening:** `handlePinSubmit` advances from the PIN step to the table step as soon as 4 digits are entered — the PIN is only actually verified server-side at assignment time, which the code comments honestly. A wrong PIN therefore surfaces *after* the staff member has also typed a table name, at which point the code resets `pin` and throws them back to step 1, losing the table entry too.

**Why it matters:** the error appears two steps away from its cause and takes the correct input down with it. Staff will retype the table name every time they fat-finger a PIN — and this happens on a shared tablet, standing, mid-service. Also note the component is **not routed anywhere**: a grep for `PortableTabletAssignment` outside its own file returns nothing, so this screen is currently unreachable. It should either be wired to `device_type === 'Portable Tablet'` in `App.tsx` or the file is dead weight that will rot.

**Better:** verify the PIN on its own step (a lightweight `verify_staff_pin` call, or reuse `assign_device_table`'s validation with a `dry_run` flag), so the error appears where the mistake was made. On failure, clear only the PIN and keep the table value. Also add a max-attempt lockout — an unattended tablet with an unlimited 4-digit PIN retry is a 10,000-guess brute force with no ceiling.

**Regression check:** if a `verify` endpoint is added, ensure the PIN is not sent twice in a way that double-counts a rate limit. Wiring the component into `App.tsx` changes routing for provisioned devices — confirm `deviceContext.layout` for a portable tablet doesn't already resolve to `Tablet` and bypass assignment entirely, which would silently hand a customer an unassigned tablet.

---

### SO-09 — Free-text table entry where a picker belongs
**OK** · S3
**Evidence:** `PortableTabletAssignment.tsx:150-157`, with the reason documented at lines 30-36 (no customer-safe table-listing endpoint exists yet)

**What's happening:** the staff member types the table name (`placeholder="e.g. T12"`). The backend validates it, so a bad value is rejected rather than silently accepted.

**Why it matters:** the constraint is honestly documented and the validation is real, so this is a defensible MVP — but typing an identifier is recall, not recognition, and it is exactly the kind of thing that gets typed wrong at 8pm. The failure mode is also asymmetric: typing `T2` instead of `T12` doesn't error, it assigns the tablet to *the wrong occupied table*, and the next order lands on someone else's bill.

**Better:** once a listing endpoint exists, a grid of vacant tables (the POS already has `getVacantTablesForBranch`, `pos/src/lib/table-api.ts`). In the meantime, echo the resolved table back for confirmation before handing over the tablet: "Assigned to **Table 12 · Main Hall · 4 seats**" with an Undo.

**Regression check:** none for the confirmation echo — it's additive and uses data the assign response already returns.

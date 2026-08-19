# 06 — Accessibility

Cross-cutting. Judged against WCAG 2.1 AA as a floor, not a ceiling. A POS is used by shift staff of every age and eyesight; a kiosk is used by the public, which includes everyone.

**Overall: 4 / 10.** Individual components show real awareness — `aria-label` on the kiosk quantity steppers, `aria-expanded` on the cart toggle, `sr-only` text on the dialog close button, `role="status"` on the spinner. But the primitives that would make accessibility systemic are missing, so the good instances are islands.

---

### A11Y-01 — Per-control ARIA is present and correct where it appears
**Good** · S3
**Evidence:** `self-order/src/layouts/PortraitKioskLayout.tsx:180-195` (`aria-label={`Remove one ${item_name}`}`), `:200` (`aria-expanded` on the cart bar), `:141` (`aria-label="Menu categories"` on the `<nav>`); `packages/ui/src/components/dialog.tsx:117-125` (`aria-label="Close"` + `sr-only`); `packages/ui/src/components/spinner.tsx:12` (`role="status" aria-live="polite"`).

**Why it matters:** naming a `+`/`−` button by the item it affects is exactly right — the generic version ("Add", "Remove") is useless in a list of twenty. Someone here knows what they're doing; the gap is coverage, not knowledge.

**Targeted action:** none. Use these as the in-repo reference examples when fixing the rest.

---

### A11Y-02 — No modal is a modal (WCAG 2.4.3, 4.1.2)
**Bad** · S1
**Evidence:** `packages/ui/src/components/dialog.tsx:83-133`; full analysis in [DS-04](01-design-system-foundations.md)

**Summary:** no `role="dialog"`, no `aria-modal`, no `aria-labelledby`, no focus trap, no focus restoration, no body scroll lock. Focus escapes into the page behind every dialog in all three apps, including the payment dialog. Screen readers are never told a dialog opened. This is the single largest accessibility defect in the branch and it is fixable in one file.

**Targeted action + regression check:** see DS-04.

---

### A11Y-03 — Occupied table cards are removed from the tab order (WCAG 2.1.1)
**Bad** · S2
**Evidence:** `pos/src/components/TableCard.tsx:46-47`; full analysis in [POS-03](03-pos-terminal.md)

**Summary:** `tabIndex={-1}` and `role="group"` on an interactive card, whose click handler does nothing. Keyboard users cannot reach the card body of any occupied table; tab order jumps unpredictably into nested buttons.

---

### A11Y-04 — Async results are announced to nobody
**Bad** · S2
**Evidence:** exactly one `aria-live` exists in the entire codebase (`packages/ui/src/components/spinner.tsx:12`). Absent from: every toast, every error banner (`pos/src/components/PaymentDialog.tsx:253`, `frontend/src/pages/Reports/TodaysSales.tsx:82`, `self-order/src/layouts/*.tsx`), the setup progress step list, and every "N results" count.

**Why it matters:** for a sighted user an error appearing at the top of a form is obvious. For a screen reader user, focus stays where it was and nothing is spoken — the button appears to have done nothing, so they press it again. On the payment dialog that means retrying a failed payment blind.

**Better:** `role="alert"` for errors (assertive, interrupts), `role="status"` for confirmations and counts (polite, waits). Both need to be **in the DOM before the message appears**, or the change isn't detected — render the container unconditionally and only fill its text:
```tsx
<div role="alert" className="min-h-0">{error /* empty string when none */}</div>
```
react-toastify supports `role` per toast; set `role="alert"` on `showToast.error` in `packages/ui/src/components/toast.tsx` so every error toast in the product is announced from one change.

**Targeted action:** add `role` to the toast helpers (one file, covers the most sites); add `role="alert"` to the three page-level error banners; add `aria-live="polite"` to `ProgressModal`'s step list.

**Regression check:** an always-mounted live region containing an empty string is invisible and inert — but do not put it inside a conditionally-rendered parent, which defeats the purpose. Avoid double-announcing: if a toast and a banner both carry the same error, mark one of them `aria-hidden`.

---

### A11Y-05 — State communicated by colour alone in the money path (WCAG 1.4.1)
**Bad** · S1
**Evidence:** `pos/src/components/PaymentDialog.tsx:236-247`

**What's happening:** overpayment renders as a gold coin icon plus a gold number, with no text label. Underpayment isn't signalled at all — the total stays green. The only textual cue is the raw `entered / total` pair.

**Why it matters:** ~8% of men have a red-green colour vision deficiency; amber-on-white against green-on-white is one of the harder pairs. But this fails for *everyone* — an unlabelled number next to a coin icon is a puzzle regardless of vision, and the number in question is the change owed to a customer standing at the counter.

**Better:** the fix is text, not colour — see [POS-06](03-pos-terminal.md) for the full patch. `Change due: ₹ 760.00` and `Short by ₹ 1,140.00` are self-describing at any colour, any contrast, any language.

---

### A11Y-06 — Table status leans on colour, with a text badge as the saving grace
**OK** · S2
**Evidence:** `pos/src/components/TableCard.tsx:57-60` (emerald/amber card), `73-75` (a `Badge` reading "Available"/"Occupied")

**What's happening:** the card's fill/border encodes status, and a text badge in the header states it in words.

**Why it matters:** the text badge is what saves this from being a 1.4.1 failure, and it deserves credit. But at a glance across a floor of 40 cards, the badge is too small to be the primary channel and the colour is doing the real work — and emerald/amber at `-50` fills are both low-saturation pastels that converge for a deuteranomalous viewer. Add a second non-colour channel that survives a squint: a left border weight, a dot, or a subtle fill pattern on occupied.

**Better:** keep the palette (emerald/amber is already a better choice than green/red for this exact reason) and add a `border-l-4` on occupied cards. Shape is readable at a distance in a way that a pastel fill is not.

**Regression check:** a left border changes the card's internal width by 4px; the card uses `p-4` throughout so nothing reflows, but check the merged-group flex row (`Table.tsx:504-518`) where cards have `basis-[calc(50%-1.5rem)]` — border-box sizing should absorb it, but verify.

---

### A11Y-07 — Contrast risks in the muted-text palette
**OK** · S3
**Evidence:** `--muted-foreground: 215.4 16.3% 46.9%` (`packages/ui/src/styles/theme.css:26`) on `--background: 0 0% 100%`; used at `text-xs` in several places, e.g. `frontend/src/pages/Reports/TodaysSales.tsx:76`, `pos/src/components/TableCard.tsx:88`.

**What's happening:** the muted foreground lands around 4.6:1 on white — over the 4.5:1 AA floor for normal text, but with essentially no margin, and it is frequently used at `text-xs` (12px) and at reduced opacity (`text-muted-foreground/70` in `stat-card.tsx:36`). `--muted-foreground/70` is roughly **3.2:1** and fails.

**Why it matters:** it passes on a designer's calibrated monitor and fails on a five-year-old POS tablet at 40% brightness in a bright dining room — which is the actual usage environment. Timestamps, "updated at", and secondary metadata are precisely the text that gets squinted at.

**Better:** darken `--muted-foreground` to about `215 16% 40%` (~6:1), and ban opacity modifiers on it. If a third tier of emphasis is needed, add a real token (`--subtle-foreground`) with a checked value rather than multiplying alpha.

**Regression check:** this token is used broadly across all three apps; darkening it is a global visual change, though a subtle one. Check the dark theme separately — `--muted-foreground: 215 20.2% 65.1%` on `222.2 84% 4.9%` is comfortable, so only the light value needs to move.

---

### A11Y-08 — Native dialogs and unlabelled inputs on the guest surface
**Bad** · S2
**Evidence:** `window.confirm` at four sites (see [SO-05](02-self-ordering-kiosk.md)); PIN entry at `self-order/src/layouts/PortableTabletAssignment.tsx:107-116`; table input at `:150-156`.

**What's happening:** the PIN dots are `<div>`s inside a container carrying `aria-label="PIN entry"` — there is no input element, so the current PIN length is not exposed and the numeric keypad buttons have no relationship to any field. The table `<input>` has a `placeholder` and a separate `<p>` label, but no `<label htmlFor>` or `aria-label`.

**Why it matters:** placeholder-as-label is the most common labelling defect there is — the placeholder vanishes on first keystroke, so anyone who is interrupted mid-entry loses the field's meaning, and screen readers treat placeholders inconsistently. For the PIN, a screen reader user has no way to know how many digits they've entered.

**Better:**
```tsx
<label htmlFor="table-code" className="text-sm text-muted-foreground">Table name or code</label>
<input id="table-code" placeholder="e.g. T12" … />
```
and for the PIN, add `<span className="sr-only" role="status">{pin.length} of {MAX_PIN_LENGTH} digits entered</span>`.

**Regression check:** adding a visible `<label>` where a `<p>` already sits is a swap, not an addition — don't end up with both. Verify the `flex flex-col gap-4` spacing still reads as label-attached-to-field (gap-4 is too loose for a label; use `gap-1.5` between label and input, `gap-4` between field groups — proximity is what communicates the pairing).

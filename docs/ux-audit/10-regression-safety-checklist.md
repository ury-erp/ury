# 10 — Regression Safety Checklist

The audit's brief was explicit: every recommendation must come with a check that nothing else breaks. This document consolidates those checks into something usable as a PR checklist, plus the blast-radius map that says which fixes are safe alone and which must ship together.

---

## Blast-radius map

| Change | Files changed | Surfaces affected | Risk |
|---|---|---|---|
| `Dialog` focus trap / Escape / ARIA ([DS-04](01-design-system-foundations.md)) | 1 | **All 14 dialogs, 3 apps** | **High** |
| `formatCurrency` decimals + locale ([DS-08](01-design-system-foundations.md)) | 2 (delete 1) | Every money string in POS + console | **High** |
| `shadow-xs` → add `xs` rung ([DS-03](01-design-system-foundations.md)) | 1 | 28 elements, 10 console pages | Medium |
| `t()` English fallback ([I18N-02](07-i18n-rtl-localization.md)) | 1 | Every string in the POS | Medium |
| Toast `autoClose`/`rtl`/`role` ([DS-09](01-design-system-foundations.md), [I18N-03](07-i18n-rtl-localization.md)) | 1 | Every toast, 2 apps | Medium |
| `StatCard` tokens + polarity ([DS-05](01-design-system-foundations.md)) | 1 | Reports (delta prop currently unused) | Low |
| Payment dialog fixes ([POS-05](03-pos-terminal.md), [POS-06](03-pos-terminal.md), [POS-07](03-pos-terminal.md)) | 1 | Payment flow only | Medium |
| Table legend / card constant ([POS-02](03-pos-terminal.md)) | 2-3 | Table grid + floor plan | Low |
| Kiosk currency + idle reset ([SO-03](02-self-ordering-kiosk.md), [SO-04](02-self-ordering-kiosk.md)) | 4-5 | Self-order only | Low |
| Nav labels, report descriptions, version fallback | 3 | Cosmetic | **None** |
| RTL codemod `ml-→ms-` etc. ([I18N-04](07-i18n-rtl-localization.md)) | ~30 | POS | Low (no-op in LTR) |

---

## Must ship together

These pairs are unsafe to split:

1. **`Dialog` Escape support + `ChecklistGateDialog` opt-out.** The checklist dialog is a *gate*. The moment Escape works generically, the gate is bypassable. `closeOnEscape={false}` must land in the same commit — not the next PR.
2. **`Dialog` Escape + removal of the four private Escape handlers** (`ProductDialog`, `Spotlight`, `Drawer`, `SideDrawer`). Leaving both means two handlers fire on one keypress; in a nested case that closes two layers at once.
3. **`StatCard` token swap + any `KPIGrid` migration to `StatCard`.** Migrating first bakes `bg-white` into the dashboard.
4. **`t()` fallback + any new translation keys.** Until the fallback lands, a typo'd key ships as a raw dot-string to English users too.
5. **`formatCurrency` + `DataTable` column widths.** Two decimals adds up to 3 characters per amount; narrow columns wrap.

## Safe to ship alone

Nav labels ([C-01](08-content-and-microcopy.md)), report descriptions ([DA-05](04-manager-dashboard-reports.md)), version fallback ([SU-03](05-setup-wizard-onboarding.md)), "Preview"→"Open" ([POS-04](03-pos-terminal.md)), `occupancyRate` fix ([DA-02](04-manager-dashboard-reports.md)), hex→token in the sidebar ([DS-07](01-design-system-foundations.md)), the `payment.success` toast import ([POS-05](03-pos-terminal.md)), the RTL codemod ([I18N-04](07-i18n-rtl-localization.md)).

---

## PR checklist

Copy into any PR arising from this audit.

### Always
- [ ] `yarn build` passes for **every** workspace touched (`pos`, `frontend`, `packages/*` — and note `self-order` is **not** in the root `workspaces` list, so verify its build separately).
- [ ] No new raw hex in a `className` (`grep -rn "#[0-9a-fA-F]\{6\}" src --include=*.tsx`).
- [ ] No new Tailwind class that the config cannot resolve (the `shadow-xs` class of bug — check any unfamiliar utility against `packages/ui/tailwind-preset.js`).
- [ ] Every new user-visible string goes through `t()` and exists in `en`, `fr`, `ar`.
- [ ] Load-bearing comments preserved — especially `ReportsLayout.tsx:3-11`, `useOrderingSession.ts:106-124`, `PortraitKioskLayout.tsx:11-25`, `button.tsx:56-59`.

### If you touched `packages/ui`
- [ ] Open one dialog in each app; confirm Escape, Tab-cycling, focus restoration on close, and that the background does not scroll.
- [ ] `ChecklistGateDialog` still cannot be dismissed by Escape, overlay click, or Tab-out.
- [ ] `POSClosingDialog` cannot be dismissed while a submit is in flight.
- [ ] Toasts still appear above dialogs, not behind them (`z-50` on dialogs).
- [ ] Screenshot-diff: Dashboard, Menu, Table, Room, Branch, User, POS Profile, Report Settings, Aggregator, Production Unit (all 10 use `shadow-xs`).

### If you touched money formatting
- [ ] Payment dialog: subtotal, discount, adjustment, final total, and the `entered / total` pair all show 2 decimals and align on the decimal point.
- [ ] Split payment across 3 modes still sums correctly; the running comparison updates per keystroke.
- [ ] Overpay and underpay both produce the correct labelled text, not just a colour.
- [ ] Chart axis labels (`formatCompactCurrency`) did **not** gain 2 decimals — compact labels should stay compact.
- [ ] An existing invoice with a pricing-rule discount opens with the correct pre-seeded percentage (`effectivePercentage`, `PaymentDialog.tsx:49-54`).
- [ ] No snapshot or unit test asserts an old formatted string.

### If you touched the table grid
- [ ] Legend swatches and card fills are visibly identical colours.
- [ ] `LayoutView` (floor plan) uses the same status constant — no third palette.
- [ ] Merged-group cards still lay out correctly, including the `MergeLinkConnector` between them.
- [ ] The kebab menu (`TableActionsMenu`) opens without also triggering card navigation.
- [ ] Preview and Print still `stopPropagation` and do not double-fire.
- [ ] A restricted role still gets the "Dine In is not available" toast rather than navigating.
- [ ] Re-tapping the active room tab still force-refreshes.

### If you touched self-ordering
- [ ] All four layouts still render: Mobile (QR), Tablet, Landscape Kiosk, Portrait Kiosk.
- [ ] A device-bootstrapped session does **not** re-bootstrap via QR token (`App.tsx` fast path).
- [ ] Pickup mode is still driven by `context.source === 'QR Pickup'`, never by an absent table.
- [ ] Idle reset does not fire while `submitting` or `payingOnline` is true.
- [ ] Idle reset is **not** wired into `MobileQRLayout` (a phone has no next user, and reset there is a dead end by design).
- [ ] After a reset on a device, a fresh session resolves without staff intervention.
- [ ] `formatCurrency` resolves a symbol in the guest context — if `storage` is unavailable there, the symbol must come through `OrderingContext`.

### If you touched i18n
- [ ] Missing keys render English, not `some.dotted.key`.
- [ ] Arabic build: `<html dir="rtl">` on first paint, no LTR flash.
- [ ] Arabic toasts appear on the leading (left) edge with correctly ordered icon and text.
- [ ] The floor-plan mirroring in `LayoutView.tsx:21` is not double-flipped by the logical-property codemod.
- [ ] `DataTable`'s `align: "right"` numeric columns still end-align sensibly in both directions.

### If you touched reports
- [ ] `ReportsLayout` still renders **only** `<Outlet />` — no second `<aside>`, no second scroll container (this previously caused the double-sidebar and overflow bugs).
- [ ] Branch scope is still echoed in each report's subtitle.
- [ ] A shared date range does not silently override a report that needs a single date.
- [ ] The `res.message ?? res` response-shape tolerance is preserved per report.
- [ ] The live-refresh interval still tears down on unmount and on date change.

---

## What must not move

Protect these — they are the branch's best work and are the most likely casualties of a well-meaning refactor:

1. **44px default control height** and the shared Button/Input/Select scale (`button.tsx:56-63`).
2. **Press-darker-than-hover** across all button variants, and `touch-manipulation`.
3. **Server-authoritative kiosk layout selection**, and `source`-based pickup detection.
4. **The subscribe-then-start ordering** in `ProgressModal` (lines 50-58) — it exists to close a real race.
5. **`ReportsLayout`'s deliberate emptiness.**
6. **Room/table session caching with re-tap-to-refresh.**
7. **`BranchContext`'s `'all'` sentinel + subtitle echo** — the model the date range should copy.
8. **The explanatory comments.** They are why several items in this audit are graded "considered trade-off" rather than "oversight".

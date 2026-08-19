# 09 — Prioritised Backlog

Ranked by **(impact × reach) ÷ effort**. Effort is engineering days for one developer, including test and review. Every item links to its full entry.

---

## Tier 0 — Ship this sprint (money, safety, exclusion)

| # | Item | Where | Effort | Why now |
|---|---|---|---|---|
| 1 | **Pay button enabled on underpayment; total always green; change due unlabelled** | [POS-06](03-pos-terminal.md) | 0.5d | The interface actively assists a short-payment error and hides the change owed. Highest-consequence defect in the branch. |
| 2 | **Payment success toast never fires** (`window.showToast` unassigned) | [POS-05](03-pos-terminal.md) | 0.25d | The most important action in the product returns no confirmation. Two-line fix. |
| 3 | **Discount submits the raw field, not the applied value** | [POS-07](03-pos-terminal.md) | 0.5d | Screen and invoice can silently disagree on money. |
| 4 | **Kiosk idle reset written but never wired** | [SO-04](02-self-ordering-kiosk.md) | 0.5d | Abandoned public sessions leak one guest's cart and live bill to the next. |
| 5 | **Prices and cart totals have no currency and no rounding** | [SO-03](02-self-ordering-kiosk.md) | 0.5d | Guests see `99.99000000000001` beside `₹ 1,250.00`. Only surface with no human to ask. |
| 6 | **Dialogs: no focus trap, no Escape, no ARIA, no scroll lock** | [DS-04](01-design-system-foundations.md) · [A11Y-02](06-accessibility.md) | 1.5d | One primitive fixes 14 dialogs across three apps. Highest leverage in the audit. |
| 7 | **Table legend contradicts the table cards** | [POS-02](03-pos-terminal.md) | 0.25d | The legend claims red/green; the floor is amber/emerald. |
| 8 | **Arabic missing 33% of keys, failing to raw dot-notation** | [I18N-02](07-i18n-rtl-localization.md) | 0.5d fallback + 2d translation | English fallback alone makes Arabic shippable. Do the fallback first. |

**Tier 0 total: ~4.5 engineering days** (excluding the translation work itself) and it covers every S1 in the audit.

---

## Tier 1 — Next sprint (trust, comprehension)

| # | Item | Where | Effort |
|---|---|---|---|
| 9 | KPI row: no comparisons, no hierarchy, `StatCard.delta` unused | [DA-01](04-manager-dashboard-reports.md) | 1.5d + backend |
| 10 | "Active Tables" shows total; `occupancyRate` computed and discarded | [DA-02](04-manager-dashboard-reports.md) | 0.1d |
| 11 | `shadow-xs` is a no-op in 28 places (28 flat cards, oversized hover jump) | [DS-03](01-design-system-foundations.md) | 0.25d |
| 12 | `formatCurrency`: locale-locked, inconsistent decimals, duplicated | [DS-08](01-design-system-foundations.md) | 0.5d + broad re-test |
| 13 | Occupied table cards keyboard-unreachable and inert on tap | [POS-03](03-pos-terminal.md) | 0.5d |
| 14 | "Preview" navigates away — relabel to "Open" | [POS-04](03-pos-terminal.md) · [C-02](08-content-and-microcopy.md) | 0.1d |
| 15 | Error toasts auto-dismiss in 2s | [DS-09](01-design-system-foundations.md) | 0.25d |
| 16 | Setup progress modal: no exit, no retry, no announcements on failure | [SU-05](05-setup-wizard-onboarding.md) | 0.75d |
| 17 | Two date controls; date scope not shared between reports | [DA-03](04-manager-dashboard-reports.md) | 1.5d |
| 18 | No `aria-live` anywhere; async results announced to nobody | [A11Y-04](06-accessibility.md) | 0.5d |
| 19 | `window.confirm()` on kiosk destructive actions | [SO-05](02-self-ordering-kiosk.md) | 0.5d |
| 20 | Nav labels leak doctype names (`URY Table`, `User`) | [C-01](08-content-and-microcopy.md) | 0.1d |

---

## Tier 2 — Backlog (polish, future cost)

| # | Item | Where | Effort |
|---|---|---|---|
| 21 | Reports landing page is a dead end; add 17 descriptions + a grid | [DA-05](04-manager-dashboard-reports.md) · [C-07](08-content-and-microcopy.md) | 0.75d |
| 22 | `DataTable`: no sort, no sticky header, index keys | [DS-06](01-design-system-foundations.md) | 1.5d |
| 23 | `StatCard` hardcodes light colours; delta polarity assumed | [DS-05](01-design-system-foundations.md) | 0.5d |
| 24 | 10 × `#2563eb` hardcoded in the sidebar | [DS-07](01-design-system-foundations.md) | 0.25d |
| 25 | Toasts hardcoded LTR; 50 physical spacing utilities in the POS | [I18N-03](07-i18n-rtl-localization.md) · [I18N-04](07-i18n-rtl-localization.md) | 1d |
| 26 | Hardcoded English errors and button labels beside translated ones | [I18N-06](07-i18n-rtl-localization.md) | 0.5d |
| 27 | Camera-roll filename shipped as the brand logo; JPEG at 28px | [SU-02](05-setup-wizard-onboarding.md) | 0.25d |
| 28 | Live-polling numbers with no live indicator; polls while tab hidden | [DA-04](04-manager-dashboard-reports.md) | 0.5d |
| 29 | 17 hand-rolled loading/error/empty implementations | [DA-06](04-manager-dashboard-reports.md) | 1d + gradual |
| 30 | Wizard step indicator hidden on small screens | [SU-04](05-setup-wizard-onboarding.md) | 0.1d |
| 31 | Hardcoded `v3.2.0` version fallback | [SU-03](05-setup-wizard-onboarding.md) | 0.1d |
| 32 | `--muted-foreground` at ~4.6:1, used with opacity modifiers | [A11Y-07](06-accessibility.md) | 0.25d |
| 33 | Kiosk loading/error states have no retry and no skeletons | [SO-07](02-self-ordering-kiosk.md) | 0.5d |
| 34 | Portable-tablet PIN validates late; screen not routed anywhere | [SO-08](02-self-ordering-kiosk.md) | 0.75d |
| 35 | Table colour status needs a second non-colour channel | [A11Y-06](06-accessibility.md) | 0.25d |
| 36 | Placeholder-as-label; PIN length not exposed | [A11Y-08](06-accessibility.md) | 0.25d |
| 37 | `IndianRupee` icon as generic financial iconography | [I18N-05](07-i18n-rtl-localization.md) | 0.1d |

---

## Feature gap, not a defect

**Self-ordering has no search, no item detail, no modifiers, no notes, no allergens** ([SO-06](02-self-ordering-kiosk.md)). This is not a bug to be scheduled alongside the above — it is the difference between a demoable kiosk and a deployable one. Any restaurant with "no onions" cannot use this surface today, and every such order becomes the staff interruption the kiosk was bought to eliminate. Scope it as a feature epic; a reasonable first slice (category rail lifted from the portrait kiosk into all four layouts + a search field) is ~2 days and captures most of the browsing benefit while the modifier work is designed.

---

## Suggested sequencing

**Sprint 1 — "nothing lies about money"**
Items 1, 2, 3, 5, 7, 12. All money and signifier-honesty fixes land together, so the re-test of every currency string happens once. ~2.5 days of work, and it is the sprint that changes how the product feels to a cashier.

**Sprint 2 — "the primitives carry their weight"**
Items 6, 11, 15, 18, 23, 24, plus the I18N-02 fallback (8). Everything in this sprint is a change to `packages/ui` or `packages/core` that fixes many call sites at once. Highest ratio of surfaces improved per line changed. Screenshot-diff the manager console before and after — item 11 alone changes 28 elements.

**Sprint 3 — "the manager gets an answer"**
Items 9, 10, 17, 21, 28. The dashboard and reports stop being a data dump and start answering "was today good?". This is the sprint that needs a backend change (previous-period comparison), so start that conversation during sprint 2.

**Then:** the self-ordering feature epic, and the Tier 2 remainder batched into whatever files are already being touched.

# URY `v3-test` — UX/UI Audit

**Branch audited:** `v3-test` @ `b35c904` (*Merge branch 'feature/demo_data' into v3-test*)
**Baseline compared against:** `develop` @ `b06343e`
**Date:** 2026-08-19
**Mode:** Read-only. **No product code was changed by this audit** — the only files added are the markdown documents in this folder.

---

## What this is

A first-principles UX/UI review of everything a human touches on `v3-test`, across all four front-ends the branch ships:

| Surface | Path | Who uses it | Conditions |
|---|---|---|---|
| **Self-ordering** | `self-order/` | Guests | Public screen or own phone, 0 training, 0 tolerance |
| **POS terminal** | `pos/` | Cashiers, captains | Tablet, one-handed, under rush, 8h shifts |
| **Manager console** | `frontend/` | Owners, managers | Desktop, low frequency, high stakes |
| **Design system** | `packages/ui`, `packages/core` | All of the above | The thing that makes them feel like one product |

Every observation is graded **Good / OK / Bad**, cites the file and line it came from, explains *why it matters behaviourally* (not just stylistically), gives a **concrete before/after**, a **targeted action**, and a **regression check** — what else could break if you apply the fix.

## Headline

`v3-test` has a genuinely strong foundation. The `@ury/ui` token layer, the 44px touch-target control scale, the two-layer elevation ramp, the single motion curve, and the honest in-code comments explaining *why* a cart is collapsed on a portrait kiosk are the work of someone who thinks about interaction, not just markup. That is rare and it should be protected.

The problems are almost entirely **the last mile**: primitives that are excellent but bypassed at call sites, a design token that is silently a no-op in 28 places, a status legend that contradicts the thing it explains, money rendered without a currency in the guest app, and a payment success toast that has never once fired. None of these are architectural. All are cheap. Together they are the difference between "solid internal tool" and "product".

**Score: 6.8 / 10.** Foundations 8.5, execution 6, accessibility 4, localisation 4.

## The documents

| # | Document | What's in it |
|---|---|---|
| 00 | [Method & scoring](00-method-and-scoring.md) | How observations are graded, severity model, how to read an entry |
| 01 | [Design system foundations](01-design-system-foundations.md) | Tokens, `Button`, `Dialog`, `DataTable`, `StatCard`, the `shadow-xs` no-op, hex-code drift |
| 02 | [Self-ordering (kiosk / tablet / QR)](02-self-ordering-kiosk.md) | The guest-facing app: money without currency, no search, no item detail, dead idle-reset hook |
| 03 | [POS terminal](03-pos-terminal.md) | Table grid, the contradicted legend, the payment dialog, the toast that never fires |
| 04 | [Manager dashboard & reports](04-manager-dashboard-reports.md) | 8 flat KPIs with no comparison, two different date controls, silent 15s polling |
| 05 | [Setup wizard & onboarding](05-setup-wizard-onboarding.md) | First-run experience, progress modal, the camera-roll filename shipped as the logo |
| 06 | [Accessibility](06-accessibility.md) | Focus traps, keyboard reachability, colour-only signalling, live regions |
| 07 | [i18n & RTL](07-i18n-rtl-localization.md) | 33% of Arabic missing and failing *to raw dot-keys*, RTL toasts, `en-IN` hardcoded in money |
| 08 | [Content & microcopy](08-content-and-microcopy.md) | Doctype names leaking into nav, "Preview" that isn't a preview, error copy with no exit |
| 09 | [Prioritised backlog](09-prioritized-backlog.md) | Everything ranked by (impact × reach) ÷ effort, with a suggested 3-sprint sequence |
| 10 | [Regression safety checklist](10-regression-safety-checklist.md) | Per-fix blast radius, what to re-test, what must not move |

## How to use it

1. Read [09 — Prioritised backlog](09-prioritized-backlog.md) first if you have ten minutes. The top eight items are all under a day each and cover the bulk of the perceived-quality gap.
2. Read [01 — Design system foundations](01-design-system-foundations.md) before touching any call-site fix; several page-level problems disappear on their own once the primitive is corrected.
3. Use [10 — Regression safety checklist](10-regression-safety-checklist.md) as the PR template checklist for anything that comes out of this audit.

## Ground rules used

- **A signifier must not lie.** (Norman) A legend that says red/green while the UI shows amber/emerald is worse than no legend.
- **Recognition over recall**, especially at 3 taps into a rush-hour flow.
- **Feedback within 100ms, always, for every destructive or financial action.**
- **The system's state must be legible without colour**, without hover, and without training.
- **Consistency is a feature with a cost curve**: two date pickers is not twice the flexibility, it is half the confidence.

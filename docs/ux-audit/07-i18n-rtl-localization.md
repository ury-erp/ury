# 07 — Internationalisation & RTL

`pos/src/i18n/`, `packages/ui/src/components/toast.tsx`, `packages/core/src/format.ts`. Three locales ship: `en`, `fr`, `ar`.

**Overall: 4 / 10.** The architecture is right and the coverage is not, and the specific way the coverage fails makes it worse than having no Arabic at all.

---

### I18N-01 — Direction is resolved from locale metadata, server and client
**Good** · S3
**Evidence:** `pos/src/i18n/index.ts:23-38`; `pos/index.html:3-4`; `pos/src/App.tsx:32`

**What's happening:** each locale JSON declares `_meta.direction` (`ar.json:7`), `getActiveDirection()` reads it, `applyDocumentLocale()` sets `<html lang>` and `<html dir>`, and the Jinja template *also* sets `dir` server-side from a language list so the first paint is already correct.

**Why it matters:** setting `dir` only on the client produces a visible LTR→RTL flip on load, which is the classic RTL smell. Doing it in the template as well means an Arabic user never sees the wrong layout, not even for a frame. And deriving direction from locale data rather than a hardcoded language list in JS means adding Hebrew is a data change. This is better than most products manage.

**Targeted action:** none. Note the two lists must agree — `pos/index.html:3` hardcodes `['ar','he','fa','ur','ku']` while the client reads `_meta.direction`; adding a locale requires touching both. Worth a comment in each pointing at the other.

---

### I18N-02 — A third of Arabic is missing, and missing keys render as raw dot-notation
**Bad** · S1
**Evidence:** key counts — `en.json` 299, `fr.json` 274, `ar.json` **200**. Fallback behaviour at `pos/src/i18n/index.ts:68-71`:
```ts
if (typeof value !== 'string') {
  // Return the key itself as a fallback so missing translations are visible
  return key;
}
```

**What's happening:** Arabic is missing ~99 strings (33%), French ~25 (8%). When a key is missing, the UI renders the literal key — `payment.total_entered`, `tables.no_tables_found`.

**Why it matters:** the fallback strategy is correct for a *developer* and wrong for a *shipped product*, and this branch ships it. An Arabic-speaking cashier does not see a partially-translated interface, which would be usable; they see roughly one control in three replaced by an English-looking programming identifier in Latin script, embedded in RTL text. That is worse than pure English on every axis: it is unreadable, it is untranslatable by guessing, it breaks the RTL text run visually, and it looks broken rather than incomplete.

The comment says the goal is to make missing translations *visible*. That goal is right; production is the wrong place to achieve it.

**Better:** cascade instead of surrendering — locale → default locale → key, with the raw key reserved for development:
```ts
export function t(key: string, params?: Record<string, string | number>): string {
  const hit = lookup(activeLocale, key) ?? lookup(defaultLocale, key)
  if (hit == null) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`)
    return import.meta.env.DEV ? key : prettify(key)   // 'payment.total_entered' → 'Total entered'
  }
  return interpolate(hit, params)
}
```
This requires keeping `en.json` loaded as the fallback bundle — a few KB, and it converts every missing Arabic key from an identifier into a real English sentence.

**Targeted action:** (a) implement the English fallback in `t()` — this alone makes Arabic shippable; (b) add a CI check that fails when any locale's key set diverges from `en.json`, so the gap can never silently regrow; (c) fill the 99 Arabic and 25 French keys.

**Regression check:** the fallback changes what `t()` returns for missing keys everywhere at once. Any test asserting that `t('unknown.key') === 'unknown.key'` will break — that assertion should change, not the behaviour. Loading `en.json` as a permanent fallback adds it to every bundle including the Arabic one; verify the loader (`pos/src/i18n/loader.ts`) can hold two bundles without breaking its dynamic-import splitting.

---

### I18N-03 — Toasts are hardcoded LTR
**Bad** · S2
**Evidence:** `packages/ui/src/components/toast.tsx:62` (`rtl={false}`), and `position: 'top-right'` on all three helpers (lines 16, 31, 46)

**What's happening:** `ToastContainer` is constructed with `rtl={false}` regardless of document direction, and every toast is pinned to the top-right.

**Why it matters:** in an RTL layout the visual "start" is the right edge, so an Arabic user's toasts appear on the *trailing* side, with icon and text ordered against the reading direction. `rtl={false}` also disables react-toastify's own RTL handling of icon placement and progress-bar direction. The result is a notification that is legible but subtly wrong in a way that reads as machine-translated.

**Better:**
```diff
+ const isRtl = typeof document !== 'undefined' && document.dir === 'rtl'
  <ToastContainer
-   position="top-right"
-   rtl={false}
+   position={isRtl ? 'top-left' : 'top-right'}
+   rtl={isRtl}
```
The per-toast `position` in each helper should be dropped entirely and inherited from the container, so there is one place that decides.

**Targeted action:** derive `rtl` from `document.dir`; remove the three per-toast `position` overrides.

**Regression check:** `document.dir` is set by `applyDocumentLocale()` in `main.tsx` before render (`pos/src/i18n/index.ts:34-38`), so it is reliable at `ToastProvider` mount — but if `ToastProvider` is ever rendered before i18n init, it will read `ltr` and never update. Read it in a `useState` initialiser and, if direction can change without a reload, subscribe to it. `packages/ui` is shared with `frontend`, which has no i18n — `document.dir` is `ltr` there, so behaviour is unchanged.

---

### I18N-04 — RTL-unsafe spacing outnumbers logical spacing in the POS
**Bad** · S2
**Evidence:** in `pos/src/**/*.tsx`: **50** physical-direction utilities (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`) vs **31** logical ones (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`). Concrete instances: `pos/src/pages/Table.tsx:462` (`ml-2` on a room-count badge), `pos/src/components/PaymentDialog.tsx:241-242` (`ml-1` twice on the change-due figure).

**What's happening:** someone has clearly started migrating to logical properties — 31 uses is not accidental — but the physical majority remains, and new code is still being written with `ml-`/`mr-`.

**Why it matters:** in RTL, `ml-2` puts the gap on the wrong side. Individually invisible; in aggregate it produces the "everything is 4px off and the badges are on the wrong side" feel that makes an RTL build look like an afterthought. The badge beside a room tab and the change-due figure in the payment dialog are both high-frequency, high-attention spots.

**Better:** mechanical, low-risk, and lint-enforceable:
```diff
- <Badge variant="outline" className="ml-2 bg-white/60">
+ <Badge variant="outline" className="ms-2 bg-white/60">
```
`ms-*`/`me-*`/`ps-*`/`pe-*` are native Tailwind 3.3+ and compile to `margin-inline-start` etc., which are identical in LTR — so this migration is a **no-op for English users** and a real fix for Arabic ones. That combination (zero LTR risk) is what makes it worth doing in bulk.

**Targeted action:** codemod `ml-→ms-`, `mr-→me-`, `pl-→ps-`, `pr-→pe-`, `text-left→text-start`, `text-right→text-end` across `pos/src`. Handle `left-`/`right-` (absolute positioning) by hand — those need `start-`/`end-` and are easier to get wrong. Add an ESLint rule banning the physical set in `pos/`.

**Regression check:** `text-right` on numeric table columns is a special case — for numbers you often want them to stay end-aligned in both directions, which `text-end` gives you, but check the `DataTable` `align: "right"` path (`packages/ui/src/components/data-table.tsx:37`, `70`) deliberately. `LayoutView.tsx:21` reads `document.dir === 'rtl'` and presumably mirrors the floor plan manually — verify the codemod doesn't double-flip it. Screenshot the POS in Arabic before and after.

---

### I18N-05 — Money and numbers are locked to Indian conventions
**Bad** · S2
**Evidence:** `packages/core/src/format.ts:5` (`toLocaleString('en-IN')`), `:26-28` (hardcoded `L`/`Cr` suffixes); `frontend/src/pages/Reports/reportsRegistry.ts:19` (an `IndianRupee` icon used for "Daily P&L")

**What's happening:** grouping is hardcoded `en-IN` even though the currency *symbol* is configurable; the compact formatter emits lakh/crore unconditionally; a currency-specific glyph is used as the icon for a generic financial report.

**Why it matters:** the configurable symbol is the tell — someone anticipated multi-currency, but only the symbol was made variable. Set it to `$` and you get `$ 10,00,000` and chart axes reading `$4.2Cr`. The rupee icon in the reports sidebar is smaller but the same class of assumption: it hardcodes a currency into navigation chrome, where it will look wrong for any non-INR deployment and cannot be themed away.

**Better:** see [DS-08](01-design-system-foundations.md) for the `formatCurrency` fix. For compact:
```ts
// Intl does this correctly per-locale, including lakh/crore for en-IN
new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 }).format(amount)
```
`en-IN` + `notation: 'compact'` yields `1.2Cr` natively — so the correct implementation is *shorter* than the hand-rolled one and works everywhere. Swap `IndianRupee` for a neutral `Wallet` or `TrendingUp`.

**Targeted action:** replace the manual compact logic with `Intl.NumberFormat` compact notation; thread a `currencyLocale` setting alongside `currencySymbol`; swap the icon.

**Regression check:** `Intl` compact output differs slightly from the hand-rolled version (`₹6L` vs `6L`, spacing, and rounding at boundaries), and these strings appear on chart axes where width matters — check `frontend/src/components/reports/charts/*` for any hardcoded axis width or tick-formatter assumption. Keep the `symbol + space` prefix convention so existing layouts don't shift.

---

### I18N-06 — English strings hardcoded beside translated ones
**Bad** · S3
**Evidence:** `pos/src/components/TableCard.tsx:144` (`Preview`), `:154`/`:158` (`Printing...` / `Print`), `:125` (`Take away`); `pos/src/pages/Table.tsx:189` (`POS profile not loaded yet`), `:199` (`No active order found for this table`), `:83` (`Failed to load rooms`), `:152` (`Failed to load tables`); `pos/src/components/PaymentDialog.tsx:154` (`'Payment successful'`).

**What's happening:** these files use `t()` correctly for most strings — `TableCard` calls `t('tables.occupied')`, `t('tables.room')`, `t('tables.seats')` — and then hardcode English for the buttons and, notably, for **every error message**.

**Why it matters:** the pattern is consistent and revealing: the strings that got translated are the labels someone typed while building the layout; the ones that didn't are the strings typed while handling an error or wiring a button. Errors are the strings that matter most — a French cashier can infer what a button labelled "Print" does from its icon, but "POS profile not loaded yet" is unguessable and is precisely when they need to understand.

**Better:** move all of them into `en.json` under existing namespaces (`tables.*`, `errors.*`, `payment.*`), then mirror into `fr`/`ar`. Add the ESLint rule `no-literal-string` scoped to JSX text and to the arguments of `showToast.*`, which would have caught every one of these.

**Regression check:** adding keys is additive. Watch for collisions with existing keys, and note that `t()` currently returns the key on a miss — so a typo'd new key ships as `tables.preview` to *English* users too, until [I18N-02](#i18n-02)'s fallback lands. Do I18N-02 first.

# Localization (i18n) in URY

URY ships **English** and **Arabic** across all five frontends, plus a partial
French locale in the POS. Arabic is right-to-left, so localization here is both
translation *and* layout.

| App | Stack | Locale files | Arabic |
|---|---|---|---|
| `pos/` | React | `pos/src/i18n/locales/` | 100% |
| `frontend/` (dashboard) | React | `frontend/src/i18n/locales/` | 100% |
| `self-order/` | React | `self-order/src/i18n/locales/` | 100% |
| `urypos/` | Vue | `urypos/src/i18n/locales/` | 100% |
| `mosaic/` | Vue | `mosaic/src/i18n/locales/` | 100% |

Translations are per-app because the vocabularies barely overlap; the **rules**
are shared. Terminology is locked by [`arabic-glossary.md`](./arabic-glossary.md)
— Modern Standard Arabic grammar, Iraqi administrative/accounting terms.

## Architecture

The engine lives in `packages/core/src/i18n/engine.ts` (`createI18n`) and is
used by the three React apps. The two Vue apps sit outside the yarn workspace
and cannot import it, so each carries a dependency-free port of the same rules
in `src/i18n/index.js` — **keep the two in sync when changing behaviour.**

Language resolution order:

1. `localStorage['ury_language']` — the explicit in-app choice
2. `frappe.boot.lang` — the Frappe user/site preference
3. `'en'`

The in-app choice deliberately outranks Frappe: a cashier who picks Arabic in
the header must still get Arabic next load, even though their Frappe user
record still says English.

Text direction comes from each locale file's `_meta.direction`, which is the
single source of truth — **adding an RTL language needs no code change.** Never
reintroduce a hardcoded language list in a component.

`t()` is a plain function, not a hook, so switching language reloads the page:
the already-rendered tree holds strings from the old locale and cannot
re-render itself, and the reload re-applies `dir` alongside the text.

## Adding a string

1. Add the key to the app's `en.json`, then to `ar.json`.
2. Call it: `t('section.my_key')` in React, `$t('section.my_key')` in Vue.
3. Interpolate with `{{name}}`: `t('cart.pax', { count: 4 })`. **Every
   placeholder in the base string must appear in the translation** — the audit
   fails the build otherwise, because a dropped `{{amount}}` shows a wrong total.
4. Run the audit (below).

Never wrap a value that is not natural-language text: DocType names
(`'URY Menu'`), ERPNext record names shown so an admin can match them in Frappe
(`'Standard Buying'`), API field names, HTTP headers, or lucide icon ids
(`'Utensils'`). Translating those breaks the app rather than localizing it.

Strings used at **module scope** (column arrays, nav tables, registries) must be
resolved at render time — those modules are imported while `initI18n()` is still
in flight, so a top-level `t()` bakes in English. Use a function
(`getColumns()`) or a `labelKey` resolved in the component.

## Adding a language

1. Copy `en.json` to `<code>.json` and translate; set `_meta.direction`.
2. Add the code to the app's `i18n/config.ts` (or `SUPPORTED_LANGUAGES` in the
   Vue module). The switcher and loader pick it up automatically.
3. Label it with its **endonym** (`العربية`, not `Arabic`) — someone stuck in a
   language they cannot read still has to find their own.

## Auditing

```bash
python3 scripts/i18n_audit.py            # all apps
python3 scripts/i18n_audit.py pos        # one app
python3 scripts/i18n_audit.py --strict   # exit 1 on problems (for CI)
```

Reports keys used in source but missing from `en.json`, per-language coverage,
placeholder mismatches, and possibly-unused keys (check for dynamic keys such as
`t(\`reports.items.${id}\`)` before deleting any).

## RTL layout

- Use **logical** Tailwind utilities, never physical ones: `ms-`/`me-` not
  `ml-`/`mr-`, `ps-`/`pe-` not `pl-`/`pr-`, `start-`/`end-` not `left-`/`right-`,
  `text-start`/`text-end`, `border-s`/`border-e`. These are identical in LTR, so
  there is no reason to use the physical form.
- Do **not** add `isRTL ? ... : ...` branches around logical utilities — that
  double-flips and lands the element on the wrong side.
- Shared RTL/Arabic typography is `packages/ui/src/styles/rtl.css`, imported by
  the React apps and inlined in the Vue apps' `index.css`. It is inert unless
  `dir="rtl"`.
- Wrap non-language values (invoice ids, amounts, ratios, times) in
  `.bidi-isolate`. Without it the bidi algorithm can reorder `3 / 10` and show a
  cashier the wrong number.
- The Arabic font stack is system-only on purpose: a POS terminal is often
  offline, and a webfont that fails to load would drop Arabic to a default serif.

## Number and currency formatting

`packages/core/src/format.ts` formats against the active locale, registered by
each app after `initI18n()` via `setIntlLocale()`:

- Digit grouping follows the locale (`en-IN` keeps `12,34,567`; Arabic gets
  `1,234,567`).
- Arabic uses `ar-IQ-u-nu-latn` — **Western digits**, per the style guide.
- Compact chart labels keep lakh/crore for Indian locales only; everywhere else
  gets thousand/million/billion, localized via `setCompactSuffixes()`.

# Execution Plan: i18n System + AI Documentation

## Repository Summary (Analysis Complete)

- **pos/** — React 19 + TypeScript + Vite + Zustand. Production POS frontend. All strings hardcoded. No i18n infrastructure.
- **URYMosaic/** — Vue 3 KOT display app. Hardcoded strings in kot.vue / Header.vue. No i18n.
- **ury/** — Frappe Python backend. 35 doctypes, REST API in ury_pos/api.py.
- **urypos/** — Vue 3 legacy POS (v1). Out of scope for this task.

---

## Step 1 — Create i18n Infrastructure in pos/src/i18n/

Create the following files:

### `pos/src/i18n/config.ts`
Export a `DEFAULT_LANGUAGE = 'en'` and a `SUPPORTED_LANGUAGES` list.

### `pos/src/i18n/loader.ts`
- Dynamic `import()` of `./locales/${lang}.json`
- Returns the translation map
- Caches loaded locales to avoid repeated fetches

### `pos/src/i18n/index.ts`
- Exports `t(key: string, params?: Record<string, string>): string`
- Holds active locale map in module-level variable
- Exports `initI18n(lang: string): Promise<void>` to load and activate a locale
- Simple interpolation support: `t("key", { name: "Alice" })` → replaces `{{name}}`

### `pos/src/i18n/locales/en.json`
Full English translation file covering all hardcoded strings found across components.

### `pos/src/i18n/locales/fr.json`
French translations for the same keys.

**Key namespaces:**
- `common.*` — shared UI terms (Loading, Cancel, Save, etc.)
- `header.*` — search placeholders, menu items
- `cart.*` — cart labels, empty state, totals
- `order.*` — order actions, status labels
- `payment.*` — payment dialog strings
- `pos.*` — POS opening/closing, validation
- `errors.*` — all error messages
- `success.*` — all success messages

---

## Step 2 — Language Resolution Utility

### `pos/src/i18n/resolve-language.ts`
Priority chain:
1. Check `window.frappe?.boot?.lang` (Frappe boot object)
2. Check `localStorage.getItem('ury_language')`
3. Default to `'en'`

Returns resolved language string.

---

## Step 3 — Wire Into App Initialization

Modify `pos/src/main.tsx`:
- Call `resolveLanguage()` → `initI18n(lang)` before `ReactDOM.createRoot(...).render(...)`
- This ensures translations are loaded synchronously before first render

---

## Step 4 — Refactor Components

Replace hardcoded strings with `t()` calls in:

| File | Strings to replace |
|------|-------------------|
| `Header.tsx` | Search placeholders, Switch To Desk, Clear Cache, Logout |
| `OrderPanel.tsx` | Cart empty state, Submit, validation errors |
| `POS.tsx` | All/Special filter labels, hints |
| `PaymentDialog.tsx` | Payment labels, button text |
| `POSOpeningDialog.tsx` | Opening dialog strings |
| `CustomerSelect.tsx` | Placeholder, group/territory labels |
| `OrderTypeSelect.tsx` | Order type labels |
| `CommentDialog.tsx` | Placeholder, button labels |
| `store/pos-store.ts` | All `throw new Error(...)` and `showToast.*()` strings |
| `lib/order-api.ts` | Error/success toast messages |
| `lib/auth-api.ts` | Error messages |

**Rule:** Only change hardcoded user-visible strings. No logic changes.

---

## Step 5 — Create `pos/AGENTS.MD`

Comprehensive AI agent documentation covering:
1. Overview — what the POS app is
2. Tech stack — React 19, Vite, Zustand, Frappe SDK, Tailwind
3. Project structure — key folders and their purpose
4. Component architecture — patterns, reusability
5. Data flow — API → Zustand store → React components
6. API integration — frappe-sdk.ts patterns, auth/session
7. i18n system — how translations work, file locations, adding a language
8. Design principles — naming conventions, state rules
9. Guidelines for AI agents — safe modification rules, what not to break

---

## Step 6 — Create `pos/CLAUDE.MD`

Single line: `AGENTS.MD`

---

## Step 7 — Create root `AGENTS.MD`

At `/home/user/ury/AGENTS.MD`:
- App overview (Restaurant management suite)
- Backend structure: doctypes, fixtures, patches, www, public, templates, hooks
- Key modules: ury_order, ury_kot, ury_pos API
- Integration points: Frappe hooks, custom fields, POS profile
- Reference to `pos/AGENTS.MD` for frontend details
- Navigation guide for agents

---

## Step 8 — Create root `CLAUDE.MD`

Single line: `AGENTS.MD`

---

## Step 9 — Create `URYMosaic/AGENTS.MD`

At `/home/user/ury/URYMosaic/AGENTS.MD`:
- Overview: KOT (Kitchen Order Ticket) real-time display system
- Architecture: Vue 3 + Socket.io + Masonry layout
- Key components: kot.vue (main display), Header.vue
- API interactions: Frappe REST + Socket.io channels
- Data flow: socket event → fetchKOT() → reactive Vue data → DOM
- Extension points: adding new KOT types, production unit filtering
- Modification rules: socket channel naming, production field dependency

---

## Step 10 — Create `URYMosaic/CLAUDE.MD`

Single line: `AGENTS.MD`

---

## Step 11 — Git: Branch, Commit, Push

- Checkout/create branch `claude/i18n-system-ai-docs-JRwIz`
- Commit all changes with descriptive message
- Push to `origin claude/i18n-system-ai-docs-JRwIz`

---

## Files Created/Modified (Summary)

**New files:**
- `pos/src/i18n/config.ts`
- `pos/src/i18n/index.ts`
- `pos/src/i18n/loader.ts`
- `pos/src/i18n/resolve-language.ts`
- `pos/src/i18n/locales/en.json`
- `pos/src/i18n/locales/fr.json`
- `pos/AGENTS.MD`
- `pos/CLAUDE.MD`
- `AGENTS.MD` (root)
- `CLAUDE.MD` (root)
- `URYMosaic/AGENTS.MD`
- `URYMosaic/CLAUDE.MD`

**Modified files:**
- `pos/src/main.tsx` — add i18n init
- `pos/src/components/Header.tsx` — use t()
- `pos/src/components/OrderPanel.tsx` — use t()
- `pos/src/pages/POS.tsx` — use t()
- `pos/src/components/PaymentDialog.tsx` — use t()
- `pos/src/components/POSOpeningDialog.tsx` — use t()
- `pos/src/components/CustomerSelect.tsx` — use t()
- `pos/src/components/CommentDialog.tsx` — use t()
- `pos/src/store/pos-store.ts` — use t() in error strings
- Additional components as strings are found

---

## Constraints

- No new npm packages — pure TypeScript with dynamic import()
- No breaking changes to component interfaces or API calls
- Translations keys are structured, not flat
- French locale covers the same key set as English
- All documentation is written for AI agents, not humans

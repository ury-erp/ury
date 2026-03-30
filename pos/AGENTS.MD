# POS Frontend — Agent Documentation

## 1. Overview

This is the **URY POS v2** — a React 19 single-page application that serves as the primary point-of-sale interface for the URY restaurant management system. It runs as a Frappe web page served at `/pos` and communicates exclusively with the Frappe/ERPNext backend via REST API calls.

**Responsibilities:**
- Taking and managing restaurant orders (Dine-In, Takeaway, Delivery/Aggregator)
- Real-time menu display with category/course filtering
- Cart management with item customization (variants, add-ons, comments)
- Payment processing with multi-mode split payment support
- Order history viewing, editing, and cancellation
- Table management for dine-in
- Invoice printing (HTML and thermal via QZ Tray)
- POS opening/closing session tracking

---

## 2. Tech Stack

| Concern | Library / Version |
|---|---|
| UI framework | React 19.0.0 + TypeScript 5.7.2 |
| Build tool | Vite 6.2.0 |
| State management | Zustand 5.0.6 |
| Routing | React Router DOM 6.30.1 |
| Styling | Tailwind CSS 3.4.17 |
| Backend API | frappe-js-sdk 1.10.0 |
| Notifications | react-toastify 11.0.5 |
| Thermal printing | qz-tray 2.2.5 |
| Icons | lucide-react |
| Accessible UI primitives | @radix-ui/react-select |

Build output is written to `../ury/public/pos/` and the HTML entry point is `../ury/www/pos.html`.

---

## 3. Project Structure

```
pos/
├── src/
│   ├── main.tsx              # Entry point — initialises i18n then mounts React
│   ├── App.tsx               # Root component, routing, auth guard
│   ├── index.css             # Global Tailwind imports
│   │
│   ├── pages/
│   │   ├── POS.tsx           # Main ordering interface (menu + order panel)
│   │   ├── Orders.tsx        # Order history, cancel, edit, print, pay
│   │   └── Table.tsx         # Table layout spatial view
│   │
│   ├── components/           # All UI components
│   │   ├── ui/               # Headless/primitive components (Button, Input, Dialog…)
│   │   ├── Header.tsx        # Top bar: logo, search, user menu
│   │   ├── Sidebar.tsx       # Left nav: menu categories / courses
│   │   ├── MenuList.tsx      # Grid of MenuCard items
│   │   ├── MenuCard.tsx      # Single menu item card
│   │   ├── OrderPanel.tsx    # Right panel: cart, totals, submit
│   │   ├── PaymentDialog.tsx # Split-payment modal
│   │   ├── ProductDialog.tsx # Item variant/add-on customisation modal
│   │   ├── CustomerSelect.tsx# Customer search + new customer form
│   │   ├── OrderTypeSelect.tsx # Dine In / Takeaway / Aggregators toggle
│   │   ├── AggregatorSelect.tsx# Aggregator platform selector
│   │   ├── TableSelectionDialog.tsx # Table picker for dine-in
│   │   ├── CommentDialog.tsx # Order-level comment editor
│   │   ├── POSOpeningDialog.tsx # POS not opened / not closed error screen
│   │   ├── POSOpeningProvider.tsx  # Checks POS opening entry on mount
│   │   ├── OrderStatusSidebar.tsx  # Status filter tabs (Draft, Paid…)
│   │   ├── AuthGuard.tsx     # Redirects unauthenticated users
│   │   ├── InitialLoader.tsx # Splash screen during boot
│   │   ├── Spotlight.tsx     # Keyboard shortcut overlay
│   │   └── LayoutView.tsx    # Spatial table layout renderer
│   │
│   ├── store/
│   │   ├── pos-store.ts      # Primary Zustand store (menu, cart, order state)
│   │   ├── root-store.ts     # Root store (user, orders list, search)
│   │   └── slices/
│   │       ├── auth-slice.ts
│   │       ├── config-slice.ts
│   │       └── orders-slice.ts
│   │
│   ├── lib/                  # API wrappers and utilities
│   │   ├── frappe-sdk.ts     # Frappe SDK instance (call, db, auth)
│   │   ├── menu-api.ts       # getRestaurantMenu, getAggregatorMenu
│   │   ├── order-api.ts      # syncOrder, cancelOrder, getTableOrder
│   │   ├── payment-api.ts    # getPaymentModes
│   │   ├── invoice-api.ts    # printInvoice, makePayment
│   │   ├── pos-profile-api.ts# getCombinedPosProfile, getCurrencyInfo
│   │   ├── pos-opening-api.ts# checkPOSOpening
│   │   ├── customer-api.ts   # searchCustomers, addCustomer
│   │   ├── aggregator-api.ts # getAggregators
│   │   ├── table-api.ts      # getTables, getRooms
│   │   ├── print.ts          # HTML invoice printing
│   │   ├── print-qz.ts       # QZ Tray thermal print
│   │   ├── role-utils.ts     # Role permission checks
│   │   ├── utils.ts          # formatCurrency, cn (classnames)
│   │   └── storage.ts        # localStorage/sessionStorage helpers
│   │
│   ├── data/
│   │   ├── order-types.ts    # DINE_IN, TAKEAWAY, AGGREGATORS constants
│   │   ├── doctypes.ts       # Frappe doctype name constants
│   │   └── menu-data.ts      # Static menu structure types
│   │
│   └── i18n/                 # Internationalisation system (see §7)
│       ├── index.ts
│       ├── config.ts
│       ├── loader.ts
│       ├── resolve-language.ts
│       └── locales/
│           ├── en.json
│           └── fr.json
│
├── public/                   # Static assets (favicon, logos)
├── index.html                # HTML entry point
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## 4. Component Architecture

**Patterns used:**
- **Container / presentational split** — pages (POS.tsx, Orders.tsx) own data-fetching and state; components receive props or subscribe to stores.
- **Zustand stores** — global state is in `pos-store` (POS session) and `root-store` (auth + orders). Components use `usePOSStore()` and `useRootStore()` hooks.
- **No prop-drilling beyond one level** — components access the store directly rather than having state threaded through many levels.
- **Dialog pattern** — modals (PaymentDialog, ProductDialog, CommentDialog) are rendered conditionally with a boolean flag and mounted/unmounted, not hidden via CSS.

**Reusability approach:**
- `ui/` components are headless: they apply className merging via `cn()` but carry no business logic.
- Business components (e.g., `CustomerSelect`) contain their own local state and API calls when the logic is highly specific to that widget.

---

## 5. Data Flow

```
Frappe REST API
      │
      ▼
lib/*.ts API wrappers  (call.get / call.post / fetch)
      │
      ▼
Zustand stores  (pos-store, root-store)
      │
      ├── pos-store: menu items, cart (activeOrders), POS profile,
      │             selected table/customer/order type, payment modes
      │
      └── root-store: current user, orders list (pagination),
                      selected order detail, search query
      │
      ▼
React components subscribe via hooks
      │
      ▼
UI renders
```

**Key flows:**
1. **Boot:** `main.tsx` → `initI18n()` → `App.tsx` → `AuthGuard` checks session → `POSOpeningProvider` checks POS opening entry → store hydrates menu + profile.
2. **Add to cart:** click `MenuCard` → `usePOSStore().addToOrder()` → re-render `OrderPanel`.
3. **Submit order:** `OrderPanel.handleSubmit` → validate → `syncOrder()` → Frappe API → `resetOrderState()`.
4. **Payment:** `Orders.tsx` opens `PaymentDialog` → `call.post(make_invoice)` → `fetchOrders()`.

---

## 6. API Integration

**SDK initialisation** (`lib/frappe-sdk.ts`):
```typescript
const frappe = new FrappeApp(import.meta.env.VITE_FRAPPE_BASE_URL);
export const call = frappe.call();  // RPC-style POST/GET
export const db   = frappe.db();    // CRUD
export const auth = frappe.auth();  // login/logout/getLoggedInUser
```

**Calling a whitelisted Python method:**
```typescript
// GET
call.get('ury.ury_pos.api.getRestaurantMenu', { pos_profile, room })

// POST
call.post('ury.ury.doctype.ury_order.ury_order.sync_order', orderData)
```

**Error handling pattern:**
Frappe wraps server errors in `_server_messages` (double-JSON-encoded string). Components parse this:
```typescript
const messages = JSON.parse(error._server_messages);
const msg = JSON.parse(messages[0]).message;
```

**Auth / session:** Session cookie is managed by Frappe. No JWT. The SDK's `auth.getLoggedInUser()` call validates the session; failure redirects to `/login?redirect-to=%2Fpos`.

---

## 7. i18n System

### How it works

Translations live in `src/i18n/locales/*.json`. A lightweight custom engine (no external library) provides:

- `t(key)` — resolves a dot-notation key against the active locale map.
- `t(key, params)` — interpolates `{{placeholder}}` tokens.
- Falls back to the key string itself if a translation is missing (visible but non-breaking).

### Initialisation

In `main.tsx`, before React mounts:
```typescript
import { initI18n } from './i18n';
initI18n().then(() => ReactDOM.createRoot(...).render(...));
```

`initI18n()` calls `resolveLanguage()` which checks (in priority order):
1. `window.frappe.boot.lang` — Frappe/ERPNext system language
2. `localStorage.getItem('ury_language')` — manual override
3. `'en'` — default fallback

### File locations

```
src/i18n/
├── config.ts           — DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES map
├── loader.ts           — dynamic import() with per-language cache
├── resolve-language.ts — priority-based language resolution
├── index.ts            — t(), initI18n(), getActiveLanguage()
└── locales/
    ├── en.json         — English (source of truth)
    └── fr.json         — French
```

### Key namespaces in locale files

| Namespace | Contents |
|---|---|
| `common` | Loading, Cancel, Save, Apply, Change… |
| `header` | Search placeholders, Switch To Desk, Logout… |
| `menu` | Filter labels (All, Special Items) |
| `cart` | Empty state, button labels, hints |
| `order` | Order detail labels, cancel dialog |
| `payment` | Payment dialog labels, discount, summary |
| `pos` | POS opening/closing dialog |
| `customer` | Customer search and form labels |
| `comment` | Comment dialog |
| `errors` | All error messages |
| `success` | All success/info messages |

### Adding a new language

1. Create `src/i18n/locales/<lang-code>.json` copying the structure of `en.json`.
2. Translate all values (do not change keys).
3. Add the language to `SUPPORTED_LANGUAGES` in `config.ts`:
   ```typescript
   export const SUPPORTED_LANGUAGES = { en: 'English', fr: 'Français', de: 'Deutsch' };
   ```
4. The loader will dynamically import the file on demand. No other changes needed.

---

## 8. Design Principles

**Naming conventions:**
- Components: PascalCase, one component per file named identically.
- Zustand stores: `use<Name>Store` hooks, state slices in `store/slices/`.
- API wrappers: `lib/<domain>-api.ts`, exported as named functions (`getX`, `createX`, `syncX`).
- Constants: SCREAMING_SNAKE_CASE in `data/` files.
- CSS: Tailwind utility classes only; no custom CSS except in `index.css` and `ui/toast.css`.

**Component boundaries:**
- Components do not import from other components' subdirectories — they import from `../components/<Name>` or `../components/ui`.
- Store slices are combined in `root-store.ts` — add new slices there, not as separate stores.

**State handling rules:**
- POS session state (cart, menu, profile) → `pos-store`.
- Cross-page state (user, orders list, search) → `root-store`.
- Transient UI state (dialog open, loading flag) → component `useState`.
- Never store derived values in state — compute them in component or via selectors.

---

## 9. Guidelines for AI Agents

### Safe to modify
- Adding new `t()` keys: add to `en.json` and `fr.json` simultaneously, then use in component.
- UI text changes: always go through `t()`, never hardcode.
- Adding new components: follow the existing pattern — named export, TypeScript props interface, Zustand for data.
- Adding new API wrappers: add to the appropriate `lib/*-api.ts` file.
- Styling changes: Tailwind classes only.

### How to add a new feature
1. Define new state in the appropriate store slice.
2. Add API call in `lib/`.
3. Create or modify component.
4. Add translation keys to both `en.json` and `fr.json`.
5. No need to modify `main.tsx`, `App.tsx`, or `vite.config.ts` for typical features.

### What NOT to break
- **`frappe-sdk.ts`** — do not change how `call`, `db`, `auth` are exported; every API file depends on them.
- **`pos-store.ts` `resetOrderState()`** — called after every successful order submit/payment; must reset all transient order fields.
- **`main.tsx` init sequence** — `initI18n()` must resolve before `ReactDOM.render()`.
- **`AuthGuard`** — do not bypass or remove; it protects the entire app.
- **`POSOpeningProvider`** — do not remove; it prevents use of POS without a valid opening entry.
- **Order type constants** (`DINE_IN`, `TAKEAWAY`, `AGGREGATORS`) — these are used in API payloads sent to Frappe; do not rename without updating the backend.
- **`uniqueId` on cart items** — used as React keys and for `updateQuantity`/`removeFromOrder`; must remain stable per cart item.

### Common pitfalls
- Frappe API errors come in `error._server_messages` (double-encoded JSON), not `error.message`. Use the existing error parsing pattern in `OrderPanel.tsx`.
- `posProfile` can be `null` during initialisation. Always null-check before reading `.name`, `.cashier`, etc.
- QZ Tray printing requires `qz_print === 1` on the POS profile. Check `posProfile.qz_print` before calling `print-qz.ts`.
- Do not add dependencies to `package.json` without confirming the build still outputs to `../ury/public/pos/`.

# @ury/core — Agent Documentation

## 1. Overview

`@ury/core` is the **framework-agnostic shared utility package** for URY's React frontends (`pos/`, `frontend/`). It contains no React code — only TypeScript utilities for talking to the Frappe backend, session/role handling, local storage, formatting, and QZ-Tray thermal-print transport.

- **Workspace package** (yarn classic workspaces, declared at repo root). Consumed as `"@ury/core": "*"`.
- **Source-linked**: `package.json` `exports` points directly at `./src/index.ts`. There is no build step — the consuming app's Vite/TypeScript (`moduleResolution: "bundler"`) compiles the package source. Edits are picked up instantly by `vite dev`.
- **Peer dependencies**: `frappe-js-sdk`, `axios`, `qz-tray`, `jsrsasign` — the consuming app must declare them (see §4).
- Typecheck standalone with `yarn workspace @ury/core typecheck`.

The React component counterpart is `@ury/ui` (`packages/ui/`): components, theme tokens, Tailwind preset. `@ury/ui` does **not** depend on `@ury/core`.

## 2. Module map

```
packages/core/src/
├── index.ts            ← public barrel — import ONLY from '@ury/core'
├── types.ts            ← User, PosProfileCombined (shared doctype shapes)
├── frappe/
│   ├── client.ts       ← createFrappeClient() factory + call/db/auth singletons
│   ├── auth.ts         ← getLoggedUser(), getUserRoles(), logout()
│   └── roles.ts        ← isUserRestrictedFromTableOrders(), canCaptainTransfer()
├── storage.ts          ← storage: localStorage wrapper (+ POS-profile helpers)
├── format.ts           ← formatCurrency(), formatInvoiceTime()
└── print/
    └── qz.ts           ← initPrinting(), loadQzPrinter(), printWithQz(), disconnectQzPrinter()
```

## 3. Features and usage

### Frappe client (`frappe/client.ts`)
- `createFrappeClient(baseUrl?)` — wraps `new FrappeApp(baseUrl)` from frappe-js-sdk. `baseUrl` defaults to `import.meta.env.VITE_FRAPPE_BASE_URL`; when unset (production, served from the Frappe site itself), the SDK falls back to same-origin and picks up the `window.csrf_token` injected by the app's Jinja `index.html`.
- Module-level singletons for the default client: `call` (RPC to whitelisted methods), `db` (doc CRUD), `auth` (session).

```ts
import { call, db } from '@ury/core';
const menu = await call.get('ury.ury_pos.api.getRestaurantMenu', params);
const profile = await db.getDoc('POS Profile', name);
```

Dev setup: set `VITE_FRAPPE_BASE_URL` in the app's `.env.local` to point at the bench site.

### Auth (`frappe/auth.ts`)
- `getLoggedUser()` → current session user's email, or `null` on error.
- `getUserRoles()` → `{ roles: string[], full_name }` read from the Frappe page boot payload (`frappe.boot.user`).
- `logout()` → ends the Frappe session.

All three swallow errors (log + safe fallback) — callers branch on the return value, not try/catch.

### Role permissions (`frappe/roles.ts`)
- `isUserRestrictedFromTableOrders(user, posProfile)` — true if the user holds any role in the profile's `role_restricted_for_table_order` table.
- `canCaptainTransfer(user, posProfile)` — true if the user holds any role in `transfer_role_permissions`.

Both take the shared `User` and `PosProfileCombined` types from `types.ts` (structural — apps may pass their own compatible shapes).

### Storage (`storage.ts`)
`storage` object over `localStorage`: generic `setItem`/`getItem`/`removeItem` plus `savePosProfileFull`/`getPosProfileFull` (JSON round-trip under the `pos_profile` key).

### Formatting (`format.ts`)
- `formatCurrency(amount)` — prefixes the symbol stored under the `currencySymbol` localStorage key (apps must seed it, e.g. after loading the POS profile).
- `formatInvoiceTime(timestamp)` — locale time for ISO datetimes, handles bare `HH:MM:SS` strings, returns `'No bill activity yet'` for null.

### QZ-Tray printing (`print/qz.ts`)
Transport + signing mechanics only; domain print orchestration (e.g. pos's `printOrder`) stays in the app.

- `initPrinting({ signKey })` — **must be called once at app startup before any print**. The RSA signing key is injected; it lives in the consuming app (e.g. `pos/privateKey.ts`) and must NEVER be moved into `packages/`. `printWithQz` throws a clear error if used uninitialized.
- `printWithQz(host, html)` — signs (SHA512withRSA via jsrsasign), connects if needed, prints HTML to the default printer.
- `loadQzPrinter(host)` / `disconnectQzPrinter()` — explicit websocket lifecycle. The certificate is fetched from `/assets/ury/files/cert.pem`.

```ts
// main.tsx
import { initPrinting } from '@ury/core';
import { privateKey } from '../privateKey';
initPrinting({ signKey: privateKey });
```

## 4. Rules for agents

- **Import only from the barrel** `'@ury/core'`, never deep paths into `src/`.
- **Keep it framework-agnostic**: no React, no JSX, no app state, no domain API wrappers (order/table/invoice APIs belong in the app, e.g. `pos/src/lib/`).
- **Peer deps**: anything imported at module level here must be a `peerDependency` (with a matching `devDependency` for standalone typecheck), and every consuming app must declare it — the barrel pulls all modules, so even a non-printing app currently needs `qz-tray`/`jsrsasign`/`axios` at build time. If that becomes painful, split subpath exports (e.g. `@ury/core/print`) rather than dropping the peers.
- **No secrets**: keys, certs, and credentials stay in consuming apps and are injected (the `initPrinting` pattern).
- **Don't rename exports** without updating all consumers (`pos/`, `frontend/`) in the same change; run `yarn workspace @ury/core typecheck` plus each app's `tsc -b` and `yarn build`.
- `import.meta.env` usage is confined to `frappe/client.ts` — keep it that way (it ties the file to Vite consumers; the factory's explicit `baseUrl` parameter is the escape hatch).

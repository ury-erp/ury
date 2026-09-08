# Serve Frontend — Agent Documentation

## 1. Overview

**URY Serve** is a React 19 staff SPA for table and takeaway order taking. Frappe serves it at `/ury/serve`. It talks to the existing URY/POS APIs through `@ury/core`.

**In scope**

- Session auth and Serve access roles
- POS opening / prior-day close checks and Opening checklist
- Room and table status, ownership, search, refresh
- Menu, variants, add-ons, qty, comments, customers, pax
- Cart submit and edit against live APIs
- Table / captain transfers, bill print, KOT reprint where permissions allow
- Notifications and optional printer-watch health UI
- Installable PWA shell with online-only orders

**Out of scope**

- Cashier Order Log / recent-order list
- Payment settlement and split-payment UI
- POS open/close cash drawer workflows (those stay in `/pos`)

Do not claim full RN parity or a finished test gate while the frontend is still under change.

## 2. Tech stack

| Concern | Choice |
|---------|--------|
| UI | React 19 + TypeScript |
| Build | Vite 6 |
| State | Zustand |
| Routing | React Router DOM (`basename="/ury/serve"`) |
| Style | Tailwind + `@ury/ui` theme / preset |
| API | `frappe-js-sdk` via `@ury/core` |
| Print transport | `qz-tray` via `@ury/core` `initPrinting` / `printWithQz` |

Build output: `../ury/public/serve/`. HTML entry copy: `../ury/www/serve.html`.

Root workspace: package name `serve`. Root scripts: `ury-serve-build` and the main `yarn build` chain.

## 3. Routes (Frappe)

`ury/hooks.py` registers Serve **before** the `/ury/<path>` catchall:

- `/ury/serve`, `/ury/serve/`, `/ury/serve/<path>` → www page `serve`
- `/ury/serve/sw.js` → www page `serve-sw.js` (service worker)

SPA routes (client):

- `/` — tables
- `/table/:table` — table order
- `/takeaway` — takeaway order

## 4. Project structure

```
serve/
├── public/                 # PWA assets (platform-owned): sw.js, offline.html, manifest, icons
├── src/
│   ├── main.tsx            # i18n, QZ init, registerServiceWorker, mount
│   ├── App.tsx             # AuthGuard → ServeRouteGuard → routes
│   ├── pwa.ts              # registerServiceWorker (platform-owned)
│   ├── pages/              # Tables.tsx, Order.tsx
│   ├── components/         # Serve* / Captain* UI, AuthGuard, ServeRouteGuard
│   ├── operations/         # Opening checklist, notifications, printer watch UI
│   ├── store/              # serve-store + auth/config slices
│   ├── lib/                # Domain API wrappers (menu, order, table, print, …)
│   ├── hooks/              # Captain / table-order context
│   ├── data/               # Order-type and doctype constants
│   └── i18n/
├── privateKey.ts           # Empty stub for optional QZ sign key (do not commit secrets)
├── index.html              # Jinja CSRF/boot + manifest link
└── vite.config.ts          # outDir ../ury/public/serve
```

Platform-owned (do not rewrite casually): `public/*`, `src/pwa.ts`, Frappe `www/serve*`, hooks Serve rules, root workspace wiring.

## 5. Shared packages and POS extraction

- Import UI from `@ury/ui` only (barrel). Import utils from `@ury/core` only (barrel).
- Consumer Tailwind `content` must include `../packages/ui/src/**/*.{ts,tsx}`.
- **Never** import Serve from `pos/` source, or POS from `serve/` source.
- If a POS-only presentational piece is reusable, move it into `@ury/ui`, export it from the UI barrel, and update POS to use the shared component. Keep domain/API logic in each app’s `lib/`.

## 6. Auth, roles, opening, checklist

Entry stack: `AuthGuard` → `ServeRouteGuard` → `AppBoot` → router.

**AuthGuard**

- Requires a logged-in Frappe user and a resolvable POS Profile.
- Access roles: fixed set `URY Captain`, `URY Cashier`, `URY Manager`, plus any roles named on the POS Profile permission child tables (`config-slice.ts`).

**ServeRouteGuard**

- Loads captain context (`canTakeTableOrders`, opening state, profile, user).
- Blocks when POS is not open, prior day is not closed, or table-order capability is false.
- Shows `OpeningChecklist` (`ury.ury_pos.api.get_checklist` / `submit_checklist`, type `Opening`) until ready.
- Mounts `ServiceRequestPanel` after the checklist clears.

## 7. Orders: online only

- Submit path uses `syncOrder` against the live API (`Order.tsx`). A `submitting` flag blocks duplicate taps.
- There is no offline order queue and no replay store.
- PWA service worker scope is `/ury/serve/` only. It must not control `/pos`, `/ury`, or `/ury/order`.
- It does not cache `/api/*` or CSRF HTML. Offline navigations get `public/offline.html` (“Connection required”).

## 8. Printing and QZ

`src/lib/print.ts` picks transport from POS Profile `print_type`:

| `print_type` | Mechanism |
|--------------|-----------|
| `qz` | `printWithQz(qz_host, html)` after `initPrinting({ signKey })`, then `qz_print_update` |
| `network` | `network_printing` / `select_network_printer` — honor Success / error string; already marks printed |
| `socket` (default) | `ury.ury.api.ury_print.print_pos_page` — realtime `print_{branch}` to desk print stations; marks printed server-side |

Do **not** open `/printview` and then mark printed. Socket transport must call `print_pos_page`.

**QZ configuration (supported, no secrets in git)**

1. POS Profile: set `print_type` to `qz` and set `qz_host`.
2. At app boot (`main.tsx`): call `initPrinting({ signKey })` when a key exists.
3. Key sources (first match wins):
   - Env `VITE_QZ_SIGN_KEY` (local/CI secret, not committed)
   - Optional non-empty `serve/privateKey.ts` (repo stub stays empty)
4. `@ury/core` loads the public cert from `/assets/ury/files/cert.pem`.
5. If QZ is not initialized, QZ print fails with a clear config error. Network / socket paths still work.

Never put private keys in `packages/` or in documentation samples.

## 9. Printer watch (optional)

`src/operations/api/printers.ts` calls `ury_printer_watch` when that app is installed.

- If the module is missing, health status is `unavailable` with an explicit message. Do not treat that as an empty healthy list.
- Job listing and status badges are UX only. They are not required to take orders.

## 10. Agent rules

- Prefer existing URY POS API contracts. Do not invent parallel backends for Serve.
- Keep Serve free of cashier Order Log and settlement UI.
- Preserve draft cart state on submit errors. Block double submit while `submitting` is true.
- After shared UI moves, typecheck `@ury/ui` and rebuild affected apps.
- Do not edit generated `ury/public/serve` or `ury/www/serve.html` by hand. Use `yarn build`.
- Do not commit secrets (`.env`, filled `privateKey.ts`, cert private material).

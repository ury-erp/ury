# URY — Root Agent Documentation

## 1. App Overview

**URY** is a complete restaurant order management system built as a Frappe/ERPNext custom app.

- **Publisher:** Tridz Technologies Pvt. Ltd
- **Requires:** ERPNext (must be installed in the Frappe bench)
- **Version:** 3.0.0-beta.1 (source of truth: `ury/__init__.py`)
- **License:** MIT

The system covers the full restaurant workflow: menu management, table management, order taking (POS), kitchen display (KOT), payments (integrated with ERPNext POS), P&L reporting, multi-branch support, mobile captain workflows, payment terminals, and customer self-ordering.

Detailed module architecture is documented in each module's `ARCHITECTURE.md`. Shared engineering rules live in `docs/AI_ENGINEERING_GUIDE.md`.

---

## 2. Repository Structure

```
ury/                          ← repo root
├── ury/                      ← Frappe app Python package (main backend)
├── packages/                 ← Shared frontend packages (Yarn workspaces)
│   ├── core/                 ← @ury/core: Frappe client, auth/roles, storage, formatting, validation, QZ transport
│   └── ui/                   ← @ury/ui: shared React components, theme.css, Tailwind preset
├── pos/                      ← React 19 POS v2 + mobile captain UI, served at /pos
├── frontend/                 ← React 19 URY management/setup/reporting UI, served at /ury
├── self-order/               ← React 19 QR/tablet/kiosk ordering UI, served at /order
├── mosaic/                   ← Vue 3 KOT kitchen display app
├── urypos/                   ← Vue 3 POS v1 (legacy)
├── DEMO/                     ← Demo screenshots/assets
├── requirements.txt          ← Python dependencies
├── setup.py                  ← Python package setup
├── package.json              ← Yarn classic workspace root
└── FEATURES.md / README.md   ← Human-readable product documentation
```

Root `package.json` defines Yarn classic workspaces for `packages/*`, `pos`, `frontend`, and `self-order` with one root `yarn.lock` and hoisted `node_modules`. The Vue apps (`urypos/`, `mosaic/`) are not workspace members; they keep their own lockfiles and are installed by the root `postinstall` script. Shared packages are source-linked and compiled by the consuming React apps.

---

## 3. Frappe Backend Structure (`ury/`)

```
ury/
├── hooks.py                  ← App registration, routes, doc_events, scheduler, fixtures
├── patches.txt               ← Migration patch list
├── setup_customizations.py   ← Standard-DocType custom fields and install setup
├── role_permissions.py       ← Default role provisioning
├── install.py                ← Post-install entry point
├── uninstall.py              ← Cleanup on app removal
├── permission.py             ← App-screen visibility check only
│
├── ury_pos/
│   └── api.py                ← Compatibility-sensitive POS REST/RPC surface
│                               Legacy methods include getRestaurantMenu,
│                               getBranch, getPosProfile, getInvoiceForCashier,
│                               opening/closing/checklist and bill operations
│
├── ury/
│   ├── doctype/              ← URY custom Frappe DocTypes
│   ├── hooks/                ← Event handlers for standard ERPNext DocTypes
│   │   ├── ury_pos_invoice.py
│   │   ├── ury_pos_profile.py
│   │   ├── ury_sales_invoice.py
│   │   ├── ury_item.py
│   │   ├── ury_pos_opening_entry.py
│   │   └── ury_pos_closing_entry.py
│   ├── api/                  ← Modular domain APIs
│   │   ├── ury_kot_display.py
│   │   ├── ury_kot_generate.py
│   │   ├── ury_kot_reprint.py
│   │   ├── ury_kot_order_number.py
│   │   ├── ury_kot_validation.py
│   │   ├── ury_kot_notification.py
│   │   ├── ury_waiter_print.py / ury_print.py
│   │   ├── ury_dashboard.py / ury_service_line.py
│   │   ├── pos_pin.py / payment_terminal.py
│   │   ├── self_ordering.py
│   │   └── minimal/          ← Organization/business setup APIs
│   ├── report_api/           ← Modular management report endpoints
│   ├── controllers/          ← Web/session controllers such as setup redirect
│   └── page/
│       └── websocket_print/  ← Real-time print page
│
├── www/                      ← Web context providers and generated SPA entries
├── public/                   ← Static assets and generated frontend bundles
├── fixtures/                 ← Exported Frappe fixtures
├── templates/                ← Jinja templates
└── patches/
    └── v2_0/                 ← Idempotent post-model-sync migrations
```

Architectural boundaries:

- `hooks.py` registers behavior; it must not contain business logic.
- `ury_pos/api.py` is a legacy public contract. Preserve its existing camelCase RPC names. Put new independent capabilities in a focused `ury/ury/api/<domain>.py` module.
- A DocType controller owns invariants for that document.
- `ury/ury/hooks/` extends standard ERPNext DocTypes and should delegate cohesive work to named helpers.
- `ury/ury/report_api/` owns protected report APIs and shared report/date/query rules.
- `ury/www/*.py` returns boot context and page access only; it must not contain order, payment, stock, or authorization business logic.

---

## 4. Key DocTypes

| DocType | Purpose |
|---|---|
| `URY Order` | Core order document, linked to a POS Invoice on payment. |
| `URY Order Item` | Line items for URY Order. |
| `URY KOT` | Kitchen Order Ticket generated when an order is placed or modified. |
| `URY KOT Items` | Line items for a KOT. |
| `URY KOT Error Log` | Operational KOT error tracking. |
| `URY Menu` | Menu linked to a Restaurant and Price List. |
| `URY Menu Item` | Menu item, price, image, course, and availability. |
| `URY Menu Course` | Course grouping and KDS serving priority. |
| `URY Restaurant` | Restaurant master record. |
| `URY Table` | Restaurant table, status, shape, and layout. |
| `URY Room` | Room/section within a restaurant. |
| `URY Production Unit` | Kitchen/production routing and KDS configuration. |
| `URY Printer Settings` | Thermal/network printer configuration. |
| `URY User` | User/waiter/cashier assignment to Branch and Room. |
| `Aggregator Settings` | Delivery platform configuration. |
| `Item Add On` | Menu item modifier/add-on. |
| `POS Item Variants` | Size/variant choices for menu items. |
| `URY Daily P and L` | Daily P&L calculation. |
| `URY Cost of Goods` | COGS tracking. |
| `Sub POS Closing` | Per-cashier closing and reconciliation. |
| `URY POS Checklist Log` | Shift/opening/closing checklist record. |
| `URY POS PIN Settings` / `URY POS PIN Audit` | Scoped POS PIN login and audit. |
| `URY POS Terminal` | Physical/logical POS terminal configuration. |
| `URY Payment Terminal` / `URY Payment Terminal Transaction` | Payment provider configuration and transaction state. |
| `URY Self Ordering Profile` | Customer self-ordering configuration. |
| `URY Ordering Device` / `URY Ordering Session` | Provisioned devices and scoped customer sessions. |
| `URY Service Request` | Customer-to-staff service request. |

Custom fields on standard ERPNext DocTypes are defined programmatically in `ury/setup_customizations.py` and selected as fixtures in `ury/hooks.py`. Important targets include:

- `POS Invoice` / `Sales Invoice`: order type, waiter, pax, cashier, restaurant, branch, table/room, merged/split metadata, comments, order source, ordering device/session, timing, and daily order number.
- `POS Profile`: restaurant/branch, printers/QZ, cashier/role restrictions, checklists, KOT options, discount, closing, PIN/terminal/self-ordering-related configuration.
- `POS Opening Entry`: restaurant, branch, assigned room(s), sub-closing, last invoice references.
- `Branch`: URY users/rooms and aggregator configuration.
- `Customer`, `Price List`, `Employee`, and other standard masters required by URY workflows.

Never rename a DocType or fieldname without a coordinated migration and updates to every backend/frontend consumer.

---

## 5. Document Event Hooks (`hooks.py`)

| DocType | Event | Handler responsibility |
|---|---|---|
| `POS Invoice` | `before_insert` | Set arrival/default restaurant data. |
| `POS Invoice` | `validate` | Validate order/customer/menu/table rules. |
| `POS Invoice` | `after_insert` | Set daily order number. |
| `POS Invoice` | `before_submit` | Final validation before submit. |
| `POS Invoice` | `on_submit` / `on_update` | Maintain dependent URY state. |
| `POS Invoice` | `on_cancel` / `on_trash` | KOT/table cleanup. |
| `POS Profile` | `validate` | Validate printer/restaurant/profile setup. |
| `Sales Invoice` | `before_insert`, `on_update` | Copy/synchronize restaurant fields. |
| `Item` | `validate` | Validate/synchronize menu item configuration. |
| `POS Opening Entry` | `validate`, `before_save`, `before_insert` | Cashier room and opening state. |
| `POS Closing Entry` | `before_save`, `validate` | Closing reconciliation rules. |
| `URY Menu Course` | `validate` | Validate serving priority. |

Scheduler: `ury.ury.api.ury_kot_validation.kotValidationThread` runs every minute.

---

## 6. Integration Points

### ERPNext

- URY orders create and update ERPNext POS Invoices; consolidation produces Sales Invoices.
- ERPNext owns accounting, stock, Customer, Item, Price List, POS Profile, payment, tax, and document permission semantics.
- URY must extend these workflows through documented Frappe APIs and lifecycle hooks, not bypass them.

### Frontend applications

- `/pos` — React POS v2 and captain workflow; see `pos/ARCHITECTURE.md`.
- `/ury` — React management/setup/reporting; see `frontend/ARCHITECTURE.md`.
- `/order` — React QR/tablet/kiosk self-ordering; see `self-order/ARCHITECTURE.md`.
- `/mosaic/<production_unit>` — Vue KDS; see `mosaic/ARCHITECTURE.md`.
- `/urypos` — legacy Vue POS v1.

All applications are served as Frappe web pages. Route rules in `ury/hooks.py` handle SPA routing.

### Real-time

- KOT updates use Frappe Socket.io.
- KDS channel contract: `kot_update_{branch}_{production}`.
- Publishers and subscribers must be changed together.

### Printing

- QZ Tray handles signed/local thermal printing.
- ERPNext Network Printer Settings supports server/network printing.
- Websocket printing is the fallback flow.
- Private keys, credentials, and production certificates must not be committed or moved into shared packages.

---

## 7. Where Frontend Lives

| App | Source | Generated output | URL |
|---|---|---|---|
| POS v2 | `pos/src/` | `ury/public/pos/`, `ury/www/pos.html` | `/pos` |
| URY management | `frontend/src/` | `ury/public/ury/`, `ury/www/ury.html` | `/ury` |
| Self ordering | `self-order/src/` | `ury/public/order/`, `ury/www/order.html` | `/order` |
| KDS | `mosaic/src/` | `ury/public/mosaic/`, `ury/www/mosaic.html` | `/mosaic/<unit>` |
| POS v1 legacy | `urypos/src/` | `ury/public/urypos/`, `ury/www/urypos.html` | `/urypos` |

Shared React code:

- `@ury/ui`: components, theme tokens, Tailwind preset. Consumers import from `@ury/ui`, not internal paths.
- `@ury/core`: Frappe client, auth/role helpers, storage, validation, formatting, and QZ transport. Consumers import from the `@ury/core` barrel.

Build commands:

```bash
yarn install
yarn build
yarn workspace @ury/core typecheck
yarn workspace @ury/ui typecheck
yarn workspace pos lint
yarn workspace frontend typecheck
cd mosaic && yarn build
cd urypos && yarn build
```

The root build produces all five frontends. Run targeted builds during development; run `bench build --app ury` when the bench asset pipeline must be refreshed.

---

## 8. How Agents Should Navigate This Repo

**POS UI, cashier/captain behavior, translations:** work in `pos/`; read `pos/ARCHITECTURE.md`.

**Management UI, setup wizard, dashboards, reports:** work in `frontend/`; read `frontend/ARCHITECTURE.md`.

**Customer QR/kiosk/tablet ordering:** work in `self-order/`; read `self-order/ARCHITECTURE.md` and inspect `ury/ury/api/self_ordering.py`.

**Shared Frappe client, auth/roles, storage, formatting, QZ transport:** work in `packages/core/`; read `packages/core/ARCHITECTURE.md`. Changes can affect all React apps.

**Shared React components/theme/Tailwind:** work in `packages/ui/`; read `packages/ui/ARCHITECTURE.md`. Verify every affected React consumer.

**KDS behavior:** work in `mosaic/`; read `mosaic/ARCHITECTURE.md`.

**Frappe endpoint:** modify the owning focused module in `ury/ury/api/` or `ury/ury/report_api/`. Use `ury/ury_pos/api.py` only for its existing POS contract or a tightly related compatibility change.

**New DocType:** use the standard Frappe generator or create the complete controller/JSON/test structure in `ury/ury/doctype/<name>/`.

**Standard-DocType custom field:** keep `ury/setup_customizations.py` and `ury/hooks.py` fixture selection consistent. Use the supported Frappe export/setup flow; do not hand-edit generated fixture data as a shortcut.

**Migration patch:** create an idempotent patch in `ury/patches/v<major>_<minor>/` and register it once in `ury/patches.txt` under the correct phase.

**Never:**

- Hand-edit generated files under `ury/public/pos/`, `ury/public/ury/`, `ury/public/order/`, `ury/public/mosaic/`, `ury/public/urypos/`, or generated `ury/www/*.html`.
- Put business logic in `ury/hooks.py` or `ury/www/*.py`.
- Rename legacy API methods, stored values, routes, fieldnames, or realtime channels without a migration/compatibility plan.
- Commit private keys, PINs, QR/session/device tokens, payment secrets, or production data.

---

## 9. Mandatory Engineering Guide

Before modifying source code, read `docs/AI_ENGINEERING_GUIDE.md`. It defines the repository-wide naming conventions, modular architecture, SOLID/KISS/DRY rules, Frappe/ERPNext implementation practices, security requirements, and verification workflow.

Critical permission invariant: treat permission failures as configuration-first investigations. Inspect the affected User and Role Profile, Role Permission Manager, User Permissions, Branch/POS Profile/Restaurant assignments, active POS Opening Entry, migrations, and cache before changing code. Never add `ignore_permissions=True`, weaken backend authorization, or remove Branch/Restaurant/POS Profile/Room/owner/document-state checks merely to compensate for missing Frappe Desk configuration.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

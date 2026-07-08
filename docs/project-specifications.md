# URY Project Specifications

This document summarises the architecture, tech stack, repository structure, and integration points of the URY restaurant management system. It is derived from the upstream repository at https://github.com/ury-erp/ury.

---

## 1. Overview

| Attribute | Value |
|-----------|-------|
| Name | URY — Open Source Restaurant Management System |
| Publisher | Tridz Technologies Pvt. Ltd. |
| Supported by | Frappe |
| License | MIT |
| Version | 0.2.1 |
| GitHub | https://github.com/ury-erp/ury |
| Default branch | `develop` |

URY is a Frappe/ERPNext custom app that provides:

- **POS & Billing** — Dine-in, takeaway, delivery, aggregator orders, multi-cashier, offline support, printer management.
- **Kitchen Display System (KDS)** — Real-time KOT queues, serve/confirm workflow, audio alerts.
- **Analytics** — Daily P&L, consumption reports, item trends, staff performance.

---

## 2. Tech Stack

### Backend

| Component | Technology |
|-----------|------------|
| Framework | Frappe Framework v15 |
| ERP | ERPNext v15 |
| HR | Frappe HR (`hrms`) |
| Language | Python >= 3.10 |
| ORM / API | Frappe ORM, `@frappe.whitelist()` RPC |
| Scheduler | Frappe scheduler (for KOT validation) |
| Real-time | Frappe Socket.io |

### Frontend Applications

| App | Framework | Build Tool | State | URL |
|-----|-----------|------------|-------|-----|
| POS v2 (current) | React 19 + TypeScript | Vite 6 | Zustand | `/pos` |
| URYMosaic (KDS) | Vue 3 (Options API) | Vite 4 | Vue data | `/URYMosaic/<production_unit>` |
| POS v1 (legacy) | Vue 3 | Vite | Vuex/Pinia | `/urypos` |

### Shared Frontend Libraries

- Tailwind CSS
- frappe-js-sdk
- lucide-react (POS)
- @radix-ui/react-select (POS)
- qz-tray (thermal printing)
- socket.io-client (KDS)
- masonry-layout (KDS)

---

## 3. Repository Structure

```
ury/                          ← repo root
├── ury/                      ← Frappe app Python package
│   ├── hooks.py              ← app registration, doc_events, scheduler, fixtures
│   ├── patches.txt           ← migration patches
│   ├── setup.py              ← custom field creation
│   ├── install.py            ← post-install setup
│   ├── uninstall.py          ← cleanup on uninstall
│   ├── permission.py         ← app screen permission check
│   ├── ury/                  ← core backend
│   │   ├── doctype/          ← 35+ custom Frappe doctypes
│   │   ├── hooks/            ← document event handlers
│   │   ├── api/              ← modular API handlers
│   │   └── page/
│   │       └── websocket_print/
│   ├── ury_pos/
│   │   └── api.py            ← main POS REST API
│   ├── fixtures/             ← exported fixtures
│   ├── public/               ← static assets
│   ├── www/                  ← web page context providers
│   └── patches/
│       └── v2_0/
├── pos/                      ← React POS v2
├── URYMosaic/                ← Vue KDS
├── urypos/                   ← Vue POS v1 (legacy)
├── DEMO/                     ← screenshots
├── pyproject.toml            ← Python package config
├── package.json              ← Yarn workspace root
├── FEATURES.md               ← feature list
├── INSTALLATION.md           ← installation guide
└── SETUP.md                  ← setup guide
```

---

## 4. Key Frappe Doctypes

| Doctype | Purpose |
|---------|---------|
| `URY Order` | Core order document created/updated by POS. |
| `URY Order Item` | Line items for an order. |
| `URY KOT` | Kitchen Order Ticket generated on order/modification. |
| `URY KOT Items` | Line items for a KOT. |
| `URY Menu` | Menu definition linked to a restaurant and price list. |
| `URY Menu Item` | Individual item in a menu. |
| `URY Menu Course` | Course grouping (starter, main, dessert) with priority. |
| `URY Restaurant` | Restaurant master record. |
| `URY Room` | Section/room within a restaurant. |
| `URY Table` | Table in a restaurant room. |
| `URY Printer Settings` | Thermal printer configuration. |
| `URY User` | Waiter/cashier assignment to a branch. |
| `Aggregator Settings` | Delivery platform (Zomato, Swiggy) configuration. |
| `Item Add On` | Modifier/add-on for a menu item. |
| `POS Item Variants` | Size/variant options for a menu item. |
| `URY Daily P and L` | Daily P&L report. |
| `URY Cost of Goods` | COGS tracking. |
| `Sub POS Closing` | POS closing record per cashier. |

### Custom Fields on Standard Doctypes

URY extends several ERPNext doctypes via `setup.py` and `fixtures/custom_field.json`:

- **POS Invoice / Sales Invoice**: `order_type`, `waiter`, `no_of_pax`, `cashier`, `restaurant`, `branch`, `restaurant_table`, `invoice_printed`, `cancel_reason`, `custom_comments`, `custom_ury_order_number`
- **POS Profile**: `restaurant`, `branch`, `printer_settings`, `qz_print`, `qz_host`, `enable_discount`, `enable_multiple_cashier`, `reset_order_number_daily`
- **POS Opening Entry**: `restaurant`, `branch`, `custom_room`, `custom_rooms`
- **POS Closing Entry**: extended for multi-cashier
- **Branch**: `user` (URY User table), `custom_aggregators`
- **Customer**: `mobile_number`
- **Price List**: `restaurant_menu`

---

## 5. Document Event Hooks

Registered in `ury/hooks.py`:

| DocType | Event | Handler |
|---------|-------|---------|
| POS Invoice | `before_insert` | Set arrived_time, validate restaurant/branch |
| POS Invoice | `validate` | Validate order fields |
| POS Invoice | `after_insert` | Set daily order number |
| POS Invoice | `before_submit` | Final validation |
| POS Invoice | `on_cancel` / `on_trash` | Cleanup KOTs |
| POS Profile | `validate` | Validate printer/restaurant setup |
| Sales Invoice | `before_insert`, `on_update` | Copy restaurant fields from POS Invoice |
| Item | `validate` | Validate menu item configuration |
| POS Opening Entry | `validate` | Set cashier room assignment |
| POS Opening Entry | `before_save` | Validation |
| POS Opening Entry | `before_insert` | Set last invoice reference |
| POS Closing Entry | `before_save`, `validate` | Closing validation |

**Scheduler:** `ury.ury.api.ury_kot_validation.kotValidationThread` runs every minute.

---

## 6. Integration Points

### ERPNext

- Orders ultimately create **POS Invoices** in ERPNext.
- Consolidation creates **Sales Invoices**.
- Payments use ERPNext POS payment flow via `make_invoice`.
- Price Lists, Customers, Payment Modes, and Tax Templates are standard ERPNext objects.

### Frontend Apps

All frontends are served as Frappe web pages. Route rules in `hooks.py`:

```python
{"from_route": "/pos/<path:app_path>", "to_route": "pos"},
{"from_route": "/URYMosaic/<path:app_path>", "to_route": "URYMosaic"},
```

### Real-time

- KOT updates broadcast via Frappe Socket.io.
- Channel format: `kot_update_{branch}_{production_unit}`

### Printing

- **QZ Tray** — desktop app, signed print jobs.
- **Network Printing** — via ERPNext Network Printer Settings / CUPS.
- **WebSocket Printing** — fallback page at `/app/websocket-print`.

---

## 7. Build & Asset Flow

```bash
# Build all frontends (from repo root)
yarn install
yarn build

# Or individually
cd pos && yarn build
cd URYMosaic && yarn build
cd urypos && yarn build

# Copy built assets into Frappe public directory
bench build --app ury
```

Build outputs:

| Source | Output | URL |
|--------|--------|-----|
| `pos/src/` | `ury/public/pos/` | `/pos` |
| `URYMosaic/src/` | `ury/public/URYMosaic/` | `/URYMosaic/<unit>` |
| `urypos/src/` | `ury/public/urypos/` | `/urypos` |

**Never edit build output directly.** Always edit source and rebuild.

---

## 8. API Entry Points

### Main POS API

`ury/ury_pos/api.py` exposes whitelisted methods such as:

- `getRestaurantMenu`
- `getBranch`
- `getModeOfPayment`
- `getPosProfile`
- `getAggregatorItem`
- `createPaymentEntry`
- `getInvoiceForCashier`

### KOT API

`ury/ury/api/ury_kot_display.py` exposes:

- `get_site_name`
- `kot_list`
- `serve_kot`
- `confirm_cancel_kot`

### Order API

Core order sync is implemented in the `URY Order` doctype controller:

- `sync_order` — create/update order and generate KOTs.

---

## 9. Roles

| Role | Responsibility |
|------|----------------|
| URY Manager | Oversee all restaurant operations. |
| URY Captain | Manage customer orders and table service. |
| URY Cashier | Manage orders, table service, payments, and POS operations. |

---

## 10. Notes for Developers

- Read `AGENTS.MD` before modifying backend/hooks/doctypes.
- Read `pos/AGENTS.MD` before modifying the React POS.
- Read `URYMosaic/AGENTS.MD` before modifying the KDS.
- Export fixtures after doctype/custom-field changes: `bench export-fixtures --app ury`.
- Add migration patches under `ury/patches/v<major>_<minor>/` and register them in `ury/patches.txt`.

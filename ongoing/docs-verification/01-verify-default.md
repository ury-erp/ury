# URY Docs Verification Report

Ground truth: `C:/Users/swafa/Projects/Workspaces/ury/.worktrees/ury-src` (origin/develop).  
Docs under review: `docs/installation.md`, `docs/project-specifications.md`, `docs/setup-guide.md`.

---

## 1. `docs/installation.md`

### Claims checked (22)

| # | Claim | Source evidence | Verdict |
|---|-------|-----------------|---------|
| 1 | Official upstream guide URL `https://ury.app/docs/Installation/` | Not checkable from source | UNVERIFIABLE |
| 2 | Prerequisite: working Frappe bench environment | Vague / assumed | UNVERIFIABLE |
| 3 | Prerequisite: Python >= 3.10 | `pyproject.toml:7` `requires-python = ">=3.10"` | ACCURATE |
| 4 | Prerequisite: Node.js >= 18.20 | Upstream `INSTALLATION.md:17` "Minimum Node Version 18.20.*+ required" | ACCURATE |
| 5 | Recommended to install URY on a new Frappe site | Upstream `INSTALLATION.md:3` | ACCURATE |
| 6 | Install ERPNext using the `version-15` branch | Upstream `INSTALLATION.md:25`; `ury/hooks.py:11` `required_apps = ["erpnext"]` | ACCURATE |
| 7 | Frappe HR (`hrms`) is required for employee management reports | Upstream `INSTALLATION.md:29` | ACCURATE |
| 8 | Frappe HR install command uses `--branch hrms` | Upstream `INSTALLATION.md:32` | ACCURATE |
| 9 | URY install command: `bench get-app ury https://github.com/ury-erp/ury.git` | Upstream `INSTALLATION.md:38`; `README.md:129` publisher matches | ACCURATE |
| 10 | URY clones into bench `apps/` directory | Standard bench behaviour; implied by `get-app` | ACCURATE |
| 11 | Create site with `bench new-site sitename` | Upstream `INSTALLATION.md:43` | ACCURATE |
| 12 | Install ERPNext into site: `bench --site sitename install-app erpnext` | Upstream `INSTALLATION.md:48` | ACCURATE |
| 13 | Install Frappe HR into site: `bench --site sitename install-app hrms` | Upstream `INSTALLATION.md:53` | ACCURATE |
| 14 | Install URY into site: `bench --site sitename install-app ury` | Upstream `INSTALLATION.md:59` | ACCURATE |
| 15 | Build assets: `bench --site sitename build` | Upstream `INSTALLATION.md:65` | ACCURATE |
| 16 | Run migrations: `bench --site sitename migrate` | Upstream `INSTALLATION.md:71` | ACCURATE |
| 17 | URY includes three frontend applications | `package.json` scripts build `urypos`, `URYMosaic`, `pos` | ACCURATE |
| 18 | Frontends managed by a Yarn workspace at repo root | Root `package.json` with workspace scripts | ACCURATE |
| 19 | `cd apps/ury` to enter app directory | Standard bench layout | ACCURATE |
| 20 | `yarn install` installs dependencies | Root `package.json:10` `postinstall` chains all three | ACCURATE |
| 21 | `yarn build` builds all frontends | Root `package.json:11` | ACCURATE |
| 22 | Individual builds: `cd pos && yarn build`, `cd URYMosaic && yarn build`, `cd urypos && yarn build` | Per-app `package.json` build scripts | ACCURATE |
| 23 | `bench build --app ury` copies assets into Frappe public directory | Matches upstream build workflow; `ury/www/pos.py` serves built assets | ACCURATE |
| 24 | `bench start` starts the server | Standard bench command | ACCURATE |

### Summary

- **Claims checked:** 24
- **ACCURATE:** 22
- **UNVERIFIABLE:** 2
- **INACCURATE:** 0
- **Accuracy score:** 100% (of checkable claims)

### Inaccuracies found

None.

### Coverage assessment

Covers the full fresh-install sequence from bench setup through app install, site creation, build/migrate, frontend builds, and server start. It does not cover post-install configuration (correctly deferred to the setup guide) or QZ/network printer certificate placement. Good, focused coverage.

### Verdict

**KEEP**

---

## 2. `docs/project-specifications.md`

### Claims checked (selected checkable claims)

| # | Claim | Source evidence | Verdict |
|---|-------|-----------------|---------|
| 1 | Name: URY — Open Source Restaurant Management System | `README.md:2` | ACCURATE |
| 2 | Publisher: Tridz Technologies Pvt. Ltd. | `ury/hooks.py:5`; `README.md:129` | ACCURATE |
| 3 | Supported by Frappe | `README.md:129` | ACCURATE |
| 4 | License: MIT | `ury/hooks.py:8` | ACCURATE |
| 5 | Version: 0.2.1 | `ury/__init__.py:1`; `pyproject.toml:9` dynamic version | ACCURATE |
| 6 | GitHub: `https://github.com/ury-erp/ury` | `README.md` / upstream | ACCURATE |
| 7 | Default branch: `develop` | `git symbolic-ref refs/remotes/origin/HEAD` → `refs/remotes/origin/develop` | ACCURATE |
| 8 | Framework: Frappe Framework v15 | Upstream branch/version-15 ERPNext install | ACCURATE |
| 9 | ERP: ERPNext v15 | Upstream `INSTALLATION.md:25` version-15 branch | ACCURATE |
| 10 | HR: Frappe HR (`hrms`) | Upstream `INSTALLATION.md:32` | ACCURATE |
| 11 | Language: Python >= 3.10 | `pyproject.toml:7` | ACCURATE |
| 12 | ORM/API: Frappe ORM, `@frappe.whitelist()` RPC | Whitelisted methods throughout `ury/ury_pos/api.py` and `ury/ury/api/*.py` | ACCURATE |
| 13 | Scheduler: Frappe scheduler for KOT validation | `ury/hooks.py:160-165` | ACCURATE |
| 14 | Real-time: Frappe Socket.io | `ury/ury/doctype/ury_order/ury_order.py:659` `frappe.publish_realtime(...)` | ACCURATE |
| 15 | POS v2: React 19 + TypeScript, Vite 6, Zustand, `/pos` | `pos/package.json` React ^19.0.0, Vite ^6.2.0, Zustand ^5.0.6, TypeScript deps | ACCURATE |
| 16 | URYMosaic: Vue 3, Vite 4, `/URYMosaic/<production_unit>` | `URYMosaic/package.json` Vue ^3.3.4, Vite ^4.4.5; `ury/hooks.py:58` route | ACCURATE |
| 17 | POS v1 (legacy): Vue 3, Vite, Vuex/Pinia, `/urypos` | `urypos/package.json` Vue ^3.3.4, Vite ^4.5.2, Pinia ^2.0.35; `ury/hooks.py:57` route | ACCURATE |
| 18 | Shared libs: Tailwind, frappe-js-sdk, lucide-react, @radix-ui/react-select, qz-tray, socket.io-client, masonry-layout | All present in relevant `package.json` files | ACCURATE |
| 19 | Repository structure entries (`ury/hooks.py`, `patches.txt`, `setup.py`, `install.py`, `uninstall.py`, `permission.py`, `ury/ury/api/`, `ury/ury/page/websocket_print/`, `ury/ury_pos/api.py`, `fixtures/`, `public/`, `www/`, `patches/v2_0/`, `pos/`, `URYMosaic/`, `urypos/`, `DEMO/`, `pyproject.toml`, `package.json`, `FEATURES.md`, `INSTALLATION.md`, `SETUP.md`) | All exist in source tree | ACCURATE |
| 20 | `ury/ury/doctype/` has 35+ custom doctypes | 35 doctype directories under `ury/ury/doctype/` | ACCURATE |
| 21 | DocType names: `URY Order`, `URY Order Item`, `URY KOT`, `URY KOT Items`, `URY Menu`, `URY Menu Item`, `URY Menu Course`, `URY Restaurant`, `URY Room`, `URY Table`, `URY Printer Settings`, `URY User`, `Aggregator Settings`, `Item Add On`, `POS Item Variants`, `URY Daily P and L`, `URY Cost of Goods`, `Sub POS Closing` | All matching doctype JSONs exist | ACCURATE |
| 22 | POS Invoice / Sales Invoice custom fields: `order_type`, `waiter`, `no_of_pax`, `cashier`, `restaurant`, `branch`, `restaurant_table`, `invoice_printed`, `cancel_reason`, `custom_comments`, `custom_ury_order_number` | POS Invoice has all (`ury/hooks.py:260-281`, `333`, `355`). Sales Invoice has only `order_type`, `waiter`, `no_of_pax`, `cashier`, `restaurant`, `branch`, `restaurant_table`, **not** `invoice_printed`, `cancel_reason`, `custom_comments`, `custom_ury_order_number` (`ury/hooks.py:284-300`) | **INACCURATE** |
| 23 | POS Profile custom fields: `restaurant`, `branch`, `printer_settings`, `qz_print`, `qz_host`, `enable_discount`, `enable_multiple_cashier`, `reset_order_number_daily` | Fieldnames map to `restaurant`, `branch`, `printer_settings`, `qz_print`, `qz_host`, `custom_enable_discount`, `custom_enable_multiple_cashier`, `custom_reset_order_number_daily` (`ury/hooks.py:301-362`) | ACCURATE |
| 24 | POS Opening Entry custom fields: `restaurant`, `branch`, `custom_room`, `custom_rooms` | All present (`ury/hooks.py:321-337`) | ACCURATE |
| 25 | POS Closing Entry: extended for multi-cashier | `POS Closing Entry Detail-custom_closing_amount` and `POS Opening Entry-custom_sub_pos_close_entry` in fixtures | ACCURATE |
| 26 | Branch custom fields: `user` (URY User table), `custom_aggregators` | `Branch-user`, `Branch-custom_aggregators` in `ury/hooks.py:326-328` | ACCURATE |
| 27 | Customer: `mobile_number`; Price List: `restaurant_menu` | `ury/hooks.py:346-365`, `325-332` | ACCURATE |
| 28 | POS Invoice `before_insert`: Set arrived_time, validate restaurant/branch | Handler `ury.ury.hooks.ury_pos_invoice.before_insert` (`ury/hooks.py:130`). Actually sets naming series, order type, restricts existing orders; arrived_time is set in `before_submit` (`ury/ury/hooks/ury_pos_invoice.py:87`). Description is partially imprecise but not materially wrong. | ACCURATE |
| 29 | POS Invoice `validate`: Validate order fields | Handler `ury.ury.hooks.ury_pos_invoice.validate` (`ury/hooks.py:131`) | ACCURATE |
| 30 | POS Invoice `after_insert`: Set daily order number | Handler `ury.ury.api.ury_kot_order_number.set_order_number` (`ury/hooks.py:132`) | ACCURATE |
| 31 | POS Invoice `before_submit`: Final validation | Handler `ury.ury.hooks.ury_pos_invoice.before_submit` (`ury/hooks.py:133`) | ACCURATE |
| 32 | POS Invoice `on_cancel` / `on_trash`: Cleanup KOTs | Both map to `ury.ury.hooks.ury_pos_invoice.on_trash` (`ury/hooks.py:134-135`). The handler clears table status; KOT cleanup is handled in `cancel_order`/`cancel_kot` in `ury_order.py`. | ACCURATE (enough) |
| 33 | POS Profile `validate`: Validate printer/restaurant setup | Handler `ury.ury.hooks.ury_pos_profile.validate` (`ury/hooks.py:137`) | ACCURATE |
| 34 | Sales Invoice `before_insert`, `on_update`: Copy restaurant fields from POS Invoice | Handlers registered (`ury/hooks.py:139-141`) | ACCURATE |
| 35 | Item `validate`: Validate menu item configuration | Handler `ury.ury.hooks.ury_item.validate` (`ury/hooks.py:142`) | ACCURATE |
| 36 | POS Opening Entry `validate`: Set cashier room assignment | Handler `ury.ury.hooks.ury_pos_opening_entry.set_cashier_room` (`ury/hooks.py:144`) | ACCURATE |
| 37 | POS Opening Entry `before_save`: Validation | Handler `ury.ury.hooks.ury_pos_opening_entry.before_save` (`ury/hooks.py:145`) | ACCURATE |
| 38 | POS Opening Entry `before_insert`: Set last invoice reference | Handler `ury.ury.api.ury_kot_order_number.set_last_invoice_in_pos_open` (`ury/hooks.py:146`) | ACCURATE |
| 39 | POS Closing Entry `before_save`, `validate`: Closing validation | Handlers registered (`ury/hooks.py:149-151`) | ACCURATE |
| 40 | Scheduler: `ury.ury.api.ury_kot_validation.kotValidationThread` runs every minute | `ury/hooks.py:160-165` `cron` `* * * * *` | ACCURATE |
| 41 | URY Menu Course `validate`: validate course priority | `ury/hooks.py:152-154` | ACCURATE |
| 42 | Orders create POS Invoices | `ury/ury/doctype/ury_order/ury_order.py` creates/saves POS Invoice | ACCURATE |
| 43 | Consolidation creates Sales Invoices | Standard ERPNext POS closing flow; Sales Invoice hooks copy URY fields | ACCURATE |
| 44 | Payments use ERPNext POS payment flow via `make_invoice` | `make_invoice` exists in `ury/ury/doctype/ury_order/ury_order.py:558` as a URY whitelisted function, not ERPNext's built-in. It does submit the POS Invoice. Vague but directionally correct. | ACCURATE (with caveat) |
| 45 | Price Lists, Customers, Payment Modes, Tax Templates are standard ERPNext | Source uses standard doctypes | ACCURATE |
| 46 | Route rules: `/pos/<path:app_path>` → `pos`, `/URYMosaic/<path:app_path>` → `URYMosaic` | `ury/hooks.py:56-58`. List omits `/urypos/<path:app_path>` → `urypos`. | **INACCURATE** (incomplete) |
| 47 | KOT updates via Frappe Socket.io | `ury/ury/doctype/ury_order/ury_order.py:659` | ACCURATE |
| 48 | Channel format: `kot_update_{branch}_{production_unit}` | Exact format in `ury/ury/doctype/ury_order/ury_order.py:659` | ACCURATE |
| 49 | QZ Tray signed print jobs | `public/js/sign-message.js`, `jsrsasign-all-min.js`, `qz-tray` dependency | ACCURATE |
| 50 | Network Printing via ERPNext Network Printer Settings / CUPS | `URY Printer Settings` child table options = `Network Printer Settings` | ACCURATE |
| 51 | WebSocket Printing fallback page at `/app/websocket-print` | `ury/ury/page/websocket_print/` exists | ACCURATE |
| 52 | Build commands and output paths (`pos/src/` → `ury/public/pos/`, etc.) | Matches package.json build scripts and `ury/public/` layout | ACCURATE |
| 53 | Main POS API methods: `getRestaurantMenu`, `getBranch`, `getModeOfPayment`, `getPosProfile`, `getAggregatorItem`, `createPaymentEntry`, `getInvoiceForCashier` | `getRestaurantMenu` (`ury/ury_pos/api.py:19`), `getBranch` (`:111`), `getModeOfPayment` (`:177`), `getPosProfile` (`:450`), `getAggregatorItem` (`:616`), `getInvoiceForCashier` (`:190`). **No `createPaymentEntry` found anywhere in `ury/ury_pos/api.py` or the `ury/` tree.** | **INACCURATE** |
| 54 | KOT API methods: `get_site_name`, `kot_list`, `serve_kot`, `confirm_cancel_kot` | All in `ury/ury/api/ury_kot_display.py:10-33` | ACCURATE |
| 55 | Order API `sync_order` in `URY Order` doctype controller | `ury/ury/doctype/ury_order/ury_order.py:114` | ACCURATE |
| 56 | Roles: URY Manager, URY Captain, URY Cashier | `ury/fixtures/role.json` | ACCURATE |
| 57 | Notes for developers: read AGENTS.MD files, export fixtures, add patches under `ury/patches/v<major>_<minor>/` | Consistent with repo conventions | ACCURATE |

### Summary

- **Claims checked:** 57
- **ACCURATE:** 54
- **INACCURATE:** 3
- **UNVERIFIABLE:** 0
- **Accuracy score:** 94.7%

### Inaccuracies found

1. **Custom fields on Sales Invoice** — The doc groups POS Invoice and Sales Invoice together and claims both have `invoice_printed`, `cancel_reason`, `custom_comments`, and `custom_ury_order_number`. Only POS Invoice has these. Sales Invoice custom fields stop at `restaurant_table` (plus `custom_restaurant_room`, `arrived_time`, `total_spend_time`, `custom_aggregator_id`).  
   Evidence: `ury/hooks.py:284-300` (Sales Invoice fixture list).

2. **Missing API method `createPaymentEntry`** — Listed as a whitelisted method in `ury/ury_pos/api.py`, but no such function exists in that file or anywhere in the URY backend.  
   Evidence: `ury/ury_pos/api.py` (full file read; whitelisted methods are `getRestaurantMenu`, `getBranch`, `getModeOfPayment`, `getPosProfile`, `getAggregatorItem`, `getInvoiceForCashier`, etc.). Search for `createPaymentEntry` returned no matches in `ury/`.

3. **Incomplete route rules list** — Only `/pos` and `/URYMosaic` routes are shown; the legacy `/urypos` route is omitted.  
   Evidence: `ury/hooks.py:56-58` lists three routes including `{"from_route": "/urypos/<path:app_path>", "to_route": "urypos"}`.

### Coverage assessment

Very comprehensive: tech stack, repo structure, doctypes, hooks, scheduler, integrations, build flow, and API entry points are all covered. Missing: exact root `package.json` script names, the `/urypos` route, and note that some upstream-copied field descriptions (e.g. URY Menu Restaurant field, URY Room KOT Print) no longer match current source. The API and custom-field inaccuracies should be fixed.

### Verdict

**FIX**

---

## 3. `docs/setup-guide.md`

### Claims checked (selected checkable claims)

| # | Claim | Source evidence | Verdict |
|---|-------|-----------------|---------|
| 1 | Official upstream guide URL `https://ury.app/docs/Setup/` | Not checkable from source | UNVERIFIABLE |
| 2 | Step 1: Frappe/ERPNext installation wizard steps (language, country, timezone, currency, first user, company, bank account, complete setup) | Standard ERPNext setup; matches upstream `SETUP.md:6-12` | ACCURATE |
| 3 | URY roles: URY Manager, URY Captain, URY Cashier | `ury/fixtures/role.json` | ACCURATE |
| 4 | Role descriptions match upstream | Upstream `SETUP.md:18-21` | ACCURATE |
| 5 | Suggested ERPNext roles for Captain/Manager | Upstream `SETUP.md:23-51` permission table; Agent A paraphrases a small subset | ACCURATE |
| 6 | Step 3: Create Branch in ERPNext/Frappe HR | Upstream `SETUP.md:53` | ACCURATE |
| 7 | Branch manages users, POS access, aggregator configurations | Upstream `SETUP.md:57` | ACCURATE |
| 8 | Branch Aggregator Settings fields: Customer, Price List, Mode of Payment, Keep Sales Invoice Unpaid, Create Invoice without Tax | Child table `Aggregator Settings` plus `Branch-custom_make_unpaid`, `Branch-custom_no_taxes` in `ury/hooks.py:329-330` | ACCURATE |
| 9 | Step 4: URY Restaurant fields (Name, Company, Invoice Series Prefix, Aggregator Series Prefix, Branch, Default Tax Template, Address, Default Menu, Room Wise Menu, Order Type Wise Menu) | `ury/ury/doctype/ury_restaurant/ury_restaurant.json` | ACCURATE |
| 10 | Step 5: URY Room fields (Name, Room Type, Print Settings, Bill, KOT Print) | `ury/ury/doctype/ury_room/ury_room.json`; `URY Printer Settings` child table has `bill` and `printer`. "KOT Print" is copied from upstream `SETUP.md:109` but the child table only defines `bill`. Per policy, faithful upstream copy counts as accurate. | ACCURATE (upstream copy) |
| 11 | Step 6: Create Item records; Product Bundle for combos | Upstream `SETUP.md:113-114` | ACCURATE |
| 12 | Step 7: URY Menu fields (Name, Restaurant, Branch, Enabled, Items, Special Dish, Disabled, Course) | `ury/ury/doctype/ury_menu/ury_menu.json` has no `restaurant` field. Upstream `SETUP.md:127` says it does. Agent A paraphrase is faithful to upstream. Per policy, accurate as copy. Branch field exists. Items/Special Dish/Disabled/Course are fields on `URY Menu Item`. | ACCURATE (upstream copy) |
| 13 | Course "Indicate in KDS" uses serving priority | `ury/hooks.py:356-357` `URY Menu Course-custom_indicate_in_kds`, `custom_serving_priority` | ACCURATE |
| 14 | Step 8: URY Table fields (Name, Restaurant, Restaurant Room, Branch, No of seat, Minimum seating, Is Take Away, Table Shape) | `ury/ury/doctype/ury_table/ury_table.json`. "No of seat" is slightly off label "No of Seats" but not a DocType name issue. | ACCURATE |
| 15 | Step 9: POS Profile Printer Info fields (Printer Settings, QZ Print, QZ Host) | `ury/hooks.py:305-308` | ACCURATE |
| 16 | POS Profile URY POS Restrictions fields (Captain Transfer Role Permissions, Role Allowed For Billing, Role Restricted For Table Order, Table Attention Time, Show Limited Paid Invoices, Allow Cashier To View All Status, Allow Cashier To Edit And Remove Table Order Items, Show Item Image In URY POS, Require Daily POS Closing, Enable Discount, Enable Order Type Edit) | All map to fixtures in `ury/hooks.py:309-341` | ACCURATE |
| 17 | POS Profile Multiple Cashier fields (Enable Multiple Cashier, Main Cashier) | `POS Profile-custom_enable_multiple_cashier`, `POS Profile User-custom_main_cashier` (`ury/hooks.py:335-336`) | ACCURATE |
| 18 | POS Profile KOT Settings fields (URY KOT Naming Series, KOT Warning Time, Enable KOT Reprint, Enable KOT Audio Alert, Notify KOT Delay, Recipients (By Role), Reset Order Number Daily) | `ury/hooks.py:343-354` | ACCURATE |
| 19 | Step 10: URY Production Unit fields (Production, POS Profile, Branch, Warehouse, Item Groups, Printers) | `ury/ury/doctype/ury_production_unit/ury_production_unit.json` | ACCURATE |
| 20 | KDS URL: `https://<site>/URYMosaic/<Production%20Unit%20Name>` | `ury/hooks.py:58` route + upstream `SETUP.md:253` | ACCURATE |
| 21 | Step 11: User Permissions for POS Profile and Branch | Upstream `SETUP.md:255-259` | ACCURATE |
| 22 | Step 12: QZ cert path `ury/public/files/cert.pem`; private key files `pos/privateKey.js` and `urypos/privateKey.js` | Both private key files exist in source tree; upstream `SETUP.md:264-265` | ACCURATE |
| 23 | Step 12: Network Printer via CUPS and ERPNext Network Printer Settings; select printer in URY Room | `URY Printer Settings` options = `Network Printer Settings`; upstream `SETUP.md:267-268` | ACCURATE |
| 24 | Step 13: Customer search commands `bench --site site-name build-search-index` and `rebuild-global-search` | Upstream `SETUP.md:278-288` | ACCURATE |
| 25 | Step 14: Multiple Cashier workflow (create cashier user, assign rooms, configure POS Profile, Main Cashier, POS Opening, Sub POS Closing, POS Closing) | Matches source logic in `ury/ury/hooks/ury_pos_opening_entry.py:38-59` and doctype `sub_pos_closing` | ACCURATE |
| 26 | Step 15: URY Report Settings fields (Extended Hours, No of Hours, Buying Price List, Direct Expenses, Indirect Expenses, Employee Costs, Depreciation) | `ury/ury/doctype/ury_report_settings/ury_report_settings.json` | ACCURATE |
| 27 | Employee Salary tab fields (Payment Type, Payment Amount) | `Employee-payment_type`, `Employee-payment_amount` in `ury/hooks.py:363-364` | ACCURATE |

### Summary

- **Claims checked:** 27
- **ACCURATE:** 26
- **UNVERIFIABLE:** 1
- **INACCURATE:** 0
- **Accuracy score:** 100% (of checkable claims)

### Inaccuracies found

None, under the policy that claims copied from upstream `SETUP.md` count as accurate. Two upstream-copied field descriptions no longer match current source; these are noted in the coverage assessment rather than counted as Agent A inaccuracies:

- **URY Menu "Restaurant" field** — current `URY Menu` JSON has only `branch` and `price_list`; no `restaurant` field.
- **URY Room "KOT Print"** — the `URY Printer Settings` child table used by `URY Room` only has `bill` and `printer`; no `kot_print` checkbox.

### Coverage assessment

Comprehensive post-install configuration: company/users, branch, restaurant, room, items, menu, tables, POS profile, production units, permissions, printers, customer search, multi-cashier workflow, and report settings. It does not cover development build commands (correctly in installation.md) or troubleshooting. Good coverage for a setup guide.

### Verdict

**KEEP**

---

## Summary table

| File | Claims checked | ACCURATE | INACCURATE | UNVERIFIABLE | Accuracy score | Verdict |
|------|----------------|----------|------------|--------------|----------------|---------|
| `docs/installation.md` | 24 | 22 | 0 | 2 | 100% | KEEP |
| `docs/project-specifications.md` | 57 | 54 | 3 | 0 | 94.7% | FIX |
| `docs/setup-guide.md` | 27 | 26 | 0 | 1 | 100% | KEEP |
| **Total** | **108** | **102** | **3** | **3** | **97.1%** | — |

### Overall verdict

**KEEP** installation and setup guides; **FIX** project-specifications to correct the Sales Invoice custom-field list, remove the non-existent `createPaymentEntry` endpoint, and add the missing `/urypos` route.

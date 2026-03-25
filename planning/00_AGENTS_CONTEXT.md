# AGENTS.md — URY Architecture Context for Implementors

> **Read this first.** This document provides the essential Frappe/ERPNext context needed to execute the implementation plan. URY is a **single Frappe app** that extends ERPNext. All new features stay within this single app.

## How URY Fits Together

```
Frappe Framework (Python web framework)
  └── ERPNext (ERP app — provides Item, Price List, POS Invoice, Customer, etc.)
       └── URY (restaurant app — provides Menu, Table, Room, KOT, etc.)
            └── frappe_whatsapp (optional — WhatsApp integration)
```

**URY is NOT a standalone app.** It depends on ERPNext (`required_apps = ["erpnext"]` in `hooks.py`). All financial documents (POS Invoice, Sales Invoice, Payment Entry) come from ERPNext. URY adds restaurant-specific doctypes and logic on top.

## Frappe App Structure (How URY Is Organized)

```
ury/                          # Python package root (this is the Frappe app)
├── hooks.py                  # THE most important file — registers everything
├── modules.txt               # Lists Python modules: "URY" (currently just one line)
├── ury/                      # "URY" module (matches modules.txt)
│   ├── doctype/              # Each subfolder = one DocType
│   ├── api/                  # Whitelisted Python functions
│   ├── hooks/                # Document event handlers
│   └── report/               # Script reports
├── ury_pos/                  # "URY POS" module (would need adding to modules.txt)
│   └── api.py                # Whitelisted API endpoints
├── public/                   # Static files served at /assets/ury/
│   ├── js/                   # Client scripts included in Desk
│   ├── pos/                  # Built output from pos/ frontend
│   ├── urypos/               # Built output from urypos/ frontend
│   └── URYMosaic/            # Built output from URYMosaic/ frontend
└── www/                      # Web pages (each .html = a route)
    ├── pos.html              # Entry point for /pos/ route
    ├── urypos.html           # Entry point for /urypos/ route
    └── URYMosaic.html        # Entry point for /URYMosaic/ route
```

## Critical Patterns

### 1. Creating a New Backend Module

To add `ury_customer` as a new module inside the URY app:

```bash
# Step 1: Create the module folder
mkdir -p ury/ury_customer

# Step 2: Create __init__.py
touch ury/ury_customer/__init__.py

# Step 3: Add to modules.txt (CRITICAL — Frappe won't find it otherwise)
echo "URY Customer" >> ury/modules.txt

# Step 4: Create api.py with whitelisted functions
```

**The module name in `modules.txt` uses spaces** (e.g., "URY Customer"), but **the folder uses underscores** (e.g., `ury_customer`). Frappe auto-converts.

### 2. Whitelisted API Endpoints

Every function that the frontend calls must be decorated with `@frappe.whitelist()`:

```python
# ury/ury_customer/api.py

import frappe

@frappe.whitelist(allow_guest=True)  # allow_guest=True means NO login required
def get_public_menu(restaurant):
    """This can be called by unsigned users (customers)"""
    # ...

@frappe.whitelist()  # Default: requires logged-in Frappe user
def get_order_status(order_token):
    """This requires some form of authentication"""
    # ...
```

**Frontend calls these as:** `frappe.call('ury.ury_customer.api.get_public_menu', { restaurant: '...' })`

**Or via frappe-js-sdk:** `call.get('ury.ury_customer.api.get_public_menu', { restaurant: '...' })`

### 3. Creating a New DocType

Each DocType lives in its own folder under a module's `doctype/` directory:

```
ury/ury_customer/doctype/ury_customer_session/
├── __init__.py
├── ury_customer_session.json      # Field definitions (schema)
├── ury_customer_session.py        # Python class (business logic)
└── test_ury_customer_session.py   # Tests
```

**DocType JSON must include:**
- `"module": "URY Customer"` — matches module name
- `"fields"` array — each field has `fieldname`, `fieldtype`, `label`, etc.
- `"permissions"` array — who can CRUD this doctype

**You can also create doctypes via the Frappe UI** at `/app/doctype/new` and then export the JSON.

### 4. Document Event Hooks (hooks.py)

To run code when a document is created/saved/submitted:

```python
# In hooks.py
doc_events = {
    "POS Invoice": {
        "before_insert": "ury.ury.hooks.ury_pos_invoice.before_insert",
        "validate": "ury.ury.hooks.ury_pos_invoice.validate",
        "after_insert": "ury.ury.api.ury_kot_order_number.set_order_number",
        "before_submit": "ury.ury.hooks.ury_pos_invoice.before_submit",
    }
}
```

### 5. Custom Fields on ERPNext Doctypes

URY adds custom fields to ERPNext doctypes (POS Invoice, POS Profile, etc.) via **fixtures** in `hooks.py`. These are exported as JSON and re-applied on `bench migrate`.

**To add a new custom field** (e.g., `fulfillment_status` on POS Invoice):
1. Create it in Frappe UI: `/app/customize-form/POS Invoice` → add field
2. Export: `bench export-fixtures --app ury`
3. Add the field name to the fixtures list in `hooks.py`

Or create it programmatically in a patch:
```python
# ury/patches/add_fulfillment_status.py
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def execute():
    create_custom_fields({
        "POS Invoice": [
            {"fieldname": "fulfillment_status", "fieldtype": "Select",
             "options": "\nPlaced\nConfirmed\nPreparing\nReady\nServed\nPickedUp",
             "label": "Fulfillment Status", "insert_after": "status"}
        ]
    })
```

### 6. Adding New Frontend SPAs

Each frontend is a separate Vite/React/Vue project that builds to `ury/public/<app-name>/`:

```bash
# Step 1: Create the app (e.g., apps/table-order)
npx -y create-vite@latest apps/table-order -- --template react-ts

# Step 2: Configure vite.config.ts to build to correct output
# outDir: '../ury/public/table-order'

# Step 3: Create www entry point
# ury/www/table-order.html (copy pattern from pos.html)

# Step 4: Add route rule in hooks.py
# {"from_route": "/order/<path:app_path>", "to_route": "table-order"}

# Step 5: Add build script to root package.json
```

**The build command must include `--base=/assets/ury/<app-name>/`** so Vite generates correct asset URLs. See existing `pos/package.json` line 8 for the pattern.

### 7. Frappe Realtime (WebSocket)

For pushing updates to connected clients:

```python
# Backend — publish event
frappe.publish_realtime("order_status_update", {
    "order_token": "ORD-001",
    "status": "Ready"
})

# Can target specific users
frappe.publish_realtime("order_status_update", data, user="guest@example.com")
```

```typescript
// Frontend — subscribe
frappe.realtime.on("order_status_update", (data) => {
    console.log(data.status); // "Ready"
});
```

### 8. Guest Access in Frappe

By default, Frappe requires login for all API calls. For customer-facing apps:

- Use `@frappe.whitelist(allow_guest=True)` on API endpoints
- Guest users have the role "Guest" — set permissions accordingly
- For sensitive operations, validate a signed token in the API function itself
- **Do NOT** use Frappe's role-based permissions for customer-facing APIs; validate tokens/sessions manually

## Key Files Reference

| Purpose | File Path | Lines |
|---------|-----------|-------|
| App registration, hooks, routes, fixtures | `ury/hooks.py` | 384 |
| Main staff API (menu, branch, POS profile, invoices) | `ury/ury_pos/api.py` | 723 |
| Order creation, settlement, cancellation | `ury/ury/doctype/ury_order/ury_order.py` | 660 |
| KOT generation engine | `ury/ury/api/ury_kot_generate.py` | 405 |
| POS Invoice event handlers | `ury/ury/hooks/ury_pos_invoice.py` | 210 |
| React POS state management | `pos/src/store/pos-store.ts` | 695 |
| Frappe SDK wrapper | `pos/src/lib/frappe-sdk.ts` | 7 |
| Order API (frontend) | `pos/src/lib/order-api.ts` | 84 |
| Menu API (frontend) | `pos/src/lib/menu-api.ts` | 64 |
| Order types enum | `pos/src/data/order-types.ts` | 99 |
| UI primitives | `pos/src/components/ui/` | ~12 files |

## Current Order Flow (Critical Path)

```
1. Frontend: usePOSStore.fetchMenuItems()
   → calls ury.ury_pos.api.getRestaurantMenu(pos_profile, room, order_type)
   → returns items[] from URY Menu → URY Menu Item

2. Frontend: User adds items to cart (Zustand store, local state)

3. Frontend: syncOrder(data)
   → calls ury.ury.doctype.ury_order.ury_order.sync_order(items, cashier, customer, table, ...)
   
4. Backend sync_order():
   a. get_order_invoice(table) → creates or gets existing POS Invoice (Draft)
   b. Sets customer, order_type, items, payments on POS Invoice
   c. invoice.save()
   d. kot_execute() → compares old vs new items → creates URY KOT documents
   e. Marks table as occupied
   f. Returns invoice dict

5. Frontend: Make payment
   → calls ury.ury.doctype.ury_order.ury_order.make_invoice(customer, payments, ...)
   → invoice.submit() → POS Invoice moves from Draft → Paid
   → Table freed (occupied = 0)

6. KOT side-effect:
   → URY KOT documents trigger frappe.publish_realtime() to Mosaic KDS
   → Kitchen sees new orders in real-time
```

## What's Different for Customer-Facing APIs

The new `create_customer_order()` must:
1. **NOT require** `cashier`, `waiter`, `owner` as parameters
2. **Auto-resolve** the cashier from the active POS Opening Entry for that branch
3. **Accept** `allow_guest=True` — validate via signed token instead of Frappe session
4. **Set** `order_source = "QR"` / `"Online"` / `"Kiosk"` on POS Invoice
5. **Set** `fulfillment_status = "Placed"` as initial state
6. **Return** an `order_token` for the customer to track (NOT the POS Invoice name)
7. **Still trigger** `kot_execute()` so kitchen gets the order

---

## Frappe Skill Package Reference

> **Before implementing any phase**, clone the Frappe skill package and read the relevant SKILL.md:
> ```bash
> git clone https://github.com/OpenAEC-Foundation/Frappe_Claude_Skill_Package.git /tmp/frappe-skill
> ```
> Each skill has a `SKILL.md` with detailed workflows, decision trees, examples, and anti-patterns.

### Skill Index — Which Skills to Read for Each Task

| Task | Skill to Read | Path |
|------|--------------|------|
| **Creating new whitelisted APIs** (customer menu, order, payment) | `frappe-impl-whitelisted` | `skills/source/impl/frappe-impl-whitelisted/SKILL.md` |
| **Creating new DocTypes** (Payment Gateway, Customer Session, Kiosk Device) | `frappe-syntax-doctypes` | `skills/source/syntax/frappe-syntax-doctypes/SKILL.md` |
| **Writing DocType controllers** (business logic in .py files) | `frappe-impl-controllers` | `skills/source/impl/frappe-impl-controllers/SKILL.md` |
| **Modifying hooks.py** (new routes, doc_events, fixtures) | `frappe-impl-hooks` + `frappe-syntax-hooks` | `skills/source/impl/frappe-impl-hooks/SKILL.md` |
| **Custom app structure** (adding modules, modules.txt, patches) | `frappe-impl-customapp` + `frappe-syntax-customapp` | `skills/source/impl/frappe-impl-customapp/SKILL.md` |
| **Adding custom fields** to ERPNext doctypes (POS Invoice fields) | `frappe-impl-customapp` | See fixtures section in that skill |
| **Database queries** (frappe.db.get_value, get_all, sql) | `frappe-core-database` | `skills/source/core/frappe-core-database/SKILL.md` |
| **Permissions** (DocType perms, allow_guest, role-based) | `frappe-core-permissions` | `skills/source/core/frappe-core-permissions/SKILL.md` |
| **Building external integrations** (payment gateways, WhatsApp) | `frappe-impl-integrations` | `skills/source/impl/frappe-impl-integrations/SKILL.md` |
| **Client scripts** (Desk-side JS customization) | `frappe-impl-clientscripts` | `skills/source/impl/frappe-impl-clientscripts/SKILL.md` |
| **Scheduler jobs** (cron tasks, background processing) | `frappe-impl-scheduler` | `skills/source/impl/frappe-impl-scheduler/SKILL.md` |
| **Frontend builds** (Vite output, asset serving) | `frappe-ops-frontend-build` | `skills/source/ops/frappe-ops-frontend-build/SKILL.md` |
| **Web pages / website routes** (www/ pages, guest access) | `frappe-impl-website` | `skills/source/impl/frappe-impl-website/SKILL.md` |
| **Notifications** (email, system, push) | `frappe-core-notifications` | `skills/source/core/frappe-core-notifications/SKILL.md` |
| **Reports** (script reports, query reports) | `frappe-impl-reports` | `skills/source/impl/frappe-impl-reports/SKILL.md` |
| **Testing** (unit tests, CI/CD) | `frappe-testing-unit` | `skills/source/testing/frappe-testing-unit/SKILL.md` |
| **Debugging errors** (common pitfalls by category) | `frappe-errors-*` | `skills/source/errors/` (multiple skill files) |
| **Deployment** (bench setup, production) | `frappe-ops-deployment` | `skills/source/ops/frappe-ops-deployment/SKILL.md` |

### How to Use Skills During Implementation

For each phase of work, the implementing agent should:

1. **Read the relevant SKILL.md first** — it contains decision trees and step-by-step workflows
2. **Check the `references/` subfolder** — contains `examples.md` (working code), `anti-patterns.md` (common mistakes), and `workflows.md` (detailed procedures)
3. **Follow the patterns exactly** — Frappe has specific conventions that must be followed or things silently break

### Phase → Skill Mapping

| Phase | Primary Skills Needed |
|-------|----------------------|
| **Phase 0: Foundation** | `frappe-impl-customapp`, `frappe-syntax-customapp`, `frappe-ops-frontend-build` |
| **Phase 1: Shared Core** | `frappe-impl-whitelisted`, `frappe-syntax-doctypes`, `frappe-impl-controllers`, `frappe-impl-hooks`, `frappe-core-permissions` |
| **Phase 2: QR Table Order** | `frappe-impl-website`, `frappe-impl-whitelisted`, `frappe-core-permissions` (guest access), `frappe-ops-frontend-build` |
| **Phase 2.5: Payments** | `frappe-impl-integrations`, `frappe-syntax-doctypes`, `frappe-impl-controllers` |
| **Phase 3: Online Ordering** | Same as Phase 2 + `frappe-impl-scheduler` (for scheduled orders) |
| **Phase 4: Curbside** | `frappe-impl-whitelisted`, `frappe-core-notifications` |
| **Phase 5: Kiosk** | `frappe-impl-website`, `frappe-ops-frontend-build` |
| **Phase 6: Hardening** | `frappe-testing-unit`, `frappe-ops-deployment`, `frappe-ops-performance` |

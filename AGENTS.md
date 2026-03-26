# URY Multi-App Architecture - Developer Guide

> **Last Updated**: 2026-03-26  
> **Current Phase**: Phase 0 Complete - Foundation & Extraction  
> **Branch**: planning/multi-app-architecture

---

## Project Overview

URY is a **Frappe app** that extends ERPNext for restaurant management. This branch implements a **multi-app architecture** to support:

- **Staff POS** (existing) - Desktop/tablet cashier interface
- **QR Table Ordering** (new) - Customer self-order via QR codes
- **Online Ordering** (new) - Remote pickup/delivery ordering
- **Kiosk** (new) - Self-service kiosk interface

---

## Repository Structure

```
ury/                          # Frappe app root
├── ury/                      # "URY" module - core doctypes
│   ├── doctype/              # ~30 doctypes (restaurant, table, menu, KOT, order)
│   ├── api/                  # Existing KOT, print, validation APIs
│   ├── hooks/                # Document event handlers
│   └── report/               # 14 Frappe script reports
├── ury_pos/                  # "URY POS" module - staff APIs
│   └── api.py                # Main staff API (723 lines)
├── ury_customer/             # "URY Customer" module - customer APIs (NEW)
│   ├── __init__.py
│   └── api.py                # Public menu, order status, QR token APIs
├── public/                   # Static assets
├── www/                      # Web page entry points (SPA routes)
└── hooks.py                  # App hooks, doc_events, route rules

apps/                         # Frontend applications
├── pos/                      # Staff POS v2 (React + TypeScript + Vite)
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── lib/              # API clients, utilities
│   │   ├── store/            # Zustand stores
│   │   └── pages/            # Page components
│   └── package.json
├── urypos/                   # Staff POS v1 (Vue.js - legacy)
└── mosaic/                   # Kitchen Display System (Vue.js)

packages/                     # Shared npm packages (NEW)
├── config/                   # @ury/config - Constants, doctypes, order types
├── ui/                       # @ury/ui - React UI components
├── api-client/               # @ury/api-client - Frappe SDK wrapper
└── cart/                     # @ury/cart - Cart state management

planning/                     # Architecture planning documents
├── 00_AGENTS_CONTEXT.md      # Frappe patterns + skill package
├── implementation_plan.md    # Master plan
├── 01_repository_understanding.md
├── 02_capability_and_reuse.md
├── 03_architecture_and_app_model.md
├── 04_refactor_api_domain.md
├── 05_flows_and_structure.md
└── 06_delivery_plan_and_recommendations.md
```

---

## Architecture Principles

### 1. Single Frappe App

URY is a **single Frappe app** - all new modules go inside `ury/`:

```python
# New modules are added to ury/modules.txt
URY
URY Customer  # Added in Phase 0
```

**Pattern**: Module name in `modules.txt` uses spaces ("URY Customer"), directory uses underscores (`ury_customer/`).

### 2. Frontend Monorepo

Frontend apps share code through npm workspaces:

```json
// package.json (root)
{
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build": "yarn ury-pos-build && yarn ury-mosaic-build"
  }
}
```

### 3. Backend API Patterns

**Staff APIs** (require Frappe session):
```python
# ury/ury_pos/api.py
@frappe.whitelist()
def getRestaurantMenu(pos_profile, room, order_type):
    # Requires logged-in user
    ...
```

**Customer APIs** (guest access):
```python
# ury/ury_customer/api.py
@frappe.whitelist(allow_guest=True)
def get_public_menu(restaurant):
    # No login required - validate tokens manually
    ...
```

### 4. DocType Extensions

**URY DocTypes** (our own) - edit JSON directly:
- `ury/ury/doctype/ury_restaurant/`
- `ury/ury/doctype/ury_table/`
- `ury/ury/doctype/ury_menu/`

**ERPNext DocTypes** - use Custom Fields via fixtures:
- `POS Invoice` - fulfillment_status, order_source, customer_order_token, etc.

---

## Phase 0 Complete ✅

### Backend Changes

| Component | Changes |
|-----------|---------|
| `ury/modules.txt` | Added "URY Customer" |
| `ury/ury_customer/api.py` | New customer-facing APIs |
| `ury/ury/doctype/ury_restaurant/` | +slug, +accepts_online_orders, +logo, +opening_hours |
| `ury/ury/doctype/ury_table/` | +qr_token, +qr_generated_at |
| `ury/ury/doctype/ury_menu/` | +is_public |
| `ury/hooks.py` | Added customer ordering routes |

### Frontend Changes

| Component | Changes |
|-----------|---------|
| `package.json` | Added npm workspaces |
| `apps/pos/` | Moved from `/pos`, updated build paths |
| `packages/config/` | New - DocType constants, order types |
| `packages/ui/` | New - React UI components |
| `packages/api-client/` | New - Frappe SDK wrapper |
| `packages/cart/` | New - Zustand cart store |

---

## API Reference (New)

### Customer APIs (`ury.ury_customer.api`)

```python
# Get public menu (guest access)
get_public_menu(restaurant, order_type=None)
→ Returns: [{item, item_name, rate, item_image, course, ...}]

# Get restaurant info by slug (guest access)
get_restaurant_info(slug)
→ Returns: {name, restaurant_name, branch, logo, opening_hours, ...}

# Get order status (guest access)
get_order_status(order_token)
→ Returns: {order_token, status, fulfillment_status, grand_total, ...}

# Validate QR table token (guest access)
validate_table_token(token)
→ Returns: {restaurant, table, room, menu, valid}
```

---

## Development Workflow

### Essential Commands

```bash
# After DocType changes
bench --site mysite migrate

# After API changes not reflecting
bench --site mysite clear-cache

# Build frontend
bench build --app ury

# Run tests
bench --site mysite run-tests --app ury
```

### Adding a New Package

```bash
# 1. Create package directory
mkdir -p packages/my-package/src

# 2. Create package.json
cd packages/my-package
cat > package.json << 'EOF'
{
  "name": "@ury/my-package",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
EOF

# 3. Create tsconfig.json (copy from existing package)

# 4. Install dependencies
yarn install
```

### Adding a New Backend Module

```bash
# 1. Create module directory
mkdir -p ury/my_module
touch ury/my_module/__init__.py

# 2. Add to modules.txt
echo "My Module" >> ury/modules.txt

# 3. Create API file
touch ury/my_module/api.py

# 4. Run migrate
bench --site mysite migrate
```

---

## Key Files Reference

| Purpose | File Path |
|---------|-----------|
| App registration, hooks, routes | `ury/hooks.py` |
| Main staff API | `ury/ury_pos/api.py` |
| Customer API (new) | `ury/ury_customer/api.py` |
| POS v2 frontend | `apps/pos/` |
| Shared UI components | `packages/ui/` |
| Cart state | `packages/cart/` |
| API client | `packages/api-client/` |
| Constants/config | `packages/config/` |

---

## Next Steps (Phase 1)

Phase 1: Shared Ordering Core

1. Create `create_customer_order()` API - auto-assigns cashier from active POS Opening
2. Add `fulfillment_status` field to POS Invoice (Custom Field)
3. Add `order_source` field to POS Invoice (Custom Field)
4. Implement fulfillment state machine
5. Create `@ury/order` package for frontend order lifecycle

See `planning/06_delivery_plan_and_recommendations.md` for full phase details.

---

## Resources

- **Planning Docs**: `planning/` directory
- **Frappe Skills**: `/tmp/frappe-skill/` (cloned from https://github.com/OpenAEC-Foundation/Frappe_Claude_Skill_Package.git)
- **Skill Index**: See `planning/00_AGENTS_CONTEXT.md`

---

## Common Issues

### Import Path Breakage
When moving files between packages, update imports:
```typescript
// Before
import { Button } from './components/ui/button';

// After (using package)
import { Button } from '@ury/ui';
```

### Build Output Path
After moving `pos/` to `apps/pos/`, build output is at:
```typescript
// vite.config.ts
build: {
  outDir: "../../ury/public/pos",  // Relative to apps/pos/
}
```

### Module Not Found
Ensure new modules are added to `ury/modules.txt` and run `bench migrate`.

---

## Skills Directory

URY includes a modular skills system in `skills/` that provides AI agents with contextual knowledge about specific codebase areas.

### Using the Skills Directory

The `skills/_index.json` file contains a machine-readable index of all 18 available skills with metadata including:
- **name**: Skill identifier
- **description**: What the skill covers
- **category**: backend, frontend, features, quality, ui
- **path**: Location of the skill documentation
- **key_files**: Important files referenced by this skill
- **depends_on**: Other skills this one depends on
- **tags**: Searchable keywords

### Available Skills

| Skill | Category | Description |
|-------|----------|-------------|
| `api-client` | frontend | Frappe SDK wrapper for frontend apps |
| `cart-state` | frontend | Zustand cart state management |
| `custom-fields` | backend | ERPNext custom field extensions |
| `customer-api` | backend | Guest-facing ordering APIs |
| `doctypes` | backend | Core URY data models |
| `frappe-patterns` | backend | Frappe framework patterns |
| `kot-generation` | backend | Kitchen Order Ticket system |
| `menu-hooks` | frontend | React hooks for menu/QR data |
| `monorepo` | frontend | NPM workspaces structure |
| `order-hooks` | frontend | Order lifecycle React hooks |
| `payment-gateway` | backend | Multi-provider payment processing |
| `realtime` | backend | WebSocket/realtime patterns |
| `staff-pos-api` | backend | Staff POS operations APIs |
| `testing` | quality | Testing patterns and workflows |
| `ui-components` | ui | React UI component library |
| `table-order-app` | features | QR Table Ordering application |
| `customer-order-app` | features | Online pickup/delivery ordering |
| `kiosk-app` | features | Self-service kiosk ordering |

### Skill File Format

Each skill is documented in `skills/<skill-name>/SKILL.md` with:
- **Key Files**: Important source files
- **How It Works**: Core patterns and flow
- **Extension Points**: Where to add new functionality
- **Dependencies**: Required packages/modules
- **Gotchas**: Common pitfalls and solutions

---

## Contact & Support

- **Repository**: https://github.com/ury-erp/ury
- **Issues**: Create GitHub issue
- **Documentation**: See `planning/` directory
- **Skills Index**: See `skills/_index.json` for the complete catalog of 18 skills

---
title: URY DocTypes
category: features
description: Core URY DocType structure - Restaurant, Table, Menu, KOT, Order entities
usage: |
  Use when working with URY data models, creating new DocTypes, or understanding entity relationships.
  Reference for field names, types, and relationships when building APIs or UI forms.
---

# URY DocTypes

URY defines ~36 custom DocTypes in the URY module for restaurant management. These extend ERPNext's core entities (POS Invoice, Item) with restaurant-specific functionality.

## Key Files

| File | Purpose |
|------|---------|
| `ury/ury/doctype/ury_restaurant/ury_restaurant.json` | Restaurant configuration, menus, ordering settings |
| `ury/ury/doctype/ury_table/ury_table.json` | Table management, QR tokens, layout positioning |
| `ury/ury/doctype/ury_menu/ury_menu.json` | Menu definitions with items and pricing |
| `ury/ury/doctype/ury_room/ury_room.json` | Restaurant rooms/sections |
| `ury/ury/doctype/ury_kot/ury_kot.json` | Kitchen Order Ticket for kitchen operations |
| `ury/ury/doctype/ury_order/ury_order.json` | Order tracking and synchronization |
| `ury/modules.txt` | Module registration (URY, URY Customer) |

## Core DocTypes Overview

### URY Restaurant
The central configuration entity for a restaurant location.

**Key Fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `company` | Link → Company | ERPNext company association |
| `branch` | Link → Branch | Multi-branch support |
| `active_menu` | Link → URY Menu | Default menu for staff POS |
| `room_wise_menu` | Check | Enable different menus per room |
| `order_type_wise_menu` | Check | Different menus for dine-in/takeaway/delivery |
| `slug` | Data (unique) | URL-friendly identifier for public access |
| `accepts_online_orders` | Check | Enable customer online ordering |
| `logo` | Attach Image | Displayed on customer-facing apps |
| `opening_hours` | JSON | Store schedule: `{"mon": {"open": "09:00", "close": "22:00"}}` |

**Child Tables:**
- `menu_for_room` (Menu for Room) - Maps rooms to specific menus
- `order_type_menu` (Order Type Menu) - Maps order types to menus

### URY Table
Restaurant table management with QR code support for customer ordering.

**Key Fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `restaurant` | Link → URY Restaurant | Parent restaurant |
| `restaurant_room` | Link → URY Room | Room/section placement |
| `no_of_seats` | Int | Capacity |
| `minimum_seating` | Int | Minimum guests for reservation |
| `occupied` | Check (read-only) | Current occupancy status |
| `is_take_away` | Check | Designates takeaway counter |
| `layout_x`, `layout_y` | Float | Floor plan coordinates |
| `layout_width`, `layout_height` | Float | Floor plan dimensions |
| `qr_token` | Data | Signed token for QR validation |
| `qr_generated_at` | Datetime | Token generation timestamp |

### URY Menu
Menu definition with items and pricing.

**Key Fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `branch` | Link → Branch | Branch-specific menu |
| `enabled` | Check | Menu visibility toggle |
| `is_public` | Check | Visible to customers in online ordering |
| `price_list` | Link → Price List | Auto-created from menu items |
| `items` | Table → URY Menu Item | Menu line items |

**Child DocType: URY Menu Item**
| Field | Type | Purpose |
|-------|------|---------|
| `item` | Link → Item | ERPNext item reference |
| `course` | Link → URY Menu Course | Course/category |
| `rate` | Currency | Menu price |

### URY KOT (Kitchen Order Ticket)
Kitchen operations and order routing.

**Key Fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `restaurant` | Link → URY Restaurant | Source restaurant |
| `table` | Link → URY Table | Source table |
| `pos_invoice` | Link → POS Invoice | Associated invoice |
| `type` | Select (Add/New/Modify/Cancel) | KOT operation type |
| `status` | Select (Pending/Preparing/Ready/Served) | Kitchen status |
| `items` | Table → URY KOT Items | Items in this KOT |

### URY Order
Order synchronization and tracking.

**Key Fields:**
| Field | Type | Purpose |
|-------|------|---------|
| `restaurant` | Link → URY Restaurant | Source restaurant |
| `table` | Link → URY Table | Source table |
| `pos_invoice` | Link → POS Invoice | Associated invoice |
| `status` | Select | Order lifecycle status |
| `order_type` | Select (Dine In/Take Away/Delivery) | Order classification |

## How It Works

### DocType Creation Pattern
New DocTypes follow Frappe conventions:

```json
{
  "doctype": "DocType",
  "name": "URY Something",
  "module": "URY",
  "engine": "InnoDB",
  "field_order": ["field1", "field2"],
  "fields": [
    {
      "fieldname": "field1",
      "fieldtype": "Data",
      "label": "Field One",
      "reqd": 1
    }
  ],
  "permissions": [
    {"role": "URY Manager", "read": 1, "write": 1, "create": 1}
  ]
}
```

### Module Organization
```
ury/modules.txt
---
URY
URY Customer
```

- **URY module**: Core restaurant operations (staff-facing)
- **URY Customer module**: Customer-facing ordering features

### Naming Conventions
- **Core entities**: `URY Restaurant`, `URY Table`, `URY Menu`
- **Child entities**: `URY Menu Item`, `URY KOT Items`
- **Settings**: `URY Report Settings`, `Aggregator Settings`
- **Operations**: `URY KOT`, `URY Order`

### Permission Model
Standard URY roles:
| Role | Access Level |
|------|--------------|
| URY Manager | Full access to all DocTypes |
| URY Captain | Read-only, operational data |
| URY Cashier | POS Invoice, payments, tables |
| System Manager | Administrative access |

## Extension Points

### Adding Fields to URY DocTypes
Edit the `.json` file directly, then run:
```bash
bench --site mysite migrate
```

### Creating a New DocType
1. Create directory: `ury/ury/doctype/ury_new_entity/`
2. Add `ury_new_entity.json` and `ury_new_entity.py`
3. Add to `ury/modules.txt` if new module
4. Run migration

### Custom Fields on ERPNext DocTypes
For extending ERPNext entities (POS Invoice, Item), use **Custom Fields** via patches (see `custom-fields` skill).

### Document Events
Hook into DocType lifecycle in `ury/hooks.py`:
```python
doc_events = {
    "URY Table": {
        "on_update": "ury.ury.doctype.ury_table.ury_table.on_update"
    }
}
```

## Dependencies

| Dependency | Purpose |
|------------|---------|
| ERPNext | Base DocTypes (POS Invoice, Item, Company, Branch) |
| Frappe Framework | DocType framework, permissions, ORM |

## Gotchas

### Naming Rule
- `URY Restaurant`: `autoname: "prompt"` - User sets name manually
- `naming_rule: "Set by user"` - No auto-numbering

### Branch Field Consistency
Most DocTypes have `branch` field for multi-branch filtering. Always include in new DocTypes.

### JSON Field for Flexibility
`opening_hours` uses JSON field type for flexible scheduling:
```json
{"mon": {"open": "09:00", "close": "22:00"}}
```

### Read-Only Computed Fields
Fields like `occupied`, `latest_invoice_time` are computed and should remain `read_only: 1`.

### Permissions Require Migration
After changing `permissions` in JSON, you must run `bench migrate` for changes to take effect.

### Image Fields
- `image` field in URY Restaurant is `hidden: 1` - used for DocType icon only
- `logo` field is visible and for customer-facing display

### QR Token Lifecycle
`qr_token` and `qr_generated_at` are managed programmatically - never set manually in forms.

### Table Layout Coordinates
Layout fields (`layout_x`, `layout_y`, `layout_width`, `layout_height`) are in abstract units, not pixels. Frontend scales to viewport.

### Price List Auto-Creation
`price_list` field in URY Menu is auto-created by backend code - don't set manually.

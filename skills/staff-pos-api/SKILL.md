---
category: features
name: staff-pos-api
description: Internal staff POS APIs for restaurant operations including menu, invoices, cashier management, and branch operations
author: URY Team
version: 1.0.0
last_updated: 2026-03-26
dependencies: ["frappe", "erpnext"]
---

# Staff POS API

Internal staff-facing API endpoints for URY restaurant ERP system. These endpoints require Frappe authentication and support POS operations including menu retrieval, invoice management, cashier workflows, and branch-specific operations.

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `getRestaurantMenu(pos_profile, room=None, order_type=None)` | Get menu items based on POS profile, room, or order type |
| `getBranch()` | Get current user's assigned branch |
| `getBranchRoom()` | Get user's branch and assigned room |
| `getRoom()` | Get all rooms for current user |
| `getModeOfPayment()` | Get payment modes from POS Profile |
| `getInvoiceForCashier(status, cashier, limit, limit_start)` | Get invoices filtered by cashier with pagination |
| `getPosInvoice(status, limit, limit_start)` | Get all invoices for branch with pagination |
| `searchPosInvoice(query, status)` | Search invoices by name, customer, or mobile |
| `get_select_field_options()` | Get order_type dropdown options |
| `fav_items(customer)` | Get customer's favorite items by order history |
| `getCashier(room)` | Get active cashier for a room from POS Opening |
| `getPosProfile()` | Get detailed POS Profile configuration |
| `getPosInvoiceItems(invoice)` | Get items and taxes for an invoice |
| `posOpening()` | Check if POS is open for user's branch |
| `getAggregator()` | Get aggregator customers for branch |
| `getAggregatorItem(aggregator)` | Get items for an aggregator's price list |
| `getAggregatorMOP(aggregator)` | Get mode of payment for aggregator |
| `create_customer(...)` | Create a new customer with validation |
| `validate_pos_close(pos_profile)` | Validate POS can be closed (daily check) |

---

## Key Files

| File | Purpose |
|------|---------|
| `ury/ury_pos/api.py` | Main staff POS API module |
| `ury/ury_pos/__init__.py` | Module init |
| `ury/ury/doctype/ury_restaurant/` | Restaurant configuration |
| `ury/ury/doctype/ury_table/` | Table management |
| `ury/ury/doctype/ury_menu/` | Menu configuration |
| `ury/modules.txt` | Module registration |

---

## How It Works

### Menu Retrieval Flow

```
getRestaurantMenu()
    ├── Get user's branch ──► getBranch()
    ├── Get restaurant ──► URY Restaurant for branch
    ├── Determine menu:
    │   ├── If room provided ──► Check room_wise_menu
    │   │                          └── Menu for Room
    │   └── If cashier + order_type ──► Check order_type_wise_menu
    │                                     └── Order Type Menu
    │   └── Fallback ──► active_menu
    ├── Fetch URY Menu Items
    └── Enrich with Item images
```

### Invoice Querying Flow

```
getInvoiceForCashier(status, cashier, limit, limit_start)
    ├── Get branch ──► getBranch()
    └── Status-based query:
        ├── "Draft" ──► invoice_printed=1 OR no table
        ├── "Unbilled" ──► Draft + invoice_printed=0 + has table
        ├── "Recently Paid" ──► Paid status
        └── Other ──► Direct status match
```

### POS Profile Configuration Flow

```
getPosProfile()
    ├── Get branch
    ├── Get POS Profile for branch
    ├── Determine print type:
    │   ├── qz_print=1 ──► "qz" (QZ Tray)
    │   ├── bill printer exists ──► "network"
    │   └── Fallback ──► "socket"
    ├── Multiple cashier logic:
    │   └── Find POS Opening Entry for room
    └── Return full configuration
```

### POS Opening Validation

```
posOpening()
    ├── Get branch
    ├── Check POS Opening Entry
    │   ├── status = "Open"
    │   └── docstatus = 1 (Submitted)
    └── Return flag (0=open, 1=closed)
```

---

## Extension Points

### Custom Invoice Filters

Add new status filters in `getInvoiceForCashier()`:

```python
elif status == "MyCustomStatus":
    invoices = frappe.db.sql(
        """
        SELECT ...
        FROM `tabPOS Invoice`
        WHERE branch = %s AND my_custom_field = %s
        """,
        (branch, value),
        as_dict=True,
    )
```

### Custom Menu Selection Logic

Extend menu selection in `getRestaurantMenu()`:

```python
# After existing logic
if custom_condition:
    custom_menu = frappe.db.get_value(
        "Custom Menu Config",
        {"condition": value},
        "menu"
    )
    if custom_menu:
        menu = custom_menu
```

### POS Profile Extensions

Add custom fields to POS Profile and expose in `getPosProfile()`:

```python
# In getPosProfile()
custom_feature = pos_profiles.custom_my_feature
invoice_details["custom_feature"] = custom_feature
```

### Branch Resolution Override

Customize `getBranch()` for different user-branch association logic:

```python
@frappe.whitelist()
def getBranch():
    user = frappe.session.user
    
    # Custom logic
    if frappe.db.exists("Custom User Mapping", {"user": user}):
        return frappe.db.get_value(...)
    
    # Default URY logic
    ...
```

---

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `frappe` | Core Frappe framework |
| `erpnext` | ERPNext POS Invoice, Customer, Item |
| `ury.ury` | URY Restaurant, URY Table, URY Menu |

### DocType Dependencies

| DocType | Usage |
|---------|-------|
| `POS Profile` | POS configuration, payment modes, printer settings |
| `POS Invoice` | Order/invoice records |
| `POS Opening Entry` | Cashier session management |
| `URY Restaurant` | Restaurant config, active menu |
| `URY Table` | Table occupancy, room assignment |
| `URY Menu` | Menu items, courses |
| `Customer` | Customer records, favorites |
| `Branch` | Branch resolution for users |
| `URY User` | User-branch-room associations |
| `Aggregator Settings` | Third-party delivery integration |

---

## Gotchas

### Branch Resolution

`getBranch()` uses SQL join through `URY User` child table:

```sql
SELECT b.branch
FROM `tabURY User` AS a
INNER JOIN `tabBranch` AS b ON a.parent = b.name
WHERE a.user = %s
```

Administrator bypasses this check - returns None but doesn't throw.

### Invoice Status "Unbilled"

"Unbilled" is a virtual status, not stored in database:
- Database status: "Draft"
- Conditions: `invoice_printed=0` AND `restaurant_table IS NOT NULL`

### Room-Based Cashier Detection

`getCashier()` and multi-cashier mode require:
1. `custom_enable_multiple_cashier` enabled on POS Profile
2. User has `custom_main_cashier` flag
3. Active POS Opening Entry for the room

### SQL Injection Prevention

Queries use parameterized SQL:

```python
# CORRECT
frappe.db.sql("""SELECT ... WHERE branch = %s""", (branch,), as_dict=True)

# WRONG - Never do this
frappe.db.sql(f"SELECT ... WHERE branch = '{branch}'")
```

### Invoice Pagination

The `+1` limit pattern checks for more results:

```python
limit = int(limit) + 1  # Request one extra
# ...
if len(updatedlist) == limit:
    next = True
    updatedlist.pop()  # Remove extra
else:
    next = False
```

### Rounded Total

Fetched from Global Defaults:

```python
global_defaults = frappe.get_single('Global Defaults')
disable_rounded_total = global_defaults.disable_rounded_total
```

### Order Type Options

Retrieved from meta, not hardcoded:

```python
options = frappe.get_meta("POS Invoice").get_field("order_type").options
```

### Favorite Items Calculation

`fav_items()` aggregates quantities across all customer invoices:

```python
for invoice in pos_invoices:
    pos_invoice = frappe.get_doc("POS Invoice", invoice.name)
    for item in pos_invoice.items:
        item_qty[item.item_name] += item.qty
```

⚠️ Performance warning: This loads full invoice documents. Consider SQL aggregation for high-volume customers.

### POS Close Validation

`validate_pos_close()` checks for unclosed previous day entries:
- Cutoff time: 5:00 AM
- Prevents new POS Opening if previous day not closed

```python
start_of_day = current_datetime.replace(hour=5, minute=0, ...)
if current_datetime > start_of_day:
    previous_day = start_of_day - timedelta(days=1)
```

### Aggregator Integration

Aggregator items are priced through separate Price Lists:

```python
priceList = frappe.db.get_value(
    "Aggregator Settings",
    {"customer": aggregator, "parent": branchName},
    "price_list"
)
```

### Print Type Detection

Print type cascade:
1. **qz** - QZ Tray printing (JavaScript)
2. **network** - Direct network printer
3. **socket** - Socket-based printing

```python
if qz_print == 1:
    print_type = "qz"
elif bill_present:
    print_type = "network"
else:
    print_type = "socket"
```

### Phone Number Validation

`create_customer()` validates mobile numbers:

```python
from frappe.utils import validate_phone_number
try:
    validate_phone_number(mobile_number, throw=True)
except Exception:
    frappe.throw("Invalid mobile number format")
```

---

## Related Skills

- [customer-api](./customer-api) - Guest-facing APIs (uses some shared concepts)
- [kot-generation](./kot-generation) - Kitchen order generation from POS
- [payment-gateway](./payment-gateway) - Payment processing integration

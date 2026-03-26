---
category: features
name: customer-api
description: Guest-facing customer ordering APIs for QR table ordering, online ordering, and kiosk applications
author: URY Team
version: 1.0.0
last_updated: 2026-03-26
dependencies: ["frappe", "erpnext"]
---

# Customer API

Guest-facing API endpoints for URY restaurant ERP system. These endpoints support guest access for QR table ordering, online ordering, and kiosk applications without requiring Frappe authentication.

---

## API Endpoints

| Endpoint | Access | Purpose |
|----------|--------|---------|
| `get_public_menu(restaurant, order_type=None)` | Guest | Get public menu for a restaurant without authentication |
| `get_restaurant_info(slug)` | Guest | Get restaurant details by URL-friendly slug |
| `get_order_status(order_token)` | Guest | Track order status by unique order token |
| `generate_table_qr(table, expiry_hours=24)` | Authenticated | Generate JWT-signed QR token for table ordering |
| `validate_table_token(token)` | Guest | Validate QR token and return table context |
| `create_customer_order(...)` | Guest | Create POS Invoice from customer-facing apps |
| `update_fulfillment_status(order_token, new_status, notes=None)` | Authenticated | Update order fulfillment status |

### Core Endpoints Details

#### `get_public_menu(restaurant, order_type=None)`
Returns menu items for customer-facing applications. Validates that the restaurant accepts online orders.

**Returns:**
```python
[
  {
    "item": "ITEM-001",
    "item_name": "Chicken Biryani",
    "rate": 250.00,
    "item_image": "/files/item.jpg",
    "course": "Main Course",
    "special_dish": 1,
    "description": "..."
  }
]
```

#### `create_customer_order(restaurant, items, customer_name, ...)`
Creates a POS Invoice from customer orders. Auto-assigns cashier from active POS Opening Entry.

**Key Behaviors:**
- Validates restaurant accepts online orders
- Auto-assigns cashier from active POS Opening
- Creates/gets customer record
- Generates 8-char UUID order token
- Triggers KOT generation automatically
- Marks table as occupied
- Publishes realtime event `new_customer_order`

**Returns:**
```python
{
  "order_token": "ABC12345",
  "invoice_id": "POS-INV-2024-00001",
  "status": "success",
  "grand_total": 525.00,
  "fulfillment_status": "Placed"
}
```

#### `generate_table_qr(table, expiry_hours=24)`
Creates a JWT-signed token for table QR codes.

**Token Payload:**
```python
{
  "r": "RESTAURANT_NAME",  # restaurant
  "t": "TABLE-001",        # table
  "room": "ROOM-001",      # room
  "exp": 1711430400        # expiry timestamp
}
```

---

## Key Files

| File | Purpose |
|------|---------|
| `ury/ury_customer/api.py` | Main API module with all guest endpoints |
| `ury/ury/doctype/ury_restaurant/` | Restaurant configuration (accepts_online_orders, active_menu) |
| `ury/ury/doctype/ury_table/` | Table records (qr_token, qr_generated_at) |
| `ury/ury_customer/__init__.py` | Module init |
| `ury/modules.txt` | Module registration |

---

## How It Works

### QR Table Ordering Flow

```
Staff generates QR → Customer scans → Validates token → Shows menu → Places order
     │                      │               │                │              │
     ▼                      ▼               ▼                ▼              ▼
generate_table_qr()    /order/t/{token}  validate_table_token()  get_public_menu()  create_customer_order()
```

### Customer Order Creation Flow

```
create_customer_order()
    ├── validate_restaurant() ──► Check accepts_online_orders
    ├── validate_table_token() ──► Verify JWT signature & expiry
    ├── get_active_cashier() ──► Find POS Opening Entry for branch
    ├── get_or_create_customer() ──► Create Customer doc
    ├── generate order_token ──► UUID[:8].upper()
    ├── create POS Invoice ──► Set fulfillment_status="Placed", order_source="QR"
    ├── kot_execute() ──► Trigger kitchen order ticket
    ├── mark table occupied
    └── frappe.publish_realtime("new_customer_order", {...})
```

### Fulfillment Status Flow

Orders progress through these statuses:
1. `Placed` - Initial state after customer submits
2. `Confirmed` - Restaurant acknowledges
3. `Preparing` - Kitchen started
4. `Ready` - Food ready for pickup/service
5. `Served` - Delivered to table/customer
6. `Completed` - Order finished

Status changes trigger realtime events: `order_status_{order_token}`

---

## Extension Points

### Adding New Order Sources

Modify `create_customer_order()` to support new sources:

```python
# In create_customer_order()
if order_source not in ["QR", "Online", "Kiosk", "YourNewSource"]:
    frappe.throw(_("Invalid order source"))
```

### Custom Order Validation

Hook into order creation:

```python
@frappe.whitelist(allow_guest=True)
def create_customer_order(...):
    # Add pre-validation
    if not custom_validate_order(items, restaurant):
        frappe.throw(_("Validation failed"))
    
    # ... existing code
    
    # Add post-creation hook
    frappe.enqueue("my_app.hooks.on_customer_order_created", order=invoice.name)
```

### Custom Token Payload

Extend JWT payload in `generate_table_qr()`:

```python
payload = {
    "r": restaurant,
    "t": table,
    "room": table_doc.room,
    "custom_field": custom_value,  # Add custom data
    "exp": time.time() + (expiry_hours * 3600)
}
```

---

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `frappe` | Core Frappe framework |
| `jwt` (PyJWT) | JWT token signing/verification |
| `uuid` | Order token generation |
| `ury.ury.api.ury_kot_generate` | KOT generation trigger |
| `ury.ury_pos.api` | getBranch() helper (optional) |

### DocType Dependencies

- `URY Restaurant` - Restaurant configuration
- `URY Table` - Table with QR token fields
- `POS Invoice` - Order document (with custom fields)
- `Customer` - Customer records
- `POS Profile` - POS configuration
- `POS Opening Entry` - Active cashier detection

---

## Gotchas

### Guest Access Security

Endpoints marked `allow_guest=True` bypass Frappe authentication. Always:
- Validate tokens/signatures manually
- Check restaurant accepts online orders
- Never expose sensitive data

```python
# CORRECT: Validate before processing
if not restaurant_doc.accepts_online_orders:
    frappe.throw(_("Not accepting orders"), frappe.PermissionError)
```

### Token Expiry

QR tokens expire after 24 hours by default. The expiry is stored in JWT `exp` claim:

```python
# Check expiry in validate_table_token()
if expiry and expiry < time.time():
    frappe.throw(_("QR code has expired"), frappe.PermissionError)
```

### Cashier Assignment

`get_active_cashier()` has fallback logic:
1. Look for active POS Opening Entry for branch
2. Fallback to any user with URY Cashier role for branch
3. Returns None if no cashier found (order creation fails)

### KOT Generation Failure

KOT generation failures are logged but don't fail order creation:

```python
try:
    from ury.ury.api.ury_kot_generate import kot_execute
    kot_execute(...)
except Exception as e:
    frappe.log_error(f"KOT generation failed: {str(e)}", "Customer Order")
    # Order still created
```

### Order Token Collision

Order tokens are 8-char UUID segments. For production scale, consider:
- Checking for existing tokens before assignment
- Using longer tokens
- Implementing retry logic

### Field Naming Conventions

The API uses different field names in different contexts:
- `table` in customer API → `restaurant_table` in POS Invoice
- `item` in menu → `item_code` in order items
- `rate` in menu → price fetched from Item Price

### Import Cycle Risk

Avoid importing from `ury_pos` in customer API to prevent circular imports. The `getBranch()` function is duplicated or accessed carefully.

---

## Related Skills

- [payment-gateway](./payment-gateway) - Payment processing for customer orders
- [kot-generation](./kot-generation) - Kitchen Order Ticket generation
- [staff-pos-api](./staff-pos-api) - Staff-facing POS APIs

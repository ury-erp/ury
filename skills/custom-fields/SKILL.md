---
title: ERPNext Custom Fields for URY
category: features
description: Custom fields added to ERPNext's POS Invoice for customer ordering, fulfillment tracking, and payment integration
usage: |
  Use when extending POS Invoice for new ordering channels (QR, Online, Kiosk).
  Reference for field names and values when querying orders or building order flows.
---

# ERPNext Custom Fields for URY

URY extends ERPNext's **POS Invoice** DocType with custom fields to support multi-channel ordering (QR, Online, Kiosk) and fulfillment tracking. These fields are created via patches, not direct DocType modification.

## Key Files

| File | Purpose |
|------|---------|
| `ury/patches/v2_0/add_customer_ordering_fields.py` | Creates custom fields on POS Invoice |
| `ury/hooks.py` | Patch registration in `patches` list |
| `ury/fixtures/custom_fields.json` | Alternative fixture-based approach (if used) |

## Custom Fields Overview

### fulfillment_status
Tracks order through the fulfillment lifecycle.

| Attribute | Value |
|-----------|-------|
| `fieldtype` | Select |
| `options` | `\nPlaced\nConfirmed\nPreparing\nReady\nServed\nPicked Up\nOut for Delivery\nDelivered\nCancelled` |
| `default` | `Placed` |
| `insert_after` | `status` |
| `allow_on_submit` | `1` |

**State Flow:**
```
Placed → Confirmed → Preparing → Ready → Served (Dine-in)
                                    ↓
                              Picked Up (Takeaway)
                                    ↓
                              Out for Delivery → Delivered (Delivery)
```

**Use Cases:**
- Kitchen Display Systems (show "Preparing" orders)
- Customer order tracking (show "Ready for pickup")
- Analytics (average time in each state)

### order_source
Identifies where the order originated.

| Attribute | Value |
|-----------|-------|
| `fieldtype` | Select |
| `options` | `\nPOS\nQR\nOnline\nKiosk\nWhatsApp` |
| `default` | `POS` |
| `insert_after` | `fulfillment_status` |

**Sources:**
| Source | Description |
|--------|-------------|
| `POS` | Staff-operated point of sale |
| `QR` | Customer scanned table QR code |
| `Online` | Web/mobile online ordering |
| `Kiosk` | Self-service kiosk |
| `WhatsApp` | WhatsApp bot ordering |

**Use Cases:**
- Channel analytics (revenue by source)
- Different workflows per source
- UI theming based on source

### customer_order_token
Unique token for guest order tracking without login.

| Attribute | Value |
|-----------|-------|
| `fieldtype` | Data |
| `unique` | `1` |
| `read_only` | `1` |
| `insert_after` | `order_source` |

**Format:** Cryptographically random string (e.g., `a1b2c3d4e5f6`)

**Use Cases:**
- Customer order lookup: `/order-status?token=abc123`
- QR code generation: URL includes token
- Guest receipt: "Track your order at /track/abc123"

### scheduled_pickup_time
For scheduled/pre-orders.

| Attribute | Value |
|-----------|-------|
| `fieldtype` | Datetime |
| `insert_after` | `customer_ordering_section` |

**Use Cases:**
- Customer selects "Pick up at 6:00 PM"
- Kitchen capacity planning
- SMS reminders before pickup time

### payment_gateway
Records which payment processor was used.

| Attribute | Value |
|-----------|-------|
| `fieldtype` | Data |
| `insert_after` | `scheduled_pickup_time` |

**Examples:** `stripe`, `razorpay`, `square`

### payment_gateway_ref
External payment reference ID.

| Attribute | Value |
|-----------|-------|
| `fieldtype` | Data |
| `insert_after` | `payment_gateway` |

**Examples:** Stripe PaymentIntent ID (`pi_1234567890`)

## How It Works

### Patch Execution Flow

1. **Registration**: Added to `ury/hooks.py` patches list
   ```python
   patches = [
       "ury.patches.v2_0.add_customer_ordering_fields"
   ]
   ```

2. **Execution**: Runs once during `bench update` or `bench migrate`

3. **Creation**: Uses `create_custom_fields()` API:
   ```python
   from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
   
   custom_fields = {
       "POS Invoice": [
           {"fieldname": "fulfillment_status", ...},
           ...
       ]
   }
   create_custom_fields(custom_fields)
   ```

### Field Placement
Fields are inserted after specific existing fields:

```
POS Invoice Form Layout:
├── ... (standard fields)
├── status
├── fulfillment_status  ← inserted after status
├── order_source        ← inserted after fulfillment_status
├── customer_order_token
├── customer_ordering_section (Section Break)
├── scheduled_pickup_time
├── payment_gateway
└── payment_gateway_ref
```

## Extension Points

### Adding New Custom Fields

1. **Edit the patch file:**
   ```python
   # ury/patches/v2_0/add_customer_ordering_fields.py
   custom_fields = {
       "POS Invoice": [
           # ... existing fields ...
           {
               "fieldname": "delivery_partner",
               "label": "Delivery Partner",
               "fieldtype": "Link",
               "options": "Delivery Partner",
               "insert_after": "payment_gateway_ref",
               "module": "URY Customer",
           },
       ]
   }
   ```

2. **Create new patch for existing sites:**
   ```bash
   # Create new patch file
   touch ury/patches/v2_0/add_delivery_fields.py
   ```

3. **Register in hooks.py:**
   ```python
   patches = [
       "ury.patches.v2_0.add_customer_ordering_fields",
       "ury.patches.v2_0.add_delivery_fields",  # New
   ]
   ```

4. **Run migration:**
   ```bash
   bench --site mysite migrate
   ```

### Querying by Custom Fields

```python
# Get all QR orders pending preparation
orders = frappe.get_all("POS Invoice", filters={
    "order_source": "QR",
    "fulfillment_status": ["in", ["Placed", "Confirmed"]]
})

# Get customer order by token
order = frappe.get_all("POS Invoice", filters={
    "customer_order_token": "abc123xyz"
})
```

### Validating in API

```python
@frappe.whitelist(allow_guest=True)
def get_order_status(token):
    if not token:
        frappe.throw("Token required")
    
    order = frappe.db.get_value(
        "POS Invoice",
        {"customer_order_token": token},
        ["name", "fulfillment_status", "grand_total"],
        as_dict=True
    )
    
    if not order:
        frappe.throw("Order not found")
    
    return order
```

## Dependencies

| Dependency | Purpose |
|------------|---------|
| ERPNext | Base POS Invoice DocType |
| Frappe | `create_custom_fields` API |
| URY Customer module | Field ownership (`module`: "URY Customer") |

## Gotchas

### Patch Runs Once
Patches execute only once per site. To force re-run:
```sql
-- Remove patch log entry
DELETE FROM `tabPatch Log` WHERE patch = 'ury.patches.v2_0.add_customer_ordering_fields';
```
Then run `bench migrate` again.

### allow_on_submit
`fulfillment_status` has `allow_on_submit: 1` so it can be updated after invoice submission. Most other fields should NOT have this.

### Unique Token Generation
`customer_order_token` is marked `unique: 1` but generation is backend responsibility:
```python
import secrets
token = secrets.token_urlsafe(16)[:12]  # 12 char random string
```

### Module Assignment
All fields use `module: "URY Customer"` for organization. This appears in Custom Field list filtered by module.

### Insert After Field Must Exist
`insert_after` references must exist or field goes to end of form. Common mistake: referencing renamed fields.

### Section Break Usage
`customer_ordering_section` is a collapsible section (`collapsible: 1`) that groups related fields.

### Datetime vs Date
`scheduled_pickup_time` is Datetime (includes time), not Date. Store in system timezone.

### Status vs Fulfillment Status
- `status` (standard): Payment status (Draft, Paid, Cancelled)
- `fulfillment_status` (custom): Operational status (Preparing, Ready, etc.)

These are independent - an order can be Paid but still Preparing.

### Read-Only Tokens
`customer_order_token` is `read_only: 1` - backend generates, never user-editable.

### Query Performance
Custom fields are not indexed by default. For high-volume queries on `customer_order_token`, consider:
```python
# Add index via custom field property
"indexed": 1  # In field definition
```

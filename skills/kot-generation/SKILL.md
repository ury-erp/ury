---
category: features
name: kot-generation
description: Kitchen Order Ticket generation system for routing orders to production units and managing kitchen workflows
author: URY Team
version: 1.0.0
last_updated: 2026-03-26
dependencies: ["frappe", "erpnext"]
---

# KOT Generation API

Kitchen Order Ticket (KOT) generation system for URY restaurant ERP. Handles creation of KOT documents for new orders, order modifications, and cancellations. Routes items to appropriate production units based on item groups.

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `kot_execute(invoice_id, customer, restaurant_table, current_items, previous_items, comments)` | Main entry point for KOT generation - compares current vs previous items and creates appropriate KOTs |

### Internal Functions

| Function | Purpose |
|----------|---------|
| `create_kot_doc(...)` | Create a new KOT document for a production unit |
| `create_cancel_kot_doc(...)` | Create a cancellation KOT for removed items |
| `process_items_for_kot(...)` | Route items to production units by item group |
| `process_items_for_cancel_kot(...)` | Process cancelled items for cancellation KOTs |
| `create_order_items(items)` | Transform items to KOT item format |
| `compare_two_array(array_1, array_2)` | Diff arrays to find changed items |
| `get_removed_items(array_1, array_2)` | Find items removed from order |
| `get_all_production_item_groups(branch)` | Get all item groups handled by production units |

---

## Key Files

| File | Purpose |
|------|---------|
| `ury/ury/api/ury_kot_generate.py` | Main KOT generation module |
| `ury/ury/doctype/ury_kot/` | KOT document definition |
| `ury/ury/doctype/ury_production_unit/` | Production unit configuration |
| `ury/ury/doctype/ury_production_item_groups/` | Item group to production mapping |
| `ury/ury/doctype/ury_menu/` | Menu with course information |

---

## How It Works

### KOT Generation Flow

```
kot_execute()
    ├── Load and parse current_items & previous_items (JSON)
    ├── create_order_items() ──► Normalize item format
    ├── compare_two_array() ──► Find changed quantities
    ├── get_removed_items() ──► Find deleted items
    ├── Get POS Profile ──► Get KOT naming series
    ├── Split items:
    │   ├── positive_qty_items ──► process_items_for_kot("New Order")
    │   └── total_cancel_items ──► process_items_for_cancel_kot("Partially cancelled")
    │
    └── For each production unit:
        ├── Filter items by item_group
        ├── Check if existing KOT for invoice
        │   └── Yes ──► Change type to "Order Modified"
        └── create_kot_doc()
```

### Item Comparison Logic

```python
# Compare current vs previous order items
final_array = compare_two_array(new_Order_items_array, new_invoice_items_array)

# Example:
# Previous: [{"item_code": "BIRYANI", "qty": 2}]
# Current:  [{"item_code": "BIRYANI", "qty": 3}]
# Result:   [{"item_code": "BIRYANI", "qty": 1}]  # Only +1 needs KOT
```

### Production Unit Routing

```
Items to process
       │
       ├── Item A (Beverages group) ──► Bar Production Unit
       ├── Item B (Main Course group) ──► Kitchen Production Unit
       └── Item C (Desserts group) ──► Pastry Production Unit
```

Each production unit gets its own KOT document with only relevant items.

### KOT Types

| Type | Description | Trigger |
|------|-------------|---------|
| `New Order` | First KOT for an invoice | No existing KOT for production unit |
| `Order Modified` | Additional items added | Existing KOT found for invoice + production |
| `Partially cancelled` | Items removed from order | Negative quantity items or removed items |

### Cancellation KOT

```
process_items_for_cancel_kot()
    ├── Find original KOT(s) containing cancelled items
    ├── Link to original KOTs via original_kot field
    ├── Calculate cancelled_qty vs original quantity
    └── Create KOT with type "Partially cancelled"
```

---

## Extension Points

### Custom KOT Item Processing

Modify `create_order_items()` to add custom fields:

```python
def create_order_items(items):
    order_items = []
    for item in items:
        order_item = {
            "item_code": item.get("item", item.get("item_code")),
            "qty": item["qty"],
            "item_name": item["item_name"],
            "comments": item.get("comment", item.get("comments", "")),
            "custom_field": item.get("custom_field"),  # Add custom data
        }
        order_items.append(order_item)
    return order_items
```

### Custom Production Routing

Add custom routing logic in `process_items_for_kot()`:

```python
def process_items_for_kot(...):
    # Existing production unit logic
    ...
    
    # Add custom routing
    for item in kot_items:
        if should_route_to_special_kitchen(item):
            special_items.append(item)
    
    if special_items:
        create_kot_doc(
            invoice_id, customer, restaurant_table,
            special_items, kot_type, comments,
            pos_profile_id, kot_naming_series,
            "Special Kitchen"  # Custom production
        )
```

### Custom KOT Document Fields

Extend `create_kot_doc()` with additional fields:

```python
def create_kot_doc(...):
    kot_doc = frappe.get_doc({
        # ... existing fields
        "custom_priority": calculate_priority(items),
        "custom_station": get_kitchen_station(items),
        "estimated_time": get_prep_time(items),
    })
```

### KOT Type Extensions

Add new KOT types in `kot_execute()`:

```python
# In kot_execute()
if rush_order:
    process_items_for_kot(
        invoice_id, customer, restaurant_table,
        positive_qty_items, comments,
        pos_profile_id, kot_naming_series,
        "Rush Order"  # Custom type
    )
else:
    # Normal flow
    process_items_for_kot(..., "New Order")
```

### Pre/Post KOT Hooks

Add hooks for external integrations:

```python
def kot_execute(...):
    # Pre-processing hook
    frappe.publish_realtime("kot_pre_execute", {
        "invoice_id": invoice_id,
        "items": current_items
    })
    
    # ... existing logic
    
    # Post-processing hook
    frappe.publish_realtime("kot_post_execute", {
        "invoice_id": invoice_id,
        "kot_created": kot_doc.name
    })
```

---

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `frappe` | Core Frappe framework |
| `json` | Item data serialization |
| `ury.ury_pos.api` | `getBranch()` helper |

### DocType Dependencies

| DocType | Usage |
|---------|-------|
| `POS Invoice` | Source order document, order number, aggregator info |
| `URY KOT` | Kitchen Order Ticket document |
| `URY Production Unit` | Production/kitchen stations |
| `URY Production Item Groups` | Item group to production mapping |
| `URY Table` | Table → Room → Restaurant → Menu resolution |
| `URY Restaurant` | Active menu lookup |
| `URY Menu Item` | Course information for items |
| `Item` | Item group classification |
| `POS Profile` | KOT naming series configuration |

---

## Gotchas

### Naming Series Requirements

POS Profile **must** have `custom_kot_naming_series` set:

```python
kot_naming_series = pos_profile.custom_kot_naming_series
if kot_naming_series:
    cancel_kot_naming_series = "CNCL-" + kot_naming_series
else:
    frappe.throw(
        "KOT Naming Series is mandatory..."
    )
```

### Production Unit Configuration

At least one `URY Production Unit` must exist for the branch:

```python
productions = frappe.db.get_all(
    "URY Production Unit",
    filters={"branch": pos_profile.branch},
    fields=["name"]
)

if not productions:
    frappe.throw(
        "Create URY Production unit against POS Profile: %s" % pos_profile.name
    )
```

### Item Group Validation

Items with item groups not mapped to any production unit trigger a warning:

```python
if item_group not in all_production_item_groups:
    frappe.msgprint(
        f"Item group '{item_group}' for item '{item_code}' is not in any production."
    )
```

⚠️ These items won't appear on any KOT - kitchen won't see them!

### Course Resolution

Course is resolved from menu items:

```python
if restaurant_table:
    room = frappe.db.get_value("URY Table", restaurant_table, "restaurant_room")
    restaurant = frappe.db.get_value("URY Table", restaurant_table, "restaurant")
    menu = frappe.db.get_value("Menu for Room", {"room": room, "parent": restaurant}, "menu")
else:
    menu = frappe.db.get_value("URY Restaurant", {"branch": branch}, "active_menu")

course = frappe.db.get_value(
    "URY Menu Item",
    {"item": item["item_code"], "parent": menu},
    "course"
)
```

No table → uses restaurant's active menu directly.

### Order Modified Detection

Existing KOT check per production unit:

```python
invoice_exist = frappe.db.exists(
    "URY KOT",
    {
        "invoice": invoice_id,
        "docstatus": 1,
        "production": production.name,
    }
)
if invoice_exist:
    kot_type = "Order Modified"
```

Same invoice can have:
- "New Order" KOT for Kitchen (first order)
- "Order Modified" KOT for Kitchen (added items)
- "New Order" KOT for Bar (first drink order)

### Cancellation Quantity Calculation

Cancelled quantity is absolute value, original quantity preserved:

```python
kot_cancel_doc.append("kot_items", {
    "item": cancelItem["item_code"],
    "item_name": cancelItem["item_name"],
    "cancelled_qty": abs(int(cancelItem["qty"])),  # Always positive
    "quantity": item["qty"],  # Original ordered quantity
    "comments": cancelItem["comments"],
    "course": course
})
```

### Original KOT Linking

Cancellation KOTs link to source KOTs:

```python
# Find KOTs containing the cancelled item
for cancelItem in cancel_items:
    for kot in kot_list:
        kot_doc = frappe.get_doc("URY KOT", kot.name)
        for kotItem in kot_doc.kot_items:
            if cancelItem["item_code"] == kotItem.item:
                original_kots.append(kot_doc.name)

# Store as comma-separated
set_kots = ",".join(set(original_kots))
kot_cancel_doc.original_kot = set_kots
```

### Aggregator Orders

Aggregator orders are flagged on KOT:

```python
is_aggregator = 0
if pos_invoice.order_type == "Aggregators":
    is_aggregator = 1

kot_doc = frappe.get_doc({
    # ...
    "is_aggregator": is_aggregator,
    "aggregator_id": pos_invoice.custom_aggregator_id,
})
```

### JSON Input Handling

Both `current_items` and `previous_items` accept JSON strings or Python objects:

```python
def load_json(data):
    if isinstance(data, str):
        return json.loads(data)
    return data

# Usage
current_items = load_json(current_items)
```

### KOT Submission

KOTs are auto-submitted on creation:

```python
kot_doc.insert()
kot_doc.submit()
```

This triggers any Frappe hooks on KOT submission (print, notifications, etc.).

### Order Number Preservation

KOT captures order number from POS Invoice:

```python
order_number = pos_invoice.custom_ury_order_number
kot_doc.order_no = order_number
```

### Quantity Comparison Edge Cases

`compare_two_array()` handles quantity changes:

```python
# Previous: 2 Biryani
# Current:  3 Biryani
# Result:   +1 Biryani (only changed qty sent to kitchen)

# Previous: 2 Biryani
# Current:  1 Biryani  
# Result:   -1 Biryani (sent to cancellation KOT)
```

### Branch Resolution

Uses `getBranch()` from `ury_pos`:

```python
from ury.ury_pos.api import getBranch
branch = getBranch()
```

This may fail if user has no branch assignment.

---

## Related Skills

- [customer-api](./customer-api) - Triggers KOT generation for customer orders
- [staff-pos-api](./staff-pos-api) - Provides branch/cashier context for KOT

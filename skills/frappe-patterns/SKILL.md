---
name: frappe-patterns
description: Frappe Framework patterns used in URY codebase. Use when working with DocTypes, API endpoints, document hooks, fixtures, or Frappe-specific patterns in the URY restaurant ERP system.
category: backend
---

# Frappe Patterns for URY

Essential Frappe Framework patterns used throughout the URY restaurant management system.

## Key Files

| File | Purpose |
|------|---------|
| `ury/hooks.py` | App registration, doc_events, fixtures, route rules |
| `ury/ury_customer/api.py` | Guest API patterns with `@frappe.whitelist(allow_guest=True)` |
| `ury/ury_pos/api.py` | Staff API patterns requiring authentication |
| `ury/modules.txt` | Module registration (spaces) → directory names (underscores) |
| `ury/ury/doctype/` | ~30 URY DocTypes (restaurant, table, menu, KOT, order) |
| `ury/ury/hooks/` | Document event handlers (pos_invoice, sales_invoice, etc.) |

## How It Works

### DocType Patterns

**Creating/Getting Documents:**
```python
# Create new document
doc = frappe.new_doc("URY Restaurant")
doc.restaurant_name = "Test Restaurant"
doc.save()

# Get existing document
doc = frappe.get_doc("URY Restaurant", "Restaurant Name")

# Get value without full document
value = frappe.db.get_value("URY Restaurant", "Name", "fieldname")

# Get all matching documents
items = frappe.get_all(
    "URY Menu Item",
    filters={"parent": menu_name, "disabled": 0},
    fields=["item", "item_name", "rate"],
    order_by="idx"
)
```

**Custom Fields on ERPNext DocTypes:**
Use fixtures in `hooks.py` to add fields to ERPNext DocTypes:
```python
fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [["name", "in", {
            "POS Invoice-fulfillment_status",
            "POS Invoice-customer_order_token",
            "POS Invoice-order_source",
        }]]
    }
]
```

### API Patterns

**Staff APIs (Authentication Required):**
```python
# ury/ury_pos/api.py
@frappe.whitelist()
def getRestaurantMenu(pos_profile, room, order_type):
    user = frappe.session.user
    # Requires logged-in user
    ...
```

**Customer APIs (Guest Access):**
```python
# ury/ury_customer/api.py
@frappe.whitelist(allow_guest=True)
def get_public_menu(restaurant, order_type=None):
    # No login required - validate tokens manually
    ...
```

**Error Handling:**
```python
import frappe
from frappe import _

try:
    doc = frappe.get_doc("URY Restaurant", restaurant)
    if not doc.accepts_online_orders:
        frappe.throw(
            _("This restaurant is not accepting online orders"),
            frappe.PermissionError
        )
except frappe.DoesNotExistError:
    frappe.throw(_("Restaurant not found"), frappe.DoesNotExistError)
except Exception as e:
    frappe.log_error(f"Error: {str(e)}", "Context")
    frappe.throw(_("Failed to process request"), frappe.ValidationError)
```

### Document Events (Hooks)

```python
# ury/hooks.py
doc_events = {
    "POS Invoice": {
        "before_insert": "ury.ury.hooks.ury_pos_invoice.before_insert",
        "validate": "ury.ury.hooks.ury_pos_invoice.validate",
        "after_insert": "ury.ury.api.ury_kot_order_number.set_order_number",
        "before_submit": "ury.ury.hooks.ury_pos_invoice.before_submit",
        "on_cancel": "ury.ury.hooks.ury_pos_invoice.on_trash",
    },
    "POS Opening Entry": {
        "validate": "ury.ury.hooks.ury_pos_opening_entry.set_cashier_room",
        "before_insert": "ury.ury.api.ury_kot_order_number.set_last_invoice_in_pos_open",
    },
}
```

### Module Registration

```python
# ury/modules.txt - Use spaces for module names
URY
URY Customer

# Creates directories:
# ury/ury/           (URY module)
# ury/ury_customer/  (URY Customer module)
```

### Website Routes

```python
# ury/hooks.py
website_route_rules = [
    {"from_route": "/pos/<path:app_path>", "to_route": "pos"},
    {"from_route": "/urypos/<path:app_path>", "to_route": "urypos"},
    {"from_route": "/order/t/<token>", "to_route": "table-order"},
    {"from_route": "/menu/<path:slug>", "to_route": "customer-order"},
]
```

### Scheduled Tasks

```python
# ury/hooks.py
scheduler_events = {
    "cron": {
        "* * * * *": [
            "ury.ury.api.ury_kot_validation.kotValidationThread"
        ]
    }
}
```

## Extension Points

- **New DocType**: Create in `ury/ury/doctype/<doctype_name>/`, add to `modules.txt` if new module
- **New API**: Add to `ury/ury_customer/api.py` (guest) or `ury/ury_pos/api.py` (staff)
- **New Hooks**: Add entry to `doc_events` in `hooks.py`, implement handler in `ury/ury/hooks/`
- **Custom Fields**: Add to `fixtures` in `hooks.py`, run `bench migrate`

## Dependencies

- Frappe Framework (base)
- ERPNext (extends with POS Invoice, Sales Invoice, Item, etc.)

## Gotchas

- **Module naming**: Use spaces in `modules.txt` ("URY Customer") but underscores in directory (`ury_customer/`)
- **Fixtures**: After adding Custom Fields to fixtures, run `bench --site mysite migrate`
- **API caching**: After API changes not reflecting, run `bench --site mysite clear-cache`
- **Guest APIs**: Always validate input manually since `allow_guest=True` bypasses Frappe permission system
- **DocType naming**: URY DocTypes prefixed with `URY ` (e.g., "URY Restaurant", "URY Table")
- **db.get_value vs get_doc**: Use `db.get_value` for single fields, `get_doc` when you need to modify

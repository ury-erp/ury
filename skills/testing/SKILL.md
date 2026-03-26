---
name: testing
description: Testing patterns for URY including backend API testing, frontend E2E workflows, and test environment setup. Use when writing tests for Frappe APIs, setting up test data, or validating restaurant ordering workflows.
category: quality
---

# Testing Patterns for URY

Testing approach for backend APIs, frontend apps, and end-to-end workflows.

## Key Files

| File | Purpose |
|------|---------|
| `TESTING.md` | Complete testing guide with curl examples |
| `ury/ury_customer/api.py` | Customer APIs to test |
| `ury/ury_pos/api.py` | Staff APIs to test |
| `planning/05_flows_and_structure.md` | Workflow definitions for testing |

## How It Works

### Test Environment Setup

```bash
# Navigate to bench
cd ~/frappe-bench

# Install URY app
bench get-app https://github.com/ury-erp/ury.git
bench --site yoursite.com install-app ury

# Run migrations
bench --site yoursite.com migrate

# Build frontend assets
bench build --app ury

# Clear cache after changes
bench --site yoursite.com clear-cache
```

### Creating Test Data (Bench Console)

```python
# bench --site yoursite.com console

# Create company
company = frappe.new_doc("Company")
company.company_name = "Test Restaurant Company"
company.abbr = "TRC"
company.country = "India"
company.default_currency = "INR"
company.save()

# Create branch
branch = frappe.new_doc("Branch")
branch.branch = "Main Branch"
branch.company = company.name
branch.save()

# Create URY Restaurant
restaurant = frappe.new_doc("URY Restaurant")
restaurant.name = "Test Restaurant"
restaurant.restaurant_name = "Test Restaurant"
restaurant.company = company.name
restaurant.branch = branch.name
restaurant.invoice_series_prefix = "TR-"
restaurant.accepts_online_orders = 1  # Required for customer APIs
restaurant.slug = "test-restaurant"
restaurant.save()

# Create room
room = frappe.new_doc("URY Room")
room.name = "Main Hall"
room.restaurant = restaurant.name
room.branch = branch.name
room.save()

# Create tables
for i in range(1, 6):
    table = frappe.new_doc("URY Table")
    table.name = f"Table-{i}"
    table.table_name = f"Table {i}"
    table.restaurant = restaurant.name
    table.restaurant_room = room.name
    table.branch = branch.name
    table.no_of_seats = 4
    table.save()

# Create POS Profile
pos_profile = frappe.new_doc("POS Profile")
pos_profile.name = "Main POS"
pos_profile.branch = branch.name
pos_profile.company = company.name
pos_profile.save()

# Create POS Opening Entry (required for cashier assignment)
opening = frappe.new_doc("POS Opening Entry")
opening.user = "Administrator"
opening.pos_profile = pos_profile.name
opening.branch = branch.name
opening.company = company.name
opening.period_start_date = frappe.utils.today()
opening.period_start_time = frappe.utils.nowtime()
opening.submit()

frappe.db.commit()
```

### API Testing with curl

**Public Menu (Guest Access):**
```bash
curl -X GET "https://yoursite.com/api/method/ury.ury_customer.api.get_public_menu?restaurant=Test%20Restaurant" \
  -H "Content-Type: application/json"
```

**QR Token Generation (Staff Only):**
```bash
# Login first
curl -X POST "https://yoursite.com/api/method/login" \
  -H "Content-Type: application/json" \
  -d '{"usr":"Administrator","pwd":"admin"}' \
  -c cookies.txt

# Generate QR token
curl -X GET "https://yoursite.com/api/method/ury.ury_customer.api.generate_table_qr?table=Table-1" \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Validate QR Token (Guest Access):**
```bash
curl -X GET "https://yoursite.com/api/method/ury.ury_customer.api.validate_table_token?token=YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Create Customer Order:**
```bash
curl -X POST "https://yoursite.com/api/method/ury.ury_customer.api.create_customer_order" \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant": "Test Restaurant",
    "items": [{"item_code": "ITEM-001", "qty": 2}],
    "customer_name": "Test Customer",
    "customer_phone": "+1234567890",
    "table": "Table-1",
    "table_token": "YOUR_TOKEN",
    "order_type": "Dine In",
    "order_source": "QR"
  }'
```

**Check Order Status:**
```bash
curl -X GET "https://yoursite.com/api/method/ury.ury_customer.api.get_order_status?order_token=ABC12345" \
  -H "Content-Type: application/json"
```

**Update Fulfillment Status (Staff Only):**
```bash
curl -X POST "https://yoursite.com/api/method/ury.ury_customer.api.update_fulfillment_status" \
  -H "Content-Type: application/json" \
  -d '{
    "order_token": "ABC12345",
    "new_status": "Confirmed"
  }' \
  -b cookies.txt
```

### End-to-End Workflow Tests

**QR Table Order Flow:**
```
1. Staff: Open POS → POS Opening Entry → Open
2. Staff: Generate QR for Table-1
3. Customer: Scan QR → Token validated → Menu loads
4. Customer: Add items → Go to cart → Enter details → Place order
5. Kitchen: KOT prints automatically
6. Staff: See order in POS → Update status to "Confirmed"
7. Customer: Real-time status update
8. Kitchen: Prepare order
9. Staff: Update status to "Ready"
10. Customer: Notification that order is ready
11. Staff: Serve order → Update status to "Served"
```

### Configuration Required

```python
# site_config.json - JWT Secret for QR tokens
{
    "encryption_key": "your-secret-key-here"
}
```

### Troubleshooting Tests

**"Restaurant not accepting online orders":**
```python
restaurant = frappe.get_doc("URY Restaurant", "Test Restaurant")
print(restaurant.accepts_online_orders)  # Should be 1
restaurant.accepts_online_orders = 1
restaurant.save()
frappe.db.commit()
```

**"No active cashier found":**
```python
# Verify POS Opening Entry exists
openings = frappe.get_all("POS Opening Entry", 
    filters={"status": "Open", "docstatus": 1},
    fields=["user", "branch"]
)
print(openings)
```

**"QR token invalid":**
- Check JWT secret is in `site_config.json`
- Verify token hasn't expired
- Confirm table exists and links to correct restaurant

### Performance Testing

```bash
# Install artillery
npm install -g artillery

# Create test config
cat > test.yml << 'EOF'
config:
  target: 'https://yoursite.com'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Get public menu"
    requests:
      - get:
          url: "/api/method/ury.ury_customer.api.get_public_menu?restaurant=Test%20Restaurant"
EOF

# Run test
artillery run test.yml
```

## Extension Points

- **New API test**: Add curl example to `TESTING.md`
- **New workflow**: Document in E2E workflow section
- **Regression checklist**: Update checklist before releases

## Dependencies

- Frappe site with URY installed
- Test restaurant, branch, tables, menu configured
- POS Opening Entry (for cashier assignment)

## Gotchas

- **POS Opening required**: Customer orders need active cashier from POS Opening Entry
- **accepts_online_orders**: Must be checked on URY Restaurant for customer APIs
- **JWT secret**: Required in `site_config.json` for QR token generation
- **Cache clearing**: After code changes, run `bench clear-cache`
- **DB commit**: In console, always call `frappe.db.commit()` after saves
- **Guest APIs**: Test with and without authentication cookies

# URY Multi-App Architecture - Testing Guide

> **Comprehensive testing documentation for developers and QA**
> **Version**: 1.0
> **Last Updated**: 2026-03-26

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup Test Environment](#setup-test-environment)
3. [Backend Testing](#backend-testing)
4. [Frontend Testing](#frontend-testing)
5. [End-to-End Workflows](#end-to-end-workflows)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts

1. **Frappe Site** with URY installed
2. **Restaurant Setup** with:
   - Company
   - Branch
   - URY Restaurant (with `accepts_online_orders` checked)
   - URY Room
   - URY Tables
   - URY Menu with items
   - POS Profile

3. **Test Customer** (created automatically on first order)

### Required Configuration

```python
# site_config.json - JWT Secret for QR tokens
{
    "encryption_key": "your-secret-key-here"
}
```

---

## Setup Test Environment

### 1. Initial Setup

```bash
# Navigate to your bench
cd ~/frappe-bench

# Get the app
bench get-app https://github.com/ury-erp/ury.git

# Install on site
bench --site yoursite.com install-app ury

# Run migrations (includes patches for custom fields)
bench --site yoursite.com migrate

# Build frontend assets
bench build --app ury
```

### 2. Create Test Restaurant

```bash
# Start bench console
bench --site yoursite.com console
```

```python
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
restaurant.accepts_online_orders = 1
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

frappe.db.commit()
```

### 3. Setup POS Profile

```python
# Create POS Profile
pos_profile = frappe.new_doc("POS Profile")
pos_profile.name = "Main POS"
pos_profile.branch = branch.name
pos_profile.company = company.name
pos_profile.save()

# Create POS Opening Entry (for cashier assignment)
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

---

## Backend Testing

### Test 1: Public Menu API

```bash
# Test get_public_menu
curl -X GET "https://yoursite.com/api/method/ury.ury_customer.api.get_public_menu?restaurant=Test%20Restaurant" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "message": [
    {
      "item": "ITEM-001",
      "item_name": "Test Item",
      "rate": 100.0,
      "course": "Main Course"
    }
  ]
}
```

### Test 2: QR Token Generation

```bash
# Login as staff first
curl -X POST "https://yoursite.com/api/method/login" \
  -H "Content-Type: application/json" \
  -d '{"usr":"Administrator","pwd":"admin"}'

# Generate QR token for table
curl -X GET "https://yoursite.com/api/method/ury.ury_customer.api.generate_table_qr?table=Table-1" \
  -H "Content-Type: application/json" \
  --cookie "sid=your-session-id"
```

**Expected Response:**
```json
{
  "message": {
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "qr_url": "https://yoursite.com/order/t/eyJ0eXAiOiJKV1Qi...",
    "table": "Table-1",
    "restaurant": "Test Restaurant"
  }
}
```

### Test 3: QR Token Validation (Guest Access)

```bash
# Validate token (no auth required)
curl -X GET "https://yoursite.com/api/method/ury.ury_customer.api.validate_table_token?token=YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "message": {
    "restaurant": "Test Restaurant",
    "restaurant_name": "Test Restaurant",
    "table": "Table-1",
    "table_name": "Table 1",
    "room": "Main Hall",
    "valid": true
  }
}
```

### Test 4: Create Customer Order

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

**Expected Response:**
```json
{
  "message": {
    "order_token": "ABC12345",
    "invoice_id": "TR-00001",
    "status": "success",
    "grand_total": 200.0,
    "fulfillment_status": "Placed"
  }
}
```

### Test 5: Check Order Status

```bash
curl -X GET "https://yoursite.com/api/method/ury.ury_customer.api.get_order_status?order_token=ABC12345" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "message": {
    "order_token": "ABC12345",
    "invoice_id": "TR-00001",
    "fulfillment_status": "Placed",
    "order_source": "QR",
    "grand_total": 200.0
  }
}
```

### Test 6: Update Fulfillment Status

```bash
# Staff only - requires auth
curl -X POST "https://yoursite.com/api/method/ury.ury_customer.api.update_fulfillment_status" \
  -H "Content-Type: application/json" \
  -d '{
    "order_token": "ABC12345",
    "new_status": "Confirmed"
  }' \
  --cookie "sid=your-session-id"
```

---

## Frontend Testing

### Test QR Table Ordering Flow

#### Step 1: Generate QR Code (Staff)

1. Login to Frappe Desk as staff
2. Go to URY Table list
3. Click on Table-1
4. Click "Generate QR Code" button (if added to form)
5. Or use API to generate token

#### Step 2: Scan QR (Customer)

1. Open browser on mobile
2. Navigate to: `https://yoursite.com/order/t/YOUR_TOKEN`
3. Verify it redirects to menu page
4. Check that table context shows correct table

#### Step 3: Browse Menu

1. Menu items should load
2. Categories should be filterable
3. Add items to cart
4. Verify cart count updates

#### Step 4: Checkout

1. Go to cart
2. Enter customer name (required)
3. Enter phone (optional)
4. Click "Place Order"
5. Verify success message

#### Step 5: Track Order

1. Should redirect to status page
2. Status should show "Placed"
3. Should auto-update when staff changes status

### Test Online Ordering Flow

1. Navigate to: `https://yoursite.com/menu/test-restaurant`
2. Browse menu and add items
3. Go to checkout
4. Select pickup time
5. Place order
6. Track order status

---

## End-to-End Workflows

### Workflow 1: Complete QR Table Order

```
Staff: Open POS → POS Opening Entry → Open
Staff: Generate QR for Table-1
       ↓
Customer: Scan QR → Token validated → Menu loads
       ↓
Customer: Add items → Go to cart → Enter details → Place order
       ↓
Kitchen: KOT prints automatically
       ↓
Staff: See order in POS → Update status to "Confirmed"
       ↓
Customer: Real-time status update
       ↓
Kitchen: Prepare order
       ↓
Staff: Update status to "Ready"
       ↓
Customer: Notification that order is ready
       ↓
Staff: Serve order → Update status to "Served"
```

### Workflow 2: Online Pickup Order

```
Customer: Visit /menu/test-restaurant
       ↓
Customer: Browse menu → Add items
       ↓
Customer: Select pickup time (e.g., +30 mins)
       ↓
Customer: Enter phone → OTP verification (Phase 3+)
       ↓
Customer: Place order → Pay online (Phase 2.5+)
       ↓
Kitchen: Receive order with scheduled time
       ↓
Kitchen: Prepare at scheduled time
       ↓
Staff: Mark "Ready for Pickup"
       ↓
Customer: WhatsApp notification (Phase 2+)
       ↓
Customer: Arrive → Staff hands over → Mark "Picked Up"
```

---

## Troubleshooting

### Issue: "Restaurant not accepting online orders"

**Check:**
```python
# In bench console
restaurant = frappe.get_doc("URY Restaurant", "Test Restaurant")
print(restaurant.accepts_online_orders)  # Should be 1
```

**Fix:**
```python
restaurant.accepts_online_orders = 1
restaurant.save()
frappe.db.commit()
```

### Issue: "No active cashier found"

**Check:**
```python
# Verify POS Opening Entry exists
openings = frappe.get_all("POS Opening Entry", 
    filters={"status": "Open", "docstatus": 1},
    fields=["user", "branch"]
)
print(openings)
```

**Fix:**
Create POS Opening Entry as shown in setup section.

### Issue: "QR token invalid"

**Check:**
1. JWT secret is configured in site_config.json
2. Token hasn't expired
3. Table exists and is linked to correct restaurant

### Issue: Menu not loading

**Check:**
```python
# Verify menu exists and has items
restaurant = frappe.get_doc("URY Restaurant", "Test Restaurant")
print(restaurant.active_menu)

menu_items = frappe.get_all("URY Menu Item", 
    filters={"parent": restaurant.active_menu}
)
print(len(menu_items))
```

### Issue: KOT not generating

**Check:**
- KOT app is installed (optional dependency)
- Printer settings are configured
- No errors in logs: `bench --site yoursite.com show-error-log`

---

## Performance Testing

### Load Test APIs

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

---

## Regression Checklist

Before each release, verify:

- [ ] Staff POS still works normally
- [ ] Existing table orders work
- [ ] QR orders create correct POS Invoices
- [ ] KOT generation works
- [ ] Payment settlement works
- [ ] Reports show correct data
- [ ] Customer APIs respond < 500ms
- [ ] Realtime updates work

---

## Contact & Support

For issues:
1. Check logs: `bench --site yoursite.com show-error-log`
2. Check console for JavaScript errors
3. Create GitHub issue with error details

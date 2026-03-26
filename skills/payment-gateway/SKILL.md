---
category: features
name: payment-gateway
description: Payment processing API supporting multiple providers (Stripe, Razorpay, PayPal, Square) for customer orders
author: URY Team
version: 1.0.0
last_updated: 2026-03-26
dependencies: ["frappe", "erpnext"]
---

# Payment Gateway API

Payment processing API endpoints for URY restaurant ERP system. Supports multiple payment providers with a unified interface for initiating payments, verifying status, and handling webhooks.

---

## Supported Providers

| Provider | Status | Features |
|----------|--------|----------|
| **Stripe** | ✅ Fully implemented | PaymentIntents, automatic payment methods |
| **Razorpay** | ✅ Fully implemented | Orders, webhook signature verification |
| **PayPal** | 🚧 Placeholder | Coming soon |
| **Square** | 🚧 Placeholder | Coming soon |

---

## API Endpoints

| Endpoint | Access | Purpose |
|----------|--------|---------|
| `initiate_payment(order_id, gateway, amount, currency, **kwargs)` | Guest | Start payment session, returns checkout details |
| `verify_payment(order_id, gateway_reference)` | Guest | Check payment status with provider |
| `handle_webhook(provider, **kwargs)` | Guest | Receive async notifications from payment providers |
| `get_payment_status(payment_id)` | Authenticated | Get URY Payment record status |
| `list_payment_gateways(restaurant=None)` | Authenticated | List active gateways for a restaurant |

### Endpoint Details

#### `initiate_payment(order_id, gateway, amount, currency, **kwargs)`

Creates a payment session with the selected gateway.

**Provider-Specific Returns:**

**Stripe:**
```python
{
  "status": "success",
  "provider": "Stripe",
  "client_secret": "pi_xxx_secret_yyy",  # For Stripe.js
  "payment_intent_id": "pi_xxx",
  "payment_record": "URY-PAY-2024-00001",
  "publishable_key": "pk_test_..."
}
```

**Razorpay:**
```python
{
  "status": "success",
  "provider": "Razorpay",
  "order_id": "order_xxx",  # For Razorpay checkout
  "amount": 25000,  # in paise
  "currency": "INR",
  "payment_record": "URY-PAY-2024-00001",
  "key_id": "rzp_test_..."
}
```

**Validation:**
- Validates gateway is active
- Validates order exists
- Validates amount matches order grand_total
- Creates `URY Payment` record with status "Initiated"

#### `handle_webhook(provider, **kwargs)`

Processes async payment notifications from providers.

**Security:**
- Verifies webhook signature using `webhook_secret`
- Rejects unverified webhooks in production
- Logs all webhook attempts

**Events Handled:**

| Provider | Events |
|----------|--------|
| Stripe | `payment_intent.succeeded`, `payment_intent.payment_failed` |
| Razorpay | `order.paid`, `payment.failed` |

---

## Key Files

| File | Purpose |
|------|---------|
| `ury/ury_payment/api.py` | Main payment API with provider implementations |
| `ury/ury_payment/doctype/ury_payment/` | Payment record DocType |
| `ury/ury_payment/doctype/ury_payment_gateway/` | Gateway configuration DocType |
| `ury/ury_payment/__init__.py` | Module init |

---

## How It Works

### Payment Flow

```
Customer places order
       │
       ▼
initiate_payment() ──► Create URY Payment record
       │
       ├── Stripe ──► Create PaymentIntent
       │                  └── Return client_secret
       │
       └── Razorpay ──► Create Order
                          └── Return order_id
       │
       ▼
Frontend uses credentials to show checkout
       │
       ▼
Customer completes payment on provider page
       │
       ▼
Provider sends webhook ──► handle_webhook()
       │                        ├── Verify signature
       │                        ├── Update URY Payment status
       │                        └── Update POS Invoice payment_status
       │
       ▼
verify_payment() can poll for status if needed
```

### Webhook Signature Verification

**Razorpay:**
```python
expected_signature = hmac.new(
    webhook_secret.encode(),
    payload.encode(),
    hashlib.sha256
).hexdigest()

if not hmac.compare_digest(expected_signature, signature):
    return {"status": "error", "message": "Invalid signature"}
```

**Stripe:**
Uses Stripe library for signature verification (placeholder in current code).

### Payment Status States

```
Initiated → Pending → Completed
                ↘
                  → Failed
```

- `Initiated` - Payment record created
- `Pending` - Provider session created, awaiting customer
- `Completed` - Payment confirmed by provider
- `Failed` - Payment failed or cancelled

---

## Extension Points

### Adding a New Provider

1. Add provider to `initiate_payment()` router:

```python
elif provider == "YourProvider":
    return initiate_yourprovider_payment(payment_record, gateway_doc, order, kwargs)
```

2. Implement initiation function:

```python
def initiate_yourprovider_payment(payment_record, gateway_doc, order, kwargs):
    credentials = gateway_doc.get_credentials()
    # Initialize SDK with credentials
    # Create payment session
    
    payment_record.gateway_reference = session_id
    payment_record.status = "Pending"
    payment_record.save(ignore_permissions=True)
    
    return {
        "status": "success",
        "provider": "YourProvider",
        "session_id": session_id,
        # ... other fields frontend needs
    }
```

3. Add verification:

```python
def verify_yourprovider_payment(payment_doc, gateway_doc):
    # Check payment status with provider API
    # Update payment_doc.status
    # Update order payment status if completed
```

4. Add webhook handler:

```python
def handle_yourprovider_webhook(payload, gateway_doc):
    data = json.loads(payload)
    # Process webhook events
    # Update payment status
```

5. Add signature verification:

```python
def verify_webhook_signature(provider, payload, headers, gateway_doc):
    # Add your provider's verification logic
    elif provider_lower == "yourprovider":
        signature = headers.get("X-YourProvider-Signature", "")
        # Verify HMAC or other signature method
```

### Custom Payment Flow

Hook into payment completion:

```python
def update_order_payment_status(order_id, status):
    # Existing code...
    
    # Add custom logic
    if status == "Paid":
        frappe.enqueue(
            "my_app.notifications.send_payment_confirmation",
            order_id=order_id
        )
```

---

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `frappe` | Core Frappe framework |
| `hmac`, `hashlib` | Webhook signature verification |
| `stripe` (optional) | Stripe Python SDK |
| `razorpay` (optional) | Razorpay Python SDK |

### DocType Dependencies

- `URY Payment` - Payment transaction records
- `URY Payment Gateway` - Gateway configuration (provider, credentials, test_mode)
- `POS Invoice` - Order documents with payment_status field

---

## Gotchas

### Webhook Secret Configuration

Each gateway DocType stores encrypted credentials. The `webhook_secret` field must be set for production webhook verification:

```python
credentials = gateway_doc.get_credentials()
webhook_secret = credentials.get("webhook_secret")

if not webhook_secret:
    # In development: accepts all webhooks
    # In production: should reject
    return True
```

### Order ID Resolution

`get_order_details()` tries multiple lookups:
1. Direct POS Invoice name match
2. customer_order_token match (for customer orders)

This allows payment by either invoice ID or customer-facing order token.

### Currency Handling

| Provider | Amount Format | Example |
|----------|---------------|---------|
| Stripe | Cents (integer) | `$25.00` → `2500` |
| Razorpay | Paise (integer) | `₹250.00` → `25000` |

Always convert before sending to provider:

```python
# Stripe
amount=int(float(payment_record.amount) * 100)

# Razorpay  
amount=int(float(payment_record.amount) * 100)
```

### Duplicate Payment Prevention

`create_payment_record()` checks for existing pending payments:

```python
existing = frappe.get_all(
    "URY Payment",
    filters={
        "order_id": order_id,
        "status": ["in", ["Pending", "Initiated"]]
    }
)

if existing:
    return frappe.get_doc("URY Payment", existing[0].name)
```

### Realtime Events

Payment status updates publish realtime events:

```python
frappe.publish_realtime(
    "payment_status_update",
    {"order_id": order_id, "status": status}
)
```

Frontend can subscribe to these for live updates.

### Error Handling

Payment initiation failures update the payment record:

```python
except Exception as e:
    payment_record.status = "Failed"
    payment_record.error_message = str(e)
    payment_record.save(ignore_permissions=True)
    frappe.throw(_(f"Payment initiation failed: {str(e)}"))
```

### Gateway Scope

Gateways can be:
- Global (no branch specified)
- Branch-specific

`list_payment_gateways()` filters by restaurant's branch plus global gateways.

---

## Related Skills

- [customer-api](./customer-api) - Order creation that triggers payments
- [staff-pos-api](./staff-pos-api) - POS operations with payment integration

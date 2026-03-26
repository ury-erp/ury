---
name: realtime
description: Frappe realtime/WebSocket patterns for live updates in URY. Use when implementing order status updates, KOT push notifications, payment status updates, or any real-time feature that requires server-to-client communication.
category: backend
---

# Frappe Realtime Patterns for URY

Server-to-client communication using Frappe's WebSocket-based realtime system.

## Key Files

| File | Purpose |
|------|---------|
| `ury/ury_customer/api.py` | Order status updates via `publish_realtime` |
| `ury/ury/doctype/ury_kot/ury_kot.py` | KOT push to Kitchen Display System |
| `ury/ury/doctype/ury_order/ury_order.py` | Order update notifications |
| `ury/ury_payment/api.py` | Payment status realtime updates |
| `ury/ury/hooks/ury_pos_invoice.py` | POS invoice submission notifications |
| `ury/ury/api/ury_print.py` | Print job realtime triggers |

## How It Works

### Backend: Publishing Events

```python
import frappe

# Basic event publication
frappe.publish_realtime(
    "event_name",
    {"key": "value", "data": "payload"}
)

# Target specific user
frappe.publish_realtime(
    "order_status_update",
    {"order_token": "ABC123", "status": "Ready"},
    user="customer@example.com"
)

# Target all users in a channel
frappe.publish_realtime(
    "new_customer_order",
    {
        "order_token": order_token,
        "restaurant": restaurant,
        "table": table,
        "order_source": order_source
    }
)
```

### Frontend: Subscribing to Events

```typescript
// Using Frappe's realtime API
frappe.realtime.on("order_status_update", (data) => {
    console.log("Order status:", data.status);
    updateOrderUI(data);
});

// Subscribe to KOT updates
const kotChannel = `kot_update_${branch}_${productionUnit}`;
frappe.realtime.on(kotChannel, (data) => {
    displayKOT(data.kot);
    playNotificationSound(data.audio_file);
});

// Cleanup when component unmounts
frappe.realtime.off("order_status_update", handler);
```

### Order Status Pattern

```python
# ury/ury_customer/api.py
@frappe.whitelist()
def update_fulfillment_status(order_token, new_status, notes=None):
    # Find and update invoice
    invoice_name = frappe.db.get_value(
        "POS Invoice",
        {"customer_order_token": order_token},
        "name"
    )
    invoice = frappe.get_doc("POS Invoice", invoice_name)
    old_status = invoice.fulfillment_status
    invoice.fulfillment_status = new_status
    invoice.save()
    
    # Log the change
    frappe.get_doc({
        "doctype": "Comment",
        "comment_type": "Info",
        "reference_doctype": "POS Invoice",
        "reference_name": invoice.name,
        "content": f"Status changed from {old_status} to {new_status}"
    }).insert(ignore_permissions=True)
    
    # Publish realtime update
    frappe.publish_realtime(
        f"order_status_{order_token}",
        {
            "order_token": order_token,
            "fulfillment_status": new_status,
            "previous_status": old_status,
            "timestamp": frappe.utils.now()
        }
    )
```

### KOT Push to Kitchen Display

```python
# ury/ury/doctype/ury_kot/ury_kot.py
cache_key = f"last_kot_time_{currentBranch}_{production}"
time = frappe.cache().get_value(cache_key)
kot_channel = f"kot_update_{currentBranch}_{production}"

frappe.publish_realtime(
    kot_channel,
    {
        "kot": kotjson,
        "audio_file": audio_file,
        "last_kot_time": time
    }
)
frappe.cache().set_value(cache_key, self.time)
```

### Payment Status Updates

```python
# ury/ury_payment/api.py
frappe.publish_realtime(
    "payment_status_update",
    {
        "order_id": order_id,
        "status": status,
        "amount": amount,
        "timestamp": frappe.utils.now()
    }
)
```

### Print Job Triggers

```python
# ury/ury/api/ury_print.py
print_channel = f"print_{branch}"
frappe.publish_realtime(
    print_channel,
    {"data": print_data, "invoice": name}
)
```

### Channel Naming Conventions

| Channel Pattern | Use Case |
|-----------------|----------|
| `kot_update_{branch}_{production}` | Kitchen Display System per production unit |
| `print_{branch}` | Print jobs for a branch |
| `order_status_{order_token}` | Order-specific status updates |
| `new_customer_order` | Broadcast new orders to staff |
| `payment_status_update` | Payment completion notifications |
| `reload_ro` | POS invoice refresh triggers |

## Extension Points

- **New event type**: Define channel name, publish in backend, subscribe in frontend
- **User-specific updates**: Add `user=` parameter to target specific sessions
- **Room/channel isolation**: Include branch/production identifiers in channel names

## Dependencies

- Frappe Framework (realtime module)
- WebSocket support enabled in Frappe site config

## Gotchas

- **Channel scope**: Events without `user=` are broadcast to all connected clients
- **Unique channels**: Use descriptive channel names with identifiers (branch, order_token) to avoid collisions
- **Client cleanup**: Always call `frappe.realtime.off()` when component unmounts to prevent memory leaks
- **Socket connection**: Realtime requires active WebSocket connection; handle reconnections in UI
- **No persistence**: Realtime events are not stored; clients joining later won't receive past events
- **Error handling**: Wrap `publish_realtime` calls in try/except - failures shouldn't break the main flow

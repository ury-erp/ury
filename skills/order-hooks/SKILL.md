---
category: patterns
name: order-hooks
description: Order lifecycle React hooks (@ury/order package)
version: 1.0.0
---

# Order Hooks Skill

React hooks for managing order lifecycle in URY applications - creation, status tracking, and real-time updates.

## Quick Start

```tsx
import { useCreateOrder, useOrderStatus, useRealtimeOrderStatus } from '@ury/order';
import { ORDER_SOURCES, DINE_IN } from '@ury/config';

function OrderPage() {
  // Create order
  const { createOrder, loading: creating, error, order } = useCreateOrder();
  
  // Poll order status
  const { status, loading, refresh } = useOrderStatus(order?.order_token || null);
  
  // Real-time updates
  const realtimeStatus = useRealtimeOrderStatus(order?.order_token || null);

  const handleSubmit = async (items) => {
    await createOrder({
      restaurant: 'Rest-001',
      items,
      order_type: DINE_IN,
      order_source: 'QR',
      customer_name: 'John Doe',
      table_token: 'abc123',
    });
  };

  return (
    <div>
      Current Status: {realtimeStatus?.fulfillment_status || status?.fulfillment_status}
    </div>
  );
}
```

## Hook API Reference

### useCreateOrder

Hook for creating new customer orders.

```tsx
const { createOrder, loading, error, order } = useCreateOrder();

// Create order
const result = await createOrder({
  restaurant: 'Rest-001',        // Required: Restaurant ID
  items: [{                      // Required: Order items
    item_code: 'ITEM-001',
    qty: 2,
    rate: 150,
    comment: 'Extra spicy'
  }],
  order_type: 'Dine In',         // Required: From ORDER_TYPES
  order_source: 'QR',            // Required: From ORDER_SOURCES
  customer_name: 'John Doe',     // Optional
  customer_phone: '+1234567890', // Optional
  table: 'Table-001',            // Optional: Table ID
  table_token: 'token123',       // Optional: QR token
  comments: 'Birthday celebration', // Optional
  scheduled_time: '2024-01-15T18:00:00', // Optional
});
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `createOrder` | `(data: CreateOrderRequest) => Promise<CreateOrderResponse>` | Create order function |
| `loading` | `boolean` | True while API call in progress |
| `error` | `string \| null` | Error message if request failed |
| `order` | `CreateOrderResponse \| null` | Created order data |

**CreateOrderResponse:**

```ts
{
  order_token: string;        // Unique customer-facing token
  invoice_id: string;         // ERPNext POS Invoice ID
  status: 'success' | 'error';
  message: string;
  grand_total: number;
  customer_name?: string;
  table?: string;
  fulfillment_status: FulfillmentStatus; // "Placed"
}
```

### useOrderStatus

Hook for polling order status from the backend.

```tsx
const { status, loading, error, refresh } = useOrderStatus(orderToken);

// Manual refresh
const handleRefresh = () => refresh();
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `orderToken` | `string \| null` | Order token to track |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `status` | `OrderStatus \| null` | Current order status |
| `loading` | `boolean` | Loading state |
| `error` | `string \| null` | Error message |
| `refresh` | `() => void` | Manual refresh function |

**OrderStatus:**

```ts
{
  order_token: string;
  invoice_id: string;
  status: string;                    // ERPNext status
  fulfillment_status: FulfillmentStatus; // Customer-facing status
  order_source: OrderSource;
  restaurant: string;
  table?: string;
  customer_name?: string;
  contact_mobile?: string;
  grand_total: number;
  created_at: string;
  updated_at: string;
}
```

### useRealtimeOrderStatus

Hook for subscribing to real-time order status updates via Frappe realtime.

```tsx
const status = useRealtimeOrderStatus(orderToken);

// Status updates automatically when backend publishes event
// Event name: order_status_{orderToken}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `orderToken` | `string \| null` | Order token to subscribe to |

**Returns:**

| Type | Description |
|------|-------------|
| `OrderStatus \| null` | Latest status from realtime updates |

## How It Works

### Order Creation Flow

```
useCreateOrder
    ↓
createCustomerOrder API
    ↓
POST /api/method/ury.ury_customer.api.create_customer_order
    ↓
Backend validates, creates POS Invoice
    ↓
Returns order_token + invoice_id
```

### Status Polling Pattern

```tsx
// useOrderStatus uses useEffect + useCallback for data fetching
const fetchStatus = useCallback(async () => {
  if (!orderToken) return;
  setLoading(true);
  try {
    const result = await getOrderStatus(orderToken);
    setStatus(result);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}, [orderToken]);

useEffect(() => {
  fetchStatus();
}, [fetchStatus]);
```

### Real-time Subscription Pattern

```tsx
// useRealtimeOrderStatus integrates with Frappe's realtime system
useEffect(() => {
  if (!orderToken || typeof window === 'undefined') return;
  
  const frappe = (window as any).frappe;
  if (!frappe?.realtime) return;
  
  const eventName = `order_status_${orderToken}`;
  const handler = (data: any) => {
    setStatus(prev => prev ? { ...prev, ...data } : data);
  };
  
  frappe.realtime.on(eventName, handler);
  
  return () => {
    frappe.realtime.off(eventName, handler);
  };
}, [orderToken]);
```

### Fulfillment Status Lifecycle

```
Placed → Confirmed → Preparing → Ready → Served/Picked Up/Delivered
   ↓
Cancelled (terminal from any state)
```

Statuses from `@ury/config`:
- `Placed` - Order received
- `Confirmed` - Confirmed by restaurant
- `Preparing` - Being prepared
- `Ready` - Ready for pickup
- `Served` - Dine-in complete
- `Picked Up` - Takeaway complete
- `Out for Delivery` - On the way
- `Delivered` - Delivery complete
- `Cancelled` - Order cancelled

## Extension Points

### Adding a New Order Hook

```tsx
// packages/order/src/hooks.ts
export function useCancelOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelOrder = useCallback(async (orderToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await cancelCustomerOrder(orderToken);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { cancelOrder, loading, error };
}
```

### Combining Hooks

```tsx
// Custom hook combining status polling and realtime
export function useOrderTracking(orderToken: string | null) {
  const pollStatus = useOrderStatus(orderToken);
  const realtimeStatus = useRealtimeOrderStatus(orderToken);
  
  // Realtime takes precedence over polling
  const status = realtimeStatus || pollStatus.status;
  
  return {
    status,
    loading: pollStatus.loading,
    error: pollStatus.error,
    refresh: pollStatus.refresh,
  };
}
```

### Adding Order Types/Sources

Extend in `@ury/config`:

```tsx
// packages/config/src/order-types.ts
export const ORDER_TYPES: OrderTypeConfig[] = [
  // ...existing types
  {
    label: "Drive Thru",
    value: "Drive Thru",
    description: "Drive-through pickup",
    requiresTable: false,
    allowScheduled: false,
  },
];
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/order/src/hooks.ts` | React hooks implementation |
| `packages/order/src/order-api.ts` | API client functions |
| `packages/order/src/types.ts` | TypeScript interfaces |
| `packages/config/src/order-types.ts` | Order type constants |
| `packages/order/package.json` | Package configuration |

## Dependencies

```json
{
  "dependencies": {
    "@ury/config": "workspace:*",
    "@ury/api-client": "workspace:*",
    "react": "^18.0.0"
  }
}
```

## Gotchas

### Null Token Handling

Hooks accept `null` tokens to handle conditional fetching:

```tsx
// Safe - hook handles null internally
const { status } = useOrderStatus(orderToken || null);

// Don't conditionally call hooks
const { status } = orderToken ? useOrderStatus(orderToken) : { status: null }; // Wrong!
```

### Server-Side Rendering

Always check `typeof window` for Frappe globals:

```tsx
// useRealtimeOrderStatus handles SSR
if (typeof window === 'undefined') return; // Guard for SSR

const frappe = (window as any).frappe;
if (!frappe?.realtime) return; // Guard for missing Frappe
```

### Memory Leaks in Realtime

Always clean up event listeners:

```tsx
useEffect(() => {
  frappe.realtime.on(eventName, handler);
  
  return () => {
    frappe.realtime.off(eventName, handler); // Critical!
  };
}, [orderToken]);
```

### Order Token vs Invoice ID

- `order_token` - Customer-facing identifier (used in hooks)
- `invoice_id` - Internal ERPNext POS Invoice ID

```tsx
// Use order_token for customer-facing features
const { status } = useOrderStatus(order.order_token);

// Use invoice_id for admin/staff operations
const invoiceUrl = `/app/pos-invoice/${order.invoice_id}`;
```

### Loading State Management

Each hook manages its own loading state independently:

```tsx
const { createOrder, loading: creating } = useCreateOrder();
const { status, loading: fetching } = useOrderStatus(token);

// Check both for full-page loader
const isLoading = creating || fetching;
```

### Error Handling Pattern

Errors are caught and stored as strings:

```tsx
const { error, createOrder } = useCreateOrder();

// Display error
{error && <Alert variant="error">{error}</Alert>}

// Or handle programmatically
try {
  await createOrder(data);
} catch (err) {
  // Error already set in hook state
  // Additional handling here
}
```

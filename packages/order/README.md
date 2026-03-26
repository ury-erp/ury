# @ury/order

Order lifecycle management and status tracking for URY applications.

## Installation

```bash
yarn add @ury/order
```

## Usage

```tsx
import { useCreateOrder, useOrderStatus } from '@ury/order';

function OrderPage() {
  const { createOrder, loading, order } = useCreateOrder();
  const { status } = useOrderStatus(order?.order_token || null);

  const handlePlaceOrder = async () => {
    const result = await createOrder({
      restaurant: 'My Restaurant',
      items: [{ item_code: 'ITEM-001', qty: 2 }],
      order_type: 'Dine In',
      order_source: 'QR',
      customer_name: 'John Doe',
      customer_phone: '+1234567890'
    });
    console.log('Order token:', result.order_token);
  };

  return (
    <div>
      <button onClick={handlePlaceOrder} disabled={loading}>
        Place Order
      </button>
      {status && <p>Status: {status.fulfillment_status}</p>}
    </div>
  );
}
```

## Hooks

- `useCreateOrder()` - Create customer orders
- `useOrderStatus(token)` - Track order status
- `useRealtimeOrderStatus(token)` - Real-time status updates

## Part of URY

This package is part of the [URY](https://github.com/ury-erp/ury) restaurant ERP system.

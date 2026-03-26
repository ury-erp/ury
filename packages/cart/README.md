# @ury/cart

Shared cart state management for URY applications.

## Installation

```bash
yarn add @ury/cart
```

## Usage

```tsx
import { useCart, useCartTotals } from '@ury/cart';

function MenuPage() {
  const { addItem, removeItem, updateQuantity, items } = useCart();
  const totals = useCartTotals();

  const handleAddToCart = (item) => {
    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
    });
  };

  return (
    <div>
      <p>Items: {totals.itemCount}</p>
      <p>Total: ${totals.total}</p>
      {/* Render cart items */}
    </div>
  );
}
```

## Features

- Zustand-based state management
- TypeScript support
- Automatic unique ID generation for items with variants/addons
- Cart totals calculation (subtotal, tax, total)
- Quantity validation

## API

### `useCart()`

Returns cart state and actions:
- `items` - Cart items array
- `addItem(item)` - Add item to cart
- `removeItem(uniqueId)` - Remove item by unique ID
- `updateQuantity(uniqueId, quantity)` - Update item quantity
- `clearCart()` - Remove all items

### `useCartTotals()`

Returns calculated totals:
- `subtotal`
- `tax`
- `total`
- `itemCount`

## Part of URY

This package is part of the [URY](https://github.com/ury-erp/ury) restaurant ERP system.

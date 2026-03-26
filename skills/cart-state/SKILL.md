---
title: URY Cart State Management
category: patterns
description: Zustand-based cart state management (@ury/cart) for shared cart functionality across URY applications
usage: |
  Use for cart functionality in any URY frontend app (POS, Online Ordering, Kiosk).
  Provides item management, quantity updates, comments, and total calculations.
---

# URY Cart State Management

The `@ury/cart` package provides a centralized, persistent cart state using Zustand. It handles item variants, addons, quantity management, and total calculations across all URY ordering interfaces.

## Key Files

| File | Purpose |
|------|---------|
| `packages/cart/src/cart-store.ts` | Main Zustand store with actions |
| `packages/cart/src/types.ts` | TypeScript interfaces and configuration |
| `packages/cart/src/utils.ts` | Utility functions and helpers |
| `packages/cart/src/index.ts` | Package exports |

## Quick Start

```typescript
import { useCart, useCartTotals, useIsCartEmpty } from '@ury/cart';

function MenuPage() {
  const { items, addItem, removeItem, updateQuantity } = useCart();
  const totals = useCartTotals();
  const isEmpty = useIsCartEmpty();

  const handleAddToCart = (product) => {
    addItem({
      id: product.item_code,
      name: product.item_name,
      price: product.rate,
      quantity: 1,
      selectedVariant: product.variant,
      selectedAddons: product.addons
    });
  };

  return (
    <div>
      <span>Items: {totals.itemCount} | Total: ${totals.total}</span>
      {!isEmpty && <button onClick={() => checkout()}>Checkout</button>}
    </div>
  );
}
```

## How It Works

### Store Architecture

The cart uses Zustand for state management with a split between state and actions:

```typescript
// State
interface CartState {
  items: CartItem[];        // Cart line items
  isLoading: boolean;       // Async operation indicator
  error: string | null;     // Error message
}

// Actions
interface CartActions {
  addItem: (item: Omit<CartItem, 'uniqueId'>) => void;
  removeItem: (uniqueId: string) => void;
  updateQuantity: (uniqueId: string, quantity: number) => void;
  updateComment: (uniqueId: string, comment: string) => void;
  clearCart: () => void;
  getTotals: () => CartTotals;
  getItemQuantity: (itemId: string, variantId?: string, addonIds?: string[]) => number;
  itemExists: (uniqueId: string) => boolean;
}

// Combined store type
type CartStore = CartState & CartActions;
```

### Item Identity (Unique ID)

Items are uniquely identified by a combination of:
- Base item ID
- Selected variant ID
- Sorted addon IDs

```typescript
// From utils.ts
function generateUniqueId(item): string {
  const variantId = item.selectedVariant?.id || 'default';
  const addonIds = item.selectedAddons?.map(a => a.id).sort().join('-') || 'no-addons';
  return `${item.id}-${variantId}-${addonIds}`;
}

// Examples:
// "BURGER-default-no-addons"           - Plain burger
// "BURGER-lg-cheese-bacon"             - Large burger + cheese + bacon
// "BURGER-lg-bacon-cheese"             // Same as above (addons sorted)
```

### Item Structure

```typescript
interface CartItem {
  id: string;                    // Product/item code
  name: string;                  // Display name
  price: number;                 // Base price
  quantity: number;              // Quantity in cart
  image?: string | null;         // Product image URL
  description?: string;          // Product description
  uniqueId: string;              // Auto-generated identifier
  comment?: string;              // Special instructions
  tax_rate?: number;             // Tax percentage
  selectedVariant?: CartItemVariant;   // Size, etc.
  selectedAddons?: CartItemAddon[];    // Extras, sides
}

interface CartItemVariant {
  id: string;
  name: string;
  price: number;  // Absolute price, not delta
}

interface CartItemAddon {
  id: string;
  name: string;
  price: number;
  category?: 'sides' | 'drinks' | 'desserts';
}
```

### Price Calculation

```typescript
// Item price = variant price (or base) + sum of addon prices
function calculateItemPrice(item): number {
  const basePrice = item.selectedVariant?.price || item.price;
  const addonsTotal = item.selectedAddons?.reduce((sum, addon) => sum + addon.price, 0) || 0;
  return basePrice + addonsTotal;
}

// Cart totals with tax
function calculateCartTotals(items): CartTotals {
  const subtotal = items.reduce((sum, item) => {
    return sum + (calculateItemPrice(item) * item.quantity);
  }, 0);

  const tax = items.reduce((sum, item) => {
    const taxRate = item.tax_rate || 0;
    return sum + (calculateItemPrice(item) * item.quantity * (taxRate / 100));
  }, 0);

  return { subtotal, tax, total: subtotal + tax, itemCount };
}
```

## API Reference

### Core Hook: `useCart()`

Returns full cart state and all actions:

```typescript
const {
  items,           // CartItem[]
  isLoading,       // boolean
  error,           // string | null
  addItem,         // (item) => void
  removeItem,      // (uniqueId) => void
  updateQuantity,  // (uniqueId, quantity) => void
  updateComment,   // (uniqueId, comment) => void
  clearCart,       // () => void
  getTotals,       // () => CartTotals
  getItemQuantity, // (itemId, variantId?, addonIds?) => number
  itemExists       // (uniqueId) => boolean
} = useCart();
```

### Convenience Hooks

```typescript
// Get calculated totals (re-computed on render)
const { subtotal, tax, total, itemCount } = useCartTotals();

// Check if cart is empty
const isEmpty = useIsCartEmpty();

// Get total item count (sum of quantities)
const count = useCartItemCount();
```

### Action Details

#### `addItem(item)`
Adds item to cart or increments quantity if identical item exists.

```typescript
addItem({
  id: 'BURGER-001',
  name: 'Cheese Burger',
  price: 10.00,
  quantity: 2,
  selectedVariant: { id: 'lg', name: 'Large', price: 12.00 },
  selectedAddons: [
    { id: 'cheese', name: 'Extra Cheese', price: 1.50 },
    { id: 'bacon', name: 'Bacon', price: 2.00 }
  ],
  comment: 'No onions please'
});
// Price calculation: $12.00 + $1.50 + $2.00 = $15.50 per item
// Total for 2: $31.00
```

**Behavior:**
- If identical item (same uniqueId) exists, quantities are merged
- Throws `CartError` if total quantity exceeds `maxQuantity` (99)

#### `updateQuantity(uniqueId, quantity)`
Updates quantity for a specific cart item.

```typescript
updateQuantity('BURGER-001-lg-cheese-bacon', 3);
// Throws CartError if quantity < 0 or > 99
```

#### `updateComment(uniqueId, comment)`
Updates special instructions for an item.

```typescript
updateComment('BURGER-001-lg-cheese-bacon', 'Extra well done');
```

#### `removeItem(uniqueId)`
Removes item entirely from cart.

```typescript
removeItem('BURGER-001-lg-cheese-bacon');
```

#### `clearCart()`
Removes all items.

```typescript
// Typically after successful order
const { clearCart } = useCart();
await submitOrder();
clearCart();
```

## Extension Points

### Custom Configuration

```typescript
// Override defaults via config parameter (future enhancement)
const config: CartConfig = {
  maxQuantity: 50,        // Default: 99
  minQuantity: 1,         // Default: 0
  taxIncluded: true,      // Default: false
  defaultTaxRate: 8.5     // Default: 0
};
```

### Persisting Cart State

```typescript
// Add persistence with Zustand middleware
import { persist } from 'zustand/middleware';

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      // ... store implementation
    }),
    {
      name: 'ury-cart-storage',
      partialize: (state) => ({ items: state.items }) // Only persist items
    }
  )
);
```

### Adding Custom Actions

```typescript
// Extend store with new actions
export const useCartStore = create<CartStore & CustomActions>((set, get) => ({
  // ... existing cart actions
  
  // Add discount code
  applyDiscount: (code: string, percentage: number) => {
    set({ discountCode: code, discountPercent: percentage });
  },
  
  // Merge guest cart after login
  mergeCart: (serverCart: CartItem[]) => {
    const localItems = get().items;
    // Merge logic here
    set({ items: mergedItems });
  }
}));
```

### Integration with Backend

```typescript
// Sync cart to backend on changes
import { useEffect } from 'react';
import { useCartStore } from '@ury/cart';
import { db } from '@ury/api-client';

export function useCartSync() {
  const items = useCartStore(state => state.items);
  
  useEffect(() => {
    // Debounced sync to backend
    const timeout = setTimeout(() => {
      db.updateDoc('URY Order', currentOrder, { cart_items: items });
    }, 1000);
    
    return () => clearTimeout(timeout);
  }, [items]);
}
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `zustand` | ^5.0.6 | State management |
| `react` | ^19.0.0 | Peer dependency (hooks) |
| `typescript` | ~5.7.2 | Type checking |

## Gotchas

### Unique ID Generation
Items with different variants/addons are separate line items:
```typescript
// These are TWO separate cart items:
addItem({ id: 'BURGER', selectedVariant: { id: 'sm', ... } });
addItem({ id: 'BURGER', selectedVariant: { id: 'lg', ... } });
// Cart will have 2 items, not 1 with qty 2
```

### Price in Variants
Variant price is absolute, not additive:
```typescript
// WRONG: price as delta
{ id: 'lg', name: 'Large', price: 2.00 }  // Don't do this

// CORRECT: absolute price
{ id: 'lg', name: 'Large', price: 12.00 } // Base is $10, large is $12
```

### Quantity Validation
- Minimum: 0 (use removeItem for 0)
- Maximum: 99 (configurable)
- Throws `CartError` on violation

### Comment Updates Don't Merge
When merging identical items, the comment from the new item wins:
```typescript
addItem({ id: 'BURGER', comment: 'No salt' });      // First add
addItem({ id: 'BURGER', comment: 'Extra cheese' }); // Merges, comment = 'Extra cheese'
```

### Tax Calculation Per-Item
Tax is calculated per-item and summed, not on subtotal. This handles mixed tax rates:
```typescript
// Item A: $10, 5% tax = $0.50
// Item B: $20, 10% tax = $2.00
// Total tax: $2.50 (not $30 * 7.5% = $2.25)
```

### No Built-in Persistence
Cart is in-memory only by default. Add `persist` middleware for localStorage.

### React Dependency
Hooks (`useCart`, `useCartTotals`) require React. For non-React usage:
```typescript
import { useCartStore } from '@ury/cart';
const store = useCartStore.getState();
store.addItem({ ... });
```

### Thread Safety
Zustand stores are not thread-safe. Don't modify from web workers without proper serialization.

### Memory Leaks in Selectors
When selecting from store, use shallow equality for arrays:
```typescript
// Subscribes to every item change
const items = useCartStore(state => state.items);

// Better: select only what you need
const itemCount = useCartStore(state => state.items.length);
```

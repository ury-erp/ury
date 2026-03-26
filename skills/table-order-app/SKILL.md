---
title: Table Order App
description: QR Table Ordering application for customers to scan and order from their table
path: apps/table-order
category: features
tags: [ordering, qr, customer, table, dine-in]
---

# Table Order App

QR Table Ordering application that allows customers to scan a QR code at their table and place orders directly from their mobile device.

## Overview

The Table Order app enables contactless, self-service ordering for dine-in customers. Each table has a unique QR code that customers scan to access the restaurant's menu and place orders without waiter assistance.

**Key Features:**
- QR code token validation for table identification
- Public menu browsing with category filters
- Cart management with add/remove functionality
- Customer details collection (name, phone, comments)
- Order status tracking
- Mobile-optimized responsive design

## Pages/Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/t/:token` | `TokenResolver` | Validates QR token and redirects to menu with table context |
| `/menu/:restaurant` | `Menu` | Public menu with category filter and cart actions |
| `/cart` | `Cart` | Cart review, customer details, order placement |
| `/status/:orderToken` | `OrderStatus` | Real-time order status tracking page |
| `/` | - | Landing page with QR scan instruction |

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app with route definitions |
| `src/pages/TokenResolver.tsx` | QR token validation and table context setup |
| `src/pages/Menu.tsx` | Menu display with category filtering and cart integration |
| `src/pages/Cart.tsx` | Cart management and order placement form |
| `src/pages/OrderStatus.tsx` | Order tracking and status display |
| `src/main.tsx` | App entry point with React providers |
| `package.json` | Dependencies and build scripts |

## How It Works

### 1. QR Code Flow
```
Customer scans QR → /t/:token → TokenResolver validates → 
Stores context in sessionStorage → Redirects to /menu/:restaurant?table=X
```

The `TokenResolver` page:
- Validates the QR token via `useTableToken()` hook
- Stores `tableContext` and `tableToken` in `sessionStorage`
- Redirects to menu with table parameter

### 2. Menu Browsing
- Fetches public menu via `usePublicMenu(restaurant, 'Dine In')`
- Extracts unique categories for filter buttons
- Shows item image, name, description, price
- Quick add/remove with quantity controls
- Cart badge shows item count

### 3. Cart & Checkout
- Retrieves table context from `sessionStorage`
- Collects customer name (required), phone (optional), comments
- Shows order summary with subtotal, tax, total
- Places order via `useCreateOrder()` hook
- Redirects to status page on success

### 4. Order Status
- Polls order status using order token
- Shows preparation progress
- Displays estimated ready time

## Extension Points

### Adding New Order Types
The app currently supports "Dine In" only. To add other types:

```typescript
// In Menu.tsx, modify the usePublicMenu call
const { menu, loading, error } = usePublicMenu(
  restaurant || '', 
  selectedOrderType // Make this dynamic
);
```

### Customizing Cart Fields
To add more customer fields in Cart:

```typescript
// In Cart.tsx, add state and UI for new field
const [specialRequests, setSpecialRequests] = useState('')

// Include in order payload
await createOrder({
  ...orderData,
  special_requests: specialRequests,
})
```

### Adding Payment Integration
The current flow is "Pay at counter". To add online payment:

```typescript
// In Cart.tsx handlePlaceOrder
const result = await createOrder({...});
if (result.requires_payment) {
  navigate(`/payment/${result.order_token}`);
}
```

## Dependencies

### Internal Packages
| Package | Purpose |
|---------|---------|
| `@ury/api-client` | Frappe API client |
| `@ury/cart` | Cart state management |
| `@ury/config` | App configuration constants |
| `@ury/menu` | Menu fetching hooks (`usePublicMenu`, `useTableToken`) |
| `@ury/order` | Order creation hook (`useCreateOrder`) |
| `@ury/ui` | Shared UI components |

### External Dependencies
| Package | Purpose |
|---------|---------|
| `react-router-dom` | Client-side routing |
| `lucide-react` | Icons |
| `zustand` | State management (via @ury/cart) |
| `qrcode.react` | QR code generation (if needed) |

## Gotchas

### Session Storage Dependency
Table context is stored in `sessionStorage` - if the customer closes and reopens the browser, they'll need to re-scan the QR code:

```typescript
// TokenResolver.tsx
sessionStorage.setItem('tableContext', JSON.stringify(context))
sessionStorage.setItem('tableToken', token || '')
```

### Token Validation Required
Always validate tokens server-side. The `useTableToken` hook calls:
```typescript
// Backend API
ury.ury_customer.api.validate_table_token(token)
```

### Cart Persistence
Cart is not persisted across sessions. Consider adding localStorage backup if needed.

### Mobile-First Design
All UI components are optimized for mobile. Test on actual devices:
- Touch targets minimum 44px
- Bottom-fixed action bars for thumb reach
- Swipe-friendly interactions

### Route Base Path
Build output goes to `/assets/ury/table-order/`:
```json
// package.json
"build": "vite build --base=/assets/ury/table-order/"
```

### QR Code Generation
QR codes should point to: `https://yourdomain.com/t/{table_token}`

Table tokens are generated server-side in the `Ury Table` DocType (`qr_token` field).

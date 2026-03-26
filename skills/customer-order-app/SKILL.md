---
title: Customer Order App
description: Online Customer Ordering application for pickup and delivery orders
category: features
path: apps/customer-order
tags: [ordering, online, customer, pickup, delivery]
---

# Customer Order App

Online Customer Ordering application that enables customers to browse restaurants, place orders for pickup or delivery, and track their order status without needing to be physically present.

## Overview

The Customer Order app provides a complete online ordering experience for remote customers. It supports restaurant discovery, menu browsing, cart management, checkout with multiple order types, and order tracking.

**Key Features:**
- Restaurant landing pages with info, hours, and status
- Public menu browsing by restaurant slug
- Multi-type ordering: Pickup, Delivery, Take Away
- Cart persistence across pages
- Order history by phone number
- Real-time order tracking
- Mobile-optimized responsive design

## Pages/Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/:slug` | `RestaurantLanding` | Restaurant info page with logo, hours, contact |
| `/:slug/menu` | `Menu` | Full menu with categories and cart |
| `/cart` | `Cart` | Cart review and item management |
| `/checkout` | `Checkout` | Order type selection, customer info, payment |
| `/track/:token` | `OrderTracking` | Real-time order status and progress |
| `/orders` | `OrderHistory` | List past orders by phone number |
| `/` | - | Redirects to demo restaurant |

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app with route definitions |
| `src/pages/RestaurantLanding.tsx` | Restaurant info, hours, open/closed status |
| `src/pages/Menu.tsx` | Menu with categories, search, filters |
| `src/pages/Cart.tsx` | Cart management, quantity updates |
| `src/pages/Checkout.tsx` | Order type, customer details, place order |
| `src/pages/OrderTracking.tsx` | Live order status with progress steps |
| `src/pages/OrderHistory.tsx` | Past orders lookup by phone |
| `src/main.tsx` | App entry point |
| `package.json` | Dependencies and build scripts |

## How It Works

### 1. Restaurant Discovery Flow
```
Customer visits /:slug → RestaurantLanding fetches info → 
Shows logo, hours, contact, open status → Click "Order Now" → /:slug/menu
```

The `RestaurantLanding` page:
- Fetches restaurant info via `ury.ury_customer.api.get_restaurant_info(slug)`
- Determines open/closed status from `opening_hours`
- Shows rating, delivery time, minimum order
- Stores restaurant info in `sessionStorage`

### 2. Menu Browsing
- Fetches menu via `usePublicMenu(slug, orderType)`
- Category tabs for filtering
- Item cards with image, description, price
- Add to cart with variant/addon support
- Persistent cart across navigation

### 3. Checkout Process
1. **Order Type Selection**: Pickup, Delivery, or Take Away
2. **Customer Info**: Name, phone, email, address (if delivery)
3. **Payment Method**: Cash on pickup/delivery or online payment
4. **Order Placement**: Creates order via `useCreateOrder()`
5. **Confirmation**: Shows order token and redirects to tracking

### 4. Order Tracking
- Polls order status using order token
- Shows preparation timeline
- Estimated ready/delivery time
- Status: Pending → Confirmed → Preparing → Ready → Completed

### 5. Order History
- Lookup by phone number
- Shows past orders with totals and status
- Quick reorder functionality

## Extension Points

### Adding Delivery Zones
To restrict delivery to specific areas:

```typescript
// In Checkout.tsx
const [deliveryAddress, setDeliveryAddress] = useState('')
const [isInZone, setIsInZone] = useState(false)

useEffect(() => {
  // Call API to check if address is in delivery zone
  checkDeliveryZone(deliveryAddress).then(setIsInZone)
}, [deliveryAddress])
```

### Adding Scheduled Orders
Allow customers to schedule future orders:

```typescript
// Add to Checkout form
const [scheduledTime, setScheduledTime] = useState<Date | null>(null)

await createOrder({
  ...orderData,
  scheduled_time: scheduledTime?.toISOString(),
})
```

### Loyalty Program Integration
Add points/rewards display:

```typescript
// In RestaurantLanding or Checkout
const { points } = useLoyalty(customerPhone)

// Show available rewards
<RewardsSelector 
  points={points}
  onApplyReward={handleApplyReward}
/>
```

### Multi-Restaurant Support
For a food marketplace with multiple restaurants:

```typescript
// Add RestaurantList page
<Route path="/restaurants" element={<RestaurantList />} />

// Filter by cuisine, location, rating
const [filters, setFilters] = useState({ cuisine: '', rating: 0 })
```

## Dependencies

### Internal Packages
| Package | Purpose |
|---------|---------|
| `@ury/api-client` | Frappe API client |
| `@ury/cart` | Cart state management |
| `@ury/config` | App configuration |
| `@ury/menu` | Menu fetching hooks |
| `@ury/order` | Order creation and tracking |
| `@ury/ui` | Shared UI components |

### External Dependencies
| Package | Purpose |
|---------|---------|
| `react-router-dom` | Client-side routing |
| `lucide-react` | Icons |
| `zustand` | State management |
| `frappe-js-sdk` | Direct Frappe API calls |

## Gotchas

### Restaurant Slug Routing
Routes use restaurant slug, not name. Ensure slugs are URL-friendly:
```typescript
// URL: /my-restaurant-branch-1
// Not: /My Restaurant (Branch 1)
```

### Session Storage for Restaurant
Restaurant info is stored in `sessionStorage` for cross-page access:
```typescript
sessionStorage.setItem('currentRestaurant', JSON.stringify(restaurant))
```

### Opening Hours Calculation
Open/closed status is calculated client-side:
```typescript
const now = new Date()
const currentDay = DAYS_OF_WEEK[now.getDay() - 1] || 'Sunday'
const currentTime = now.getHours() * 60 + now.getMinutes()
```

### Order Type Restrictions
Some restaurants may not support all order types. Check:
```typescript
restaurant.accepts_online_orders // boolean
```

### Cart Persistence
Cart is NOT persisted across browser sessions. For persistence:
```typescript
// In @ury/cart store
persist: {
  name: 'customer-order-cart',
  storage: createJSONStorage(() => localStorage),
}
```

### Phone Number Formatting
Order history lookup requires consistent phone formatting:
```typescript
// Normalize before API call
const normalizedPhone = phone.replace(/\D/g, '')
```

### Build Output Path
```json
"build": "vite build --base=/assets/ury/customer-order/"
```
Access via: `https://yourdomain.com/customer-order`

### Default Redirect
Root path redirects to demo restaurant:
```typescript
<Route path="/" element={<Navigate to="/demo-restaurant" replace />} />
```

### SEO Considerations
Restaurant landing pages should be server-rendered or have proper meta tags for SEO. Currently client-side rendered only.

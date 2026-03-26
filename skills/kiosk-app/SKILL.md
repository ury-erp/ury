---
title: Kiosk App
description: Self-service kiosk ordering application for in-store ordering
category: features
path: apps/kiosk
tags: [ordering, kiosk, self-service, in-store, touch]
---

# Kiosk App

Self-service kiosk ordering application designed for in-store touchscreen kiosks. Features large touch targets, inactivity timeout, attract screen, and streamlined ordering flow.

## Overview

The Kiosk app provides a dedicated ordering interface for physical kiosk devices. It's optimized for large touchscreens with accessibility features like timeout warnings, haptic feedback, and an attract screen to draw customers in.

**Key Features:**
- Full-screen attract screen with "Touch to Order"
- 90-second inactivity timeout with warning
- Large touch targets (minimum 64px)
- Step-by-step ordering flow
- Device configuration screen
- Framer Motion animations
- Real-time order confirmation with QR code

## Pages/Screens (View-Based)

Unlike the other apps, Kiosk uses a state-based view system instead of routes:

| View | Component | Description |
|------|-----------|-------------|
| `attract` | `AttractScreen` | Idle screen with animated logo and "Touch to Order" |
| `menu` | `MenuScreen` | Full menu with category sidebar and cart |
| `item-detail` | `ItemDetailScreen` | Item detail with quantity and add to cart |
| `checkout` | `CheckoutScreen` | Order type selection and customer phone |
| `confirmation` | `ConfirmationScreen` | Order confirmation with order number and QR |

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app with view state management |
| `src/hooks/useKiosk.ts` | Kiosk state, inactivity tracking, cart integration |
| `src/pages/AttractScreen.tsx` | Animated attract/welcome screen |
| `src/pages/MenuScreen.tsx` | Grid menu with category filter |
| `src/pages/ItemDetailScreen.tsx` | Item detail with customization |
| `src/pages/CheckoutScreen.tsx` | Order review and placement |
| `src/pages/ConfirmationScreen.tsx` | Order confirmation display |
| `src/pages/index.ts` | Page exports barrel file |
| `src/components/InactivityWarning.tsx` | Timeout warning modal |
| `src/components/DeviceSetup.tsx` | Initial kiosk configuration |
| `package.json` | Dependencies and build scripts |

## How It Works

### 1. Device Setup
On first launch, the kiosk shows `DeviceSetup` component:
- Select restaurant from available list
- Configure kiosk name/location
- Store config in localStorage

### 2. Attract Screen
When idle, displays full-screen attract mode:
- Animated background with floating circles
- Bouncing logo or restaurant icon
- "Touch to Order" prompt with pulse animation
- Touch anywhere to start ordering

### 3. Inactivity Management
The `useKiosk` hook manages timeouts:
```typescript
const kiosk = useKiosk({
  inactivityTimeoutMs: 90 * 1000,  // 90 seconds
  inactivityWarningMs: 10 * 1000,  // 10 second warning
});
```

- Tracks user interactions (touch, click)
- Shows `InactivityWarning` 10 seconds before reset
- Auto-resets to attract screen on timeout

### 4. Menu Browsing
`MenuScreen` features:
- Left sidebar with category list
- Right grid of menu items
- Large item cards with images
- Floating cart button with item count
- Bottom bar with total and checkout button

### 5. Item Detail
`ItemDetailScreen` shows:
- Large item image
- Description and price
- Quantity stepper (+/-)
- Special instructions text area
- Large "Add to Cart" button

### 6. Checkout
`CheckoutScreen` includes:
- Order type toggle (Dine In / Take Away)
- Phone number input (optional)
- Cart item list with remove option
- Total display
- Large "Place Order" button

### 7. Confirmation
`ConfirmationScreen` displays:
- Success animation
- Order number (last 4 of invoice ID)
- Order token
- QR code for tracking
- Estimated wait time
- Auto-reset countdown

## Extension Points

### Custom Inactivity Timing
Adjust timeout for different environments:

```typescript
// In App.tsx
const kiosk = useKiosk({
  inactivityTimeoutMs: 120 * 1000,  // 2 minutes for slower customers
  inactivityWarningMs: 15 * 1000,
});
```

### Adding Payment Terminal
Integrate with payment hardware:

```typescript
// In CheckoutScreen, after place order
const handlePlaceOrder = async () => {
  const result = await createOrder({...});
  
  // If payment required, show terminal screen
  if (result.total > 0) {
    kiosk.goToPayment(result.invoice_id);
  }
};
```

### Receipt Printing
Add printer integration:

```typescript
// After successful order
useEffect(() => {
  if (orderResult) {
    printReceipt(orderResult.invoice_id);
  }
}, [orderResult]);
```

### Multi-Language Support
Add language selector:

```typescript
// In AttractScreen or a settings overlay
const [language, setLanguage] = useState('en');

<LanguageSelector 
  value={language}
  onChange={setLanguage}
  options={['en', 'es', 'fr']}
/>
```

### Accessibility Mode
Add screen reader and high contrast support:

```typescript
const [accessibilityMode, setAccessibilityMode] = useState(false);

// In components
<div className={accessibilityMode ? 'high-contrast text-3xl' : ''}>
```

### Kitchen Display Integration
Send orders directly to KDS:

```typescript
// In order creation
await createOrder({
  ...orderData,
  send_to_kds: true,
  kiosk_id: kiosk.config.id,
});
```

## Dependencies

### Internal Packages
| Package | Purpose |
|---------|---------|
| `@ury/api-client` | Frappe API client |
| `@ury/cart` | Cart state management |
| `@ury/config` | App configuration |
| `@ury/menu` | Menu fetching hooks |
| `@ury/order` | Order creation hook |
| `@ury/ui` | Shared UI components |

### External Dependencies
| Package | Purpose |
|---------|---------|
| `framer-motion` | Page transitions and animations |
| `react-toastify` | Toast notifications |
| `lucide-react` | Icons |
| `qrcode.react` | QR code generation |
| `@radix-ui/react-select` | Accessible select component |
| `zustand` | State management |

## Gotchas

### View-Based vs Route-Based
Kiosk uses internal state for views, not React Router:
```typescript
// NOT: <Route path="/menu" />
// BUT: {kiosk.currentView === 'menu' && <MenuScreen />}
```

### Touch Target Sizes
Minimum touch targets are 64px. Don't reduce:
```typescript
// Good
<button className="w-16 h-16"> // 64px

// Bad
<button className="w-10 h-10"> // Too small for kiosk
```

### Inactivity Timer Reset
Ensure all interactions reset the timer:
```typescript
// In useKiosk hook
const resetTimer = useCallback(() => {
  setLastActivity(Date.now());
  setInactivityWarning(false);
}, []);

// Attach to all interactive elements
onClick={resetTimer}
onTouchStart={resetTimer}
```

### Full-Screen Mode
For production kiosks, use browser full-screen:
```javascript
// In main.tsx or DeviceSetup
document.documentElement.requestFullscreen();
```

### Prevent Zoom
Disable pinch-zoom on mobile browsers:
```html
<!-- In index.html -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

### localStorage for Config
Device configuration persists in localStorage:
```typescript
// In useKiosk
const [config, setConfig] = useState<KioskConfig | null>(() => {
  const saved = localStorage.getItem('kiosk-config');
  return saved ? JSON.parse(saved) : null;
});
```

### Build Output Path
```json
"build": "vite build --base=/assets/ury/kiosk/"
```
Access via: `https://yourdomain.com/kiosk`

### Animations Performance
Framer Motion animations may lag on low-end devices. Test on actual kiosk hardware and reduce complexity if needed:
```typescript
// Reduce animation complexity
<motion.div
  initial={false} // Skip initial animation
  animate={{ opacity: 1 }}
  transition={{ duration: 0.2 }} // Faster
>
```

### Order Source Identification
Always set order_source for analytics:
```typescript
await createOrder({
  ...orderData,
  order_source: 'Kiosk',
  kiosk_id: kiosk.config?.id,
});
```

# URY Kiosk - Self-Service Ordering

A React-based self-service kiosk application for in-store ordering on large touch screens.

## Features

- **Attract Screen**: Full-screen welcome with "Touch to Order" branding and animations
- **Large Touch Targets**: All interactive elements are at least 64px for easy touch interaction
- **Menu Browser**: Large cards (4-6 per screen) with category ribbon for easy navigation
- **Item Detail**: Full-screen modal with large images, descriptions, and add-to-cart controls
- **Persistent Cart**: Side panel always visible with large +/- buttons and prominent total
- **Checkout**: Large Dine In/Take Away selection buttons with optional phone input
- **Confirmation**: Large order number display, QR code for tracking, auto-reset timer
- **Inactivity Timeout**: 90-second timeout with 10-second warning before reset to attract screen
- **Haptic Visual Feedback**: Scale animation on button presses for tactile feel
- **Clean Look**: No scrollbars, minimal chrome, focus on content

## Tech Stack

- React 19 + TypeScript
- Vite for bundling
- Tailwind CSS for styling
- Framer Motion for animations
- Zustand (via @ury/cart) for state management
- QRCode.react for QR generation

## Project Structure

```
apps/kiosk/
├── src/
│   ├── components/          # Reusable components
│   │   ├── DeviceSetup.tsx  # Initial device configuration
│   │   └── InactivityWarning.tsx  # Timeout warning modal
│   ├── hooks/               # Custom React hooks
│   │   ├── useDeviceAuth.ts     # Device token management
│   │   ├── useInactivityTimeout.ts  # 90s timeout logic
│   │   └── useKiosk.ts          # Main kiosk state hook
│   ├── lib/                 # Utilities
│   │   └── utils.ts         # Formatting helpers
│   ├── pages/               # Screen components
│   │   ├── AttractScreen.tsx    # Idle/welcome screen
│   │   ├── MenuScreen.tsx       # Menu browsing
│   │   ├── ItemDetailScreen.tsx # Item customization
│   │   ├── CheckoutScreen.tsx   # Order type & checkout
│   │   └── ConfirmationScreen.tsx # Order confirmation
│   ├── types/               # TypeScript types
│   ├── App.tsx              # Main application
│   ├── index.css            # Styles with kiosk-specific utilities
│   └── main.tsx             # Entry point
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Device Authentication

The kiosk uses device token authentication stored in localStorage:

1. On first boot, shows setup screen for device token and restaurant
2. Token is validated and stored locally
3. Subsequent boots use stored configuration
4. Configuration can be cleared by staff if needed

## Customization

### Colors
Edit `src/index.css` CSS variables to customize the theme:

```css
:root {
  --primary: 221.2 83.2% 53.3%;  /* Change primary color */
  /* ... other variables */
}
```

### Timeout Duration
Edit `src/App.tsx`:

```tsx
const kiosk = useKiosk({
  inactivityTimeoutMs: 90 * 1000,  // Change from 90 seconds
  inactivityWarningMs: 10 * 1000,  // Change warning time
});
```

### Auto-Reset Timer
Edit `src/pages/ConfirmationScreen.tsx`:

```tsx
const AUTO_RESET_SECONDS = 30;  // Change from 30 seconds
```

## Build

```bash
# Install dependencies
yarn install

# Development server
yarn dev

# Production build
yarn build
```

The build output goes to `../../ury/public/kiosk/` and the HTML entry is copied to `../../ury/www/kiosk.html`.

## Integration with Frappe

The kiosk is served as a Frappe web page. Add this to `ury/hooks.py`:

```python
website_route_rules = [
    # ... other routes
    {"from_route": "/kiosk/<path:path>", "to_route": "kiosk"},
]
```

## Receipt Printing

The kiosk includes basic receipt printing support. For full integration with QZ Tray or other printing solutions, extend the `ConfirmationScreen` component with your printing logic.

## Accessibility

- Large touch targets (minimum 64px)
- High contrast text
- Clear visual hierarchy
- Haptic feedback via visual animations

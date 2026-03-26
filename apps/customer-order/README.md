# URY Customer Order App

Online ordering application for URY restaurant management system. Allows customers to place pickup, delivery, and curbside orders remotely.

## Features

- **Restaurant Landing Page** (`/:slug`)
  - Display restaurant info, logo, description
  - Opening hours with live open/closed status
  - Contact information and address
  - Minimum order amount

- **Menu Browsing** (`/:slug/menu`)
  - Category-based menu navigation
  - Search functionality
  - Add/remove items from cart
  - Item images and descriptions

- **Cart** (`/cart`)
  - Review cart items with quantity controls
  - Order type selection (Pickup/Delivery/Curbside)
  - Pickup time slot selection (ASAP or scheduled up to 7 days ahead)
  - Order summary with totals

- **Checkout** (`/checkout`)
  - Guest checkout (no account required)
  - Contact information (name, phone, email)
  - Delivery address (when applicable)
  - Special instructions
  - Save customer info for future orders
  - Cash on delivery/pickup payment

- **Order Tracking** (`/track/:token`)
  - Real-time order status updates
  - Visual progress timeline
  - Estimated ready/delivery time
  - Share order status link

- **Order History** (`/orders`)
  - View past orders by phone number
  - Quick reorder functionality

## Routes

| Route | Description |
|-------|-------------|
| `/:slug` | Restaurant landing page |
| `/:slug/menu` | Browse menu and add to cart |
| `/cart` | Review cart and select pickup time |
| `/checkout` | Customer details and place order |
| `/track/:token` | Track order status |
| `/orders` | Order history by phone |

## Tech Stack

- React 19 + TypeScript
- Vite
- React Router v6
- Tailwind CSS
- URY Packages:
  - `@ury/ui` - UI components
  - `@ury/menu` - Menu fetching and types
  - `@ury/cart` - Cart state management
  - `@ury/order` - Order creation and tracking
  - `@ury/config` - Constants and types
  - `@ury/api-client` - Frappe API client

## Development

```bash
# Install dependencies
yarn install

# Run dev server
yarn dev

# Build for production
yarn build
```

## Build Output

The build is output to `../../ury/public/customer-order/` and the HTML entry point is copied to `../../ury/www/customer-order.html`.

## Order Types Supported

- **Take Away** - Customer picks up from restaurant
- **Delivery** - Order delivered to customer address
- **Curbside** - Customer picks up from their car

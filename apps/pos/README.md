# URY POS v2

Staff POS application for URY restaurant management system.

## Technology Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **frappe-js-sdk** - Frappe backend integration

## Development

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build
```

## Build Output

The build output goes to `../../ury/public/pos/` and is served by Frappe at `/assets/ury/pos/`.

## Features

- Table management and layout
- Menu browsing and search
- Cart management
- Order creation and modification
- Payment processing
- KOT (Kitchen Order Ticket) generation
- POS Opening/Closing
- Multi-cashier support

## Part of URY

This app is part of the [URY](https://github.com/ury-erp/ury) restaurant ERP system.

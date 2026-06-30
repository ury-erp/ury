# URY POS — Restaurant Point of Sale

A modern, feature-rich Point of Sale frontend for restaurant management, built with React 19, TypeScript, and Vite. Designed as a custom app for the [Frappe/ERPNext](https://frappeframework.com/) platform.

## Features

- **POS Ordering** — Fast order entry with menu categories, cart management, and order type selection (Dine In, Take Away, Delivery, Phone In, Aggregators)
- **Table Management** — Visual table layout with drag-and-drop positioning, occupancy tracking, and room/zone management
- **Menu Management** — CRUD operations for menus, items, courses/categories; batch price updates; bulk enable/disable; sortable columns with image thumbnails
- **Dashboard** — Real-time KPIs, revenue/orders/category charts, payment method distribution, hourly heatmap, period comparison with trend indicators
- **Reports** — Sales, expense, profit & loss, and inventory reports with PDF and CSV export; period comparison views
- **Thermal Printing** — QZ Tray integration for receipt/kitchen order printing
- **Multi-language** — English, French, Arabic (RTL), Slovenian
- **Retry Logic** — Automatic API retry with exponential backoff for network resilience

## Tech Stack

| Concern | Technology |
|---|---|
| UI Framework | React 19 + TypeScript 5.7 |
| Build Tool | Vite 6 |
| State Management | Zustand 5 |
| Routing | React Router DOM 6 |
| Styling | Tailwind CSS 3 + class-variance-authority |
| Charts | Recharts 3 |
| PDF Generation | jsPDF + jspdf-autotable |
| Backend SDK | frappe-js-sdk |
| Testing | Vitest + Testing Library |
| Icons | Lucide React |

## Prerequisites

- Node.js 18+
- A running [Frappe/ERPNext](https://frappeframework.com/) backend with the URY app installed
- Yarn or npm

## Getting Started

### 1. Install Dependencies

```bash
cd pos
npm install
```

### 2. Configure Environment

Copy the example environment file and set your Frappe backend URL:

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_FRAPPE_BASE_URL=http://localhost:8000
```

### 3. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### 4. Build for Production

```bash
npm run build
```

Output is written to `../ury/public/pos/` and served by Frappe.

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm run type-check` | TypeScript type checking |
| `npm run check-all` | Run all checks (type, lint, test, build) |

## Project Structure

```
pos/src/
├── components/
│   ├── ui/                    # Reusable UI primitives (Button, Dialog, Badge, etc.)
│   ├── dashboard/             # Dashboard chart components
│   ├── menu-management/       # Menu CRUD components
│   ├── reports/               # Report view components
│   ├── Footer.tsx             # Bottom navigation
│   ├── Header.tsx             # Top bar with search
│   ├── AuthGuard.tsx          # Route protection
│   └── ...                    # Other business components
├── pages/                     # Route-level page components
├── store/                     # Zustand state management
│   ├── pos-store.ts           # Main POS session state
│   ├── root-store.ts          # Cross-page state (auth, config, orders)
│   ├── dashboard-store.ts     # Dashboard data + auto-refresh
│   ├── menu-management-store.ts
│   └── reports-store.ts       # Report data + PDF/CSV export
├── lib/                       # API layer and utilities
│   ├── frappe-sdk.ts          # Frappe SDK initialization
│   ├── frappe-sdk-retry.ts    # Auto-retry wrapper for API calls
│   ├── retry.ts               # Exponential backoff utility
│   ├── logger.ts              # Centralized logging
│   ├── *-api.ts               # Domain-specific API functions
│   └── utils.ts               # formatCurrency, cn, etc.
├── i18n/                      # Internationalization
│   ├── locales/               # en.json, fr.json, ar.json, sl.json
│   ├── config.ts              # Supported languages
│   ├── loader.ts              # Dynamic locale loading
│   └── index.ts               # t() function + initI18n
├── data/                      # Constants and static data
└── test/                      # Test setup and utilities
```

## API Integration

All API calls go through the Frappe SDK with automatic retry:

```typescript
import { call } from './frappe-sdk-retry';

// GET request — 3 retries, 800ms initial backoff
const data = await call.get('ury.ury.api.endpoint', { param: value });

// POST request — 2 retries, 500ms initial backoff
const result = await call.post('ury.ury.api.endpoint', { data });
```

Retry behavior:
- **Network errors** → retry
- **5xx server errors** → retry
- **429 Too Many Requests** → retry
- **4xx client errors** → no retry (validation, auth, not found)

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

Tests use Vitest with jsdom environment. Mock setup is in `src/test/setup.ts`.

## License

GPL-3.0 — See [LICENSE](../LICENSE) for details.

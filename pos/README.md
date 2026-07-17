# URY POS — Restaurant Point of Sale

A modern, feature-rich Point of Sale frontend for restaurant management, built with React 19, TypeScript, and Vite. Designed as a custom app for the [Frappe/ERPNext](https://frappeframework.com/) platform.

## Features

- **POS Ordering** — Fast order entry with menu categories, cart management, and order type selection (Dine In, Take Away, Delivery, Phone In, Aggregators)
- **Table Management** — Visual table layout with drag-and-drop positioning, occupancy tracking, and room/zone management
- **Menu Management** — CRUD operations for menus, items, courses/categories; batch price updates; bulk enable/disable; sortable columns with image thumbnails
- **Dashboard** — Real-time KPIs, revenue/orders/category charts, payment method distribution, hourly heatmap, period comparison with trend indicators
- **Reports** — Sales, expense, profit & loss, and inventory reports with PDF and CSV export; period comparison views
- **AI Insights** — OpenAI-compatible report analysis with natural language queries, trend detection, and actionable recommendations
- **Thermal Printing** — QZ Tray integration for receipt/kitchen order printing
- **Multi-language** — English, French, Arabic (RTL), Slovenian
- **Retry Logic** — Automatic API retry with exponential backoff for network resilience
- **API Mocking** — Full MSW (Mock Service Worker) integration for development and testing without a backend
- **PWA Support** — Service worker, offline caching, and installable app manifest

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
| API Mocking | MSW (Mock Service Worker) 2 |
| Testing | Vitest + Testing Library + MSW |
| E2E Testing | Playwright |
| Icons | Lucide React |

## Prerequisites

- Node.js 18+
- A running [Frappe/ERPNext](https://frappeframework.com/) backend with the URY app installed (optional with MSW)
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

### Running Without a Backend (MSW Mode)

To develop or demo the POS without a running Frappe backend, enable MSW mocking:

```bash
# .env
VITE_MSW_ENABLED=true
VITE_FRAPPE_BASE_URL=
```

When `VITE_MSW_ENABLED=true`:
- The MSW service worker intercepts all API requests and returns realistic mock data
- `VITE_FRAPPE_BASE_URL` must be empty so the SDK sends same-origin requests (service workers cannot intercept cross-origin requests)
- The Vite proxy is automatically disabled to prevent auth redirect loops
- A console message confirms `[MSW] Service worker active`
- The `<html>` element gets `data-msw-ready="true"` for E2E test synchronization

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:ui` | Run E2E tests with Playwright UI |
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
│   ├── ai/                    # AI Insights panel and analysis components
│   ├── Footer.tsx             # Bottom navigation
│   ├── Header.tsx             # Top bar with search
│   ├── AuthGuard.tsx          # Route protection
│   └── ...                    # Other business components
├── pages/                     # Route-level page components
├── store/                     # Zustand state management (sliced architecture)
│   ├── slices/                # Individual Zustand slices
│   │   ├── auth-slice.ts      # Authentication state
│   │   ├── config-slice.ts    # App configuration
│   │   ├── menu-slice.ts      # Menu data
│   │   ├── orders-slice.ts    # Order management
│   │   └── ...
│   ├── pos-store.ts           # Main POS session state
│   ├── root-store.ts          # Cross-page state (auth, config, orders)
│   ├── dashboard-store.ts     # Dashboard data + auto-refresh
│   ├── menu-management-store.ts
│   ├── reports-store.ts       # Report data + PDF/CSV export
│   └── ai-store.ts            # AI Insights state
├── lib/                       # API layer and utilities
│   ├── frappe-sdk.ts          # Frappe SDK initialization
│   ├── frappe-sdk-retry.ts    # Auto-retry wrapper for API calls
│   ├── retry.ts               # Exponential backoff utility
│   ├── api-dedup.ts           # Request deduplication and caching
│   ├── logger.ts              # Centralized logging with levels
│   ├── performance.ts         # Performance monitoring
│   ├── keyboard-shortcuts.ts  # Global keyboard shortcut registry
│   ├── *-api.ts               # Domain-specific API functions
│   └── utils.ts               # formatCurrency, cn, etc.
├── mocks/                     # MSW API mocking
│   ├── fixtures.ts            # Realistic mock data for 12 domains
│   ├── handlers.ts            # 60+ HTTP handlers (call + resource)
│   ├── browser.ts             # setupWorker for browser/development
│   ├── server.ts              # setupServer for Vitest/Node
│   └── msw-api.test.ts        # 56 integration tests for MSW handlers
├── i18n/                      # Internationalization
│   ├── locales/               # en.json, fr.json, ar.json, sl.json
│   ├── config.ts              # Supported languages
│   ├── loader.ts              # Dynamic locale loading
│   └── index.ts               # t() function + initI18n
├── data/                      # Constants and static data
├── test/                      # Test setup and utilities
│   └── setup.ts               # Vitest setup + MSW server lifecycle
└── sw.ts                      # PWA service worker registration
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

### Request Deduplication

The `api-dedup.ts` module prevents duplicate concurrent API calls and caches responses:

```typescript
import { fetchWithDedup, invalidateCache } from './api-dedup';

// Identical concurrent calls are merged into one request
const data = await fetchWithDedup('menu', () => call.get('ury.ury.api.get_menu'));

// Invalidate cache when data changes (e.g., after a mutation)
invalidateCache('menu');
```

## MSW API Mocking

[Mock Service Worker](https://mswjs.io/) provides a complete API mocking layer for both development and testing, allowing the POS to run fully without a Frappe backend.

### Architecture

- **`fixtures.ts`** — Typed mock data for 12 domains: auth, menu, tables, customers, payments, orders, invoices, dashboard, reports, menu management, POS profile, and aggregator
- **`handlers.ts`** — 60+ HTTP handlers covering all `frappe-js-sdk` URL patterns:
  - `call.get/post` → `GET/POST /api/method/{method}` (43 handlers)
  - `db.getDoc` → `GET /api/resource/{doctype}/{docname}` (resource handlers)
  - `db.getDocList` → `GET /api/resource/{doctype}?params` (list handlers)
  - URL-encoded variants (`URY%20Room`, `POS%20Profile`) handled automatically
- **`browser.ts`** — `setupWorker` for browser/development use
- **`server.ts`** — `setupServer` for Vitest/Node test environment

### Usage in Development

1. Initialize the MSW service worker (one-time):

```bash
npx msw init public/ --save
```

2. Enable MSW in your `.env`:

```
VITE_MSW_ENABLED=true
VITE_FRAPPE_BASE_URL=
```

3. Start the dev server — all API requests return mock data.

### Usage in Tests

MSW is automatically configured in the test environment via `src/test/setup.ts`:

```typescript
import { server } from '../mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Dynamic Handler Overrides

Override specific handlers in individual tests without affecting others:

```typescript
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { invalidateCache } from '../lib/api-dedup';

it('handles 500 error gracefully', async () => {
  server.use(
    http.get('*/api/method/ury.ury_pos.api.get_menu', () => {
      return HttpResponse.json({ exc_type: 'Internal Server Error' }, { status: 500 });
    })
  );
  invalidateCache(); // Clear dedup cache so override takes effect

  // Test error handling...
});
```

After `server.resetHandlers()` (called in `afterEach`), overrides are automatically removed.

## Testing

```bash
# Run all tests (1742+ across 92 files)
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# E2E tests with Playwright
npm run test:e2e
```

### Test Infrastructure

- **Unit/Integration**: Vitest with jsdom environment + MSW server for API mocking
- **E2E**: Playwright with Chromium, MSW-compatible for browser mocking
- **Setup**: `src/test/setup.ts` — configures MSW server lifecycle, mocks `window.frappe`, `localStorage`, and `sessionStorage`
- **MSW Handler Tests**: `src/mocks/msw-api.test.ts` — 56 integration tests covering all handler domains, error scenarios, and dynamic overrides

### Coverage

The test suite covers:
- All API functions (auth, menu, orders, payments, tables, customers, dashboard, reports, etc.)
- Zustand store slices (auth, config, menu, orders, helpers, combined)
- Utility modules (logger, debounce, keyboard shortcuts, performance, storage, error-utils, role-utils, api-dedup)
- I18n system
- MSW handler correctness (56 integration tests)
- AI service and insights
- Dashboard store and reports store

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_FRAPPE_BASE_URL` | `http://localhost:8000` | Frappe backend URL (empty when MSW is enabled) |
| `VITE_MSW_ENABLED` | `false` | Enable MSW API mocking for development |
| `VITE_AI_BASE_URL` | — | OpenAI-compatible API base URL for AI Insights |
| `VITE_AI_API_KEY` | — | API key for the AI service |
| `VITE_AI_MODEL` | — | Default AI model to use |

## License

GPL-3.0 — See [LICENSE](../LICENSE) for details.

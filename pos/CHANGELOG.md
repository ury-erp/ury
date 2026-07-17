# Changelog

All notable changes to the URY POS project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **MSW (Mock Service Worker) Integration** — Full API mocking layer for development and testing without a Frappe backend
  - 60+ HTTP handlers covering all `frappe-js-sdk` URL patterns (`call.get/post`, `db.getDoc`, `db.getDocList`)
  - Typed fixtures for 12 domains: auth, menu, tables, customers, payments, orders, invoices, dashboard, reports, menu management, POS profile, aggregator
  - Browser worker (`src/mocks/browser.ts`) for development and E2E tests
  - Node server (`src/mocks/server.ts`) for Vitest unit tests
  - Dynamic handler overrides for per-test scenarios
  - 56 MSW integration tests in `msw-api.test.ts`
  - `data-msw-ready` HTML attribute for E2E synchronization

- **E2E Test Suite (Playwright + MSW)** — 37 end-to-end tests across 8 spec files
  - `app-smoke.spec.ts` — Application startup and basic rendering
  - `msw-mocking.spec.ts` — MSW activation and API interception
  - `navigation.spec.ts` — Footer navigation, browser back/forward, direct URLs, 404
  - `pos-ordering.spec.ts` — Menu browsing, cart, search, filters, order type
  - `table-management.spec.ts` — Rooms, tables, occupancy, table selection
  - `menu-management.spec.ts` — CRUD menus, courses, toggle, back navigation
  - `dashboard-reports.spec.ts` — Dashboard KPIs, charts, report views
  - `orders.spec.ts` / `reports.spec.ts` — Order management and report generation

- **GitHub Actions CI/CD** — 4-job workflow (`.github/workflows/ci.yml`)
  - Lint (ESLint), Unit Tests (Vitest), Build (Vite), E2E (Playwright + MSW)
  - Artifact upload on failure (playwright-report, e2e-report, test-results)
  - Node.js 20, Chromium with system dependencies

- **GitHub Templates** — Issue and PR templates
  - Bug report template (`.github/ISSUE_TEMPLATE/bug_report.md`)
  - Feature request template (`.github/ISSUE_TEMPLATE/feature_request.md`)
  - Pull request template (`.github/PULL_REQUEST_TEMPLATE.md`)

- **AI Insights Module** — OpenAI-compatible report analysis
  - Natural language queries on sales, expense, and P&L data
  - Trend detection and actionable recommendations
  - `AIInsightsPanel` component with conversational UI

- **PWA Support** — Service worker, offline caching, installable app manifest
  - `src/sw.ts` — Service worker registration
  - `public/manifest.json` — App manifest with icons
  - Offline-first caching strategy

- **API Rate Limiter** — Client-side request throttling with visual feedback
  - Configurable rate limits per API endpoint
  - `PerformanceOverlay` integration showing real-time metrics
  - `PerformanceAlerts` with toast warnings for approaching limits

- **API Dedup/Caching Layer** — Request deduplication and response caching
  - `fetchWithDedup()` merges identical concurrent requests
  - `invalidateCache()` for cache-busting after mutations
  - Integrated into dashboard, reports, and menu management stores

- **Comprehensive Test Suite** — 1813 unit tests across 92 files
  - Full coverage of API functions, Zustand stores, utility modules
  - MSW server for API-dependent unit tests
  - i18n system tests, integration tests, error handling tests

- **Performance Monitoring** — Hooks and utilities for runtime performance tracking
  - `use-performance-monitor` hook
  - `performance-hooks.ts` and `responsive-hooks.ts`
  - Keyboard shortcuts registry with `keyboard-shortcuts.ts`

### Changed

- **POS Store Architecture** — Decomposed monolithic god store into Zustand slices
  - `auth-slice.ts`, `config-slice.ts`, `menu-slice.ts`, `orders-slice.ts`, `cart-slice.ts`, `selection-slice.ts`, `app-slice.ts`
  - Combined store pattern with `combined.ts` for cross-slice access
  - Each slice independently testable

- **API Layer Migration** — All API files migrated to retry SDK (`frappe-sdk-retry.ts`)
  - Automatic retry with exponential backoff for network errors, 5xx, and 429
  - No retry for 4xx client errors (validation, auth, not found)
  - Centralized in `src/lib/` with domain-specific `*-api.ts` files

- **i18n Improvements** — 26+ translation keys added, 25+ hardcoded strings replaced
  - All user-visible strings now use `t()` from `src/i18n/`
  - Arabic (RTL) support improved
  - Locale files: `en.json`, `fr.json`, `ar.json`, `sl.json`

- **Bundle Optimization** — Code splitting and lazy loading for route pages

### Fixed

- **Critical Python Bugs** — 5 CRITICAL backend crashes fixed
  - Wrong doctype name breaking KOT validation entirely
  - Wrong parenttype breaking delay notifications
  - `int()` crash on short invoice names
  - Division-by-zero in P&L BOM calculation
  - Empty query result crash in P&L report

- **XSS Vulnerability** — `innerHTML` replaced with `textContent` in Vue Alert store

- **Memory Leaks** — Socket channel listener, Masonry instance, resize handler, and timeout leaks fixed in Mosaic KDS

- **API Performance** — N+1 query elimination across backend APIs
  - `get_doc` replaced with `get_value` where only specific fields needed
  - Shared `_get_invoices_list()` helper deduplicating invoice list APIs
  - Transaction safety improvements

- **Flaky Tests** — `TableSelectionDialog` test reliability improved
  - MSW handler state leak resolved with `server.resetHandlers()` in `afterEach`
  - API dedup cache cleared with `invalidateCache()` before tests

### Security

- Auth improvements and route protection hardening
- Input validation bypass fixes
- Permission checks across backend APIs

### Removed

- Dead code across 24+ files (unused imports, empty blocks, commented-out code)
- Vite boilerplate CSS limiting KDS on wide screens
- Duplicate route names and interface definitions

---

## [0.1.0] — Initial React POS

### Added

- POS ordering with menu categories, cart management, and order type selection
- Table management with visual layout and room/zone management
- Dashboard with KPI cards and charts
- Menu management with CRUD operations
- Reports with sales, expense, P&L views
- Multi-language support (EN, FR, AR, SL)
- QZ Tray thermal printing integration
- Frappe SDK backend integration

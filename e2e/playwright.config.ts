import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the 4 URY frontend Vite apps
 * (frontend/, pos/, self-order/, mosaic/).
 *
 * Ports: none of the 4 apps set an explicit server.port in their
 * vite.config.ts (checked 2026-09), so each defaults to Vite's 5173 and
 * only auto-increments if that port is already taken on the same machine.
 * Since a dev running all 4 apps concurrently needs 4 distinct ports, this
 * config assumes the convention below and expects each app's dev server to
 * be started explicitly on that port (e.g. `vite --port 5174`). See
 * README.md for exact commands. Override with the env vars below if your
 * setup differs.
 *
 * No webServer block on purpose: these apps are Frappe-embedded SPAs whose
 * index.html reads frappe.boot / csrf_token injected by a running Frappe
 * dev server, and whose vite.config.ts proxies /api, /app, /assets, /files
 * to a real site (see frontend/vite.config.ts, ury.localhost:8002).
 * Exercising a real flow also needs an authenticated session and seeded
 * data (tables, menu items, a device/QR token) that only a running bench +
 * site can provide. Auto-starting bench + MariaDB + a seeded site from
 * here would either be fake (mocking away the real code paths) or require
 * infra this repo alone can't stand up — so this config expects the bench
 * and the 4 `yarn dev` processes to already be running, and just points
 * Playwright at them.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'frontend',
      testMatch: 'frontend.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.URY_FRONTEND_URL ?? 'http://ury.localhost:5173',
      },
    },
    {
      name: 'pos',
      testMatch: 'pos.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.URY_POS_URL ?? 'http://ury.localhost:5174',
      },
    },
    {
      name: 'self-order',
      testMatch: 'self-order.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.URY_SELF_ORDER_URL ?? 'http://ury.localhost:5175',
      },
    },
    {
      name: 'mosaic',
      testMatch: 'mosaic.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.URY_MOSAIC_URL ?? 'http://ury.localhost:5176',
      },
    },
  ],
});

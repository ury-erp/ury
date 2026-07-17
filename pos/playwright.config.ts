import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for URY POS E2E tests.
 *
 * Tests use MSW to mock API calls, so no Frappe backend is needed.
 * The dev server must be running with VITE_MSW_ENABLED=true.
 * The POS app uses React Router with basename="/pos", served at /pos/.
 *
 * Usage:
 *   npx playwright test           — run all E2E tests
 *   npx playwright test --ui      — run with interactive UI
 *   npx playwright test --debug   — debug mode
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential to avoid state conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for stability with MSW
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure', outputFolder: 'e2e-report' }]],
  timeout: 30000,
  expect: {
    timeout: 10000,
  },

  use: {
    baseURL: 'http://localhost:5173/pos',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run dev server with MSW enabled before tests.
  // reuseExistingServer: true means if a server is already running, use it.
  // Longer timeout to allow Vite + MSW service worker to initialize.
  webServer: {
    command: 'VITE_MSW_ENABLED=true npx vite --port 5173',
    url: 'http://localhost:5173/pos/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

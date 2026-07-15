import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for URY POS.
 *
 * Runs against the Vite dev server. The POS app uses React Router
 * with basename="/pos", so the app is served at http://localhost:5173/pos/.
 * API responses are mocked via route.fulfill() so tests are self-contained.
 *
 * Usage:
 *   npx playwright test          # headless
 *   npx playwright test --ui     # interactive UI mode
 *   npx playwright test --debug  # step-through debug
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e-report' }],
  ],
  use: {
    baseURL: 'http://localhost:5173/pos',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/pos/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

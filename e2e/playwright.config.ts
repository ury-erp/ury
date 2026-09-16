import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the URY frontend SPAs (frontend/, pos/,
 * self-order/, mosaic/).
 *
 * These are Frappe website-route-served SPAs, not standalone dev servers:
 * hooks.py website_route_rules maps /pos, /order, /mosaic, /ury to the
 * respective app's built index.html (ury/www/{pos,order,mosaic,ury}.html),
 * served by a real running bench + site. Reflects how these apps actually
 * ship in production, and sidesteps the fact that pos/ and self-order/
 * vite.config.ts define no dev-server proxy to a backend at all (only
 * frontend/ and mosaic/ do), so a `yarn dev` server for pos/self-order
 * cannot reach a live API in the first place.
 *
 * Point URY_BASE_URL at a live bench + site (built via `yarn build` in
 * each app dir, copied into that site app's public/www dirs, cache
 * cleared) before running.
 */
const BASE_URL = process.env.URY_BASE_URL ?? "http://sa-testcov-verify.local:8114";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "frontend", testMatch: "frontend.spec.ts" },
    { name: "pos", testMatch: "pos.spec.ts" },
    { name: "self-order", testMatch: "self-order.spec.ts" },
    { name: "mosaic", testMatch: "mosaic.spec.ts" },
  ],
});

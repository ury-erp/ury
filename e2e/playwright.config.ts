import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
 * Env-driven from e2e/.env.local (URY_BASE_URL, plus the admin creds
 * global-setup uses to seed fixtures — see fixtures/global-setup.ts).
 * process.env wins over .env.local so CI/ad-hoc overrides still work.
 */
function readEnvLocal(): Record<string, string> {
  const envPath = path.join(__dirname, ".env.local");
  const out: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

const envLocal = readEnvLocal();
for (const [key, value] of Object.entries(envLocal)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const BASE_URL = process.env.URY_BASE_URL ?? "http://localhost:8102";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./fixtures/global-setup.ts",
  // A single Chromium worker running one project at a time is a hard
  // requirement here, not a tuning knob: running multiple projects in
  // parallel is a documented, reproducible Chromium crash on this
  // container's ARM64 host (see README.md), and the golden-path spec
  // itself is order-dependent within a project (each test opens a real
  // table / advances a real order) so parallel workers within one file
  // would race over the same live-bench state. `--workers=1` is the
  // default here rather than an opt-in flag a future run can forget.
  workers: 1,
  fullyParallel: false,
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

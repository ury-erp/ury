// Visual proof for the Call tab. Run: node e2e/call_shots.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cfg from "../playwright.config.ts";
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(os.homedir(), ".npm/_npx/e41f203b7505f1fb/node_modules/playwright"));
const env = JSON.parse(fs.readFileSync(cfg.envFile, "utf8"));
const out = "/Users/safwan/Code/URY/ury_workspaces/tracks/frappe-insights-skill/proof/call";
fs.mkdirSync(out, { recursive: true });
const caps = { available: false, reason: "disabled", voice_call_enabled: false, engines: ["gemini_live"], languages: ["en", "hi", "ar", "ml"], max_seconds: 300 };
const browser = await chromium.launch({ headless: true });
for (const w of [360, 420]) for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ baseURL: cfg.baseURL, viewport: { width: w, height: w === 360 ? 780 : 860 }, deviceScaleFactor: 2, colorScheme: scheme, serviceWorkers: "block", permissions: ["microphone"] });
  await ctx.request.post("/api/method/login", { form: { usr: env.chair.usr, pwd: env.chair.pwd } });
  const brief = (await (await ctx.request.get("/api/method/ury.ury.api.chairman.get_brief")).json()).message;
  brief.features = { huf: true, voice_call: true };
  await ctx.route("**/api/method/ury.ury.api.chairman.get_brief*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ message: brief }) }));
  await ctx.route("**/api/method/ury.ury.api.chairman_call.call_capabilities*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ message: caps }) }));
  await ctx.route("**/api/method/ury.ury.api.chairman_chat.*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ message: { available: false } }) }));
  const page = await ctx.newPage();
  await page.goto("/ury/brief/"); await page.waitForSelector("section.slide");
  await page.click('.tabs button:has-text("Call")'); await page.waitForSelector("section.call");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/call_idle_${w}_${scheme}.png` });
  await page.click('button[aria-label="Start call"]');
  await page.waitForSelector('section.call[data-state="speaking"]', { timeout: 15000 });
  await page.waitForTimeout(700);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(w, scheme, "h-overflow:", over);
  await page.screenshot({ path: `${out}/call_live_${w}_${scheme}.png` });
  await ctx.close();
}
await browser.close();

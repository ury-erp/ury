// Visual proof for the dashboard card. Run: node e2e/dash_shots.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cfg from "../playwright.config.ts";
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(os.homedir(), ".npm/_npx/e41f203b7505f1fb/node_modules/playwright"));
const env = JSON.parse(fs.readFileSync(cfg.envFile, "utf8"));
const out = "/Users/safwan/Code/URY/ury_workspaces/tracks/frappe-insights-skill/proof/cards/gallery_v3";
const keys = ["A_one_column_full_text","B_two_columns_half_and_full","C_max_6_panels_4_rows_mixed","D_minimal_title_only","E_table_and_totals_one_column","F_lower_is_better_green_red"];
const dash = Object.fromEntries(keys.map((k) => [k, JSON.parse(fs.readFileSync(`${out}/dash_${k}.json`, "utf8"))]));
const browser = await chromium.launch({ headless: true });
for (const [w, scheme] of [[420, "light"], [360, "dark"]]) {
  const ctx = await browser.newContext({ baseURL: cfg.baseURL, viewport: { width: w, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme, serviceWorkers: "block" });
  await ctx.request.post("/api/method/login", { form: { usr: env.chair.usr, pwd: env.chair.pwd } });
  const brief = (await (await ctx.request.get("/api/method/ury.ury.api.chairman.get_brief")).json()).message;
  brief.features = { huf: true, voice_call: false };
  await ctx.route("**/api/method/ury.ury.api.chairman.get_brief*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ message: brief }) }));
  let cur = null; const hist = [];
  await ctx.route("**/api/method/ury.ury.api.chairman_chat.*", (r) => {
    const name = r.request().url().split("chairman_chat.")[1].split("?")[0];
    let m = ""; try { m = r.request().postDataJSON()?.message; } catch {}
    if (m && dash[m]) { cur = m; hist.push({ id: "u" + m, role: "user", content: m }, { id: "a" + m, role: "assistant", content: "Here you go.", cards: [dash[m]] }); }
    const msg = name === "call_capabilities" ? { available: false } : { conversation: "C1", pending: false, messages: hist };
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ message: msg }) });
  });
  const page = await ctx.newPage();
  await page.goto("/ury/brief/"); await page.waitForSelector("section.slide");
  await page.click('.tabs button:has-text("Ask")'); await page.waitForSelector("section.chat");
  let n = 0;
  for (const k of keys) {
    const box = page.getByRole("textbox", { name: "Message" });
    await box.fill(k); await box.press("Enter"); n++;
    await page.waitForFunction((c) => document.querySelectorAll(".card-dashboard").length >= c, n, { timeout: 10000 });
    await page.waitForTimeout(300);
    const c = page.locator(".card-dashboard").nth(n - 1);
    await c.scrollIntoViewIfNeeded();
    const vp = page.viewportSize(); await page.setViewportSize({ width: vp.width, height: 3200 }); await page.waitForTimeout(300);
    await c.screenshot({ path: `${out}/pwa_${k}_${w}_${scheme}.png` });
    await page.setViewportSize(vp);
  }
  await ctx.close();
}
await browser.close();

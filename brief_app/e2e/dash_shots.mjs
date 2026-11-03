// Visual proof for the dashboard card. Run: node e2e/dash_shots.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cfg from "../playwright.config.ts";
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(os.homedir(), ".npm/_npx/e41f203b7505f1fb/node_modules/playwright"));
const env = JSON.parse(fs.readFileSync(cfg.envFile, "utf8"));
const out = "/Users/safwan/Code/URY/ury_workspaces/tracks/frappe-insights-skill/proof/pwa_ds";
fs.mkdirSync(out, { recursive: true });
const one = JSON.parse(fs.readFileSync("/tmp/dash_one.json", "utf8"));
one.panels[1].card.good_direction = "up"; one.panels[2].card.good_direction = "down";
const k = (label, value, fmt, trend, tone, delta) => ({ label, value, fmt, delta, trend, tone });
const two = { v: 2, type: "dashboard", ai_composed: true,
  title: "نظرة عامة على مبيعات الأسبوع الماضي في جميع الفروع والمطاعم", subtitle: "2026-10-26 to 2026-11-01",
  subtext: "Figures exclude cancelled orders", footnote: "Compared with the previous 7 days.",
  panels: [
    { id: "a", span: 1, composed: false, caption: "Up on last week.", card: { v: 1, type: "kpi", title: "Net sales", subtitle: "vs prior 7 days", link: null, kpis: [k("Net sales", 1261675, "money", "up", "good", 0.124)] } },
    { id: "b", span: 1, composed: true, caption: "Fewer orders than usual.", card: { v: 1, type: "kpi", title: "Orders and a rather long panel title that must truncate", subtitle: "A long subtitle that goes past two lines so it has to be clamped by the card layout for sure, yes", link: null, kpis: [k("Orders", 1184, "int", "down", "bad", -0.087)] } },
    { id: "c", span: 2, composed: true, caption: "المبيعات اليومية مستقرة.", card: { v: 1, type: "table", title: "الأصناف الأكثر مبيعا", subtitle: "", link: { label: "Open dashboard", url: "/insights/dashboards/x" }, cols: ["Item", "Qty", "Amount"], rows: [["برجر دجاج", 120, 45000], ["Margherita Pizza Large", 98, 39200], ["Cold Coffee", 77, 15400]] } },
    { id: "d", span: 2, composed: false, card: { v: 1, type: "kpi", title: "Flat", link: null, kpis: [k("Avg order", 1422.15, "money", "flat", "neutral", 0), k("Refunds", 12, "int", null, "neutral", null), k("Net", 99999999, "money", "up", "good", 0.5)] } },
  ] };
const browser = await chromium.launch({ headless: true });
for (const w of [360, 420]) for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ baseURL: cfg.baseURL, viewport: { width: w, height: w === 360 ? 780 : 860 }, deviceScaleFactor: 2, colorScheme: scheme, serviceWorkers: "block" });
  await ctx.request.post("/api/method/login", { form: { usr: env.chair.usr, pwd: env.chair.pwd } });
  const brief = (await (await ctx.request.get("/api/method/ury.ury.api.chairman.get_brief")).json()).message;
  brief.features = { huf: true, voice_call: false };
  await ctx.route("**/api/method/ury.ury.api.chairman.get_brief*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ message: brief }) }));
  const hist = [];
  await ctx.route("**/api/method/ury.ury.api.chairman_chat.*", (r) => {
    const name = r.request().url().split("chairman_chat.")[1].split("?")[0];
    const which = (() => { try { return r.request().postDataJSON()?.message; } catch { return ""; } })();
    if (process.env.DBG) console.log(name, r.request().postData());
    const cards = which === "two" ? [two] : [one];
    const msg = name === "call_capabilities" ? { available: false } : { conversation: "C1", pending: false, messages: (which ? hist.push({ id: "u" + which, role: "user", content: which }, { id: "a" + which, role: "assistant", content: "Here you go.", cards }) && hist : hist) };
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ message: msg }) });
  });
  const page = await ctx.newPage();
  await page.goto("/ury/brief/"); await page.waitForSelector("section.slide");
  await page.click('.tabs button:has-text("Ask")'); await page.waitForSelector("section.chat");
  for (const q of ["one", "two"]) {
    const box = page.getByRole("textbox", { name: "Message" });
    await box.fill(q); await box.press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll(".card-dashboard").length >= n, q === "one" ? 1 : 2, { timeout: 10000 });
    await page.waitForTimeout(400);
    const cards = page.locator(".card-dashboard"); const c = cards.nth(q === "one" ? 0 : 1);
    await c.scrollIntoViewIfNeeded();
    const over = await page.evaluate(() => { const bad = []; document.querySelectorAll(".card-dashboard *").forEach((e) => { if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible" && e.clientWidth) bad.push(e.className || e.tagName); }); return [document.documentElement.scrollWidth > innerWidth, ...new Set(bad)]; });
    console.log(w, scheme, q, "overflow:", JSON.stringify(over));
    await page.screenshot({ path: `${out}/dash_${q}_${w}_${scheme}.png` });
    const vp = page.viewportSize(); await page.setViewportSize({ width: vp.width, height: 2400 }); await page.waitForTimeout(300);
    await c.screenshot({ path: `${out}/dash_${q}_${w}_${scheme}_card.png` });
    await page.setViewportSize(vp);
  }
  await ctx.close();
}
await browser.close();

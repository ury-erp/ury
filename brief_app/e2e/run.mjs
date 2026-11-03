// Headless e2e for the Chairman Brief PWA. Run: node e2e/run.mjs  (needs playwright resolvable; set PLAYWRIGHT_DIR)
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cfg from "../playwright.config.ts";

const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || path.join(os.homedir(), ".npm/_npx/e41f203b7505f1fb/node_modules/playwright");
const { chromium } = require(pwDir);
const env = JSON.parse(fs.readFileSync(cfg.envFile, "utf8"));
fs.mkdirSync(cfg.proofDir, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); };
const guard = async (name, fn) => { try { await fn(); } catch (e) { check(name + " (exception)", false, String(e.message).split("\n")[0]); } };

const browser = await chromium.launch({ channel: undefined, headless: true, args: cfg.chromiumArgs });
const newCtx = (o = {}) => browser.newContext({ baseURL: cfg.baseURL, viewport: cfg.viewport, ...o });

async function login(ctx, who) {
  const r = await ctx.request.post("/api/method/login", { form: { usr: who.usr, pwd: who.pwd } });
  if (!r.ok()) throw new Error("login failed " + r.status());
}
const slideIds = (page) => page.$$eval("section.slide", (e) => e.map((s) => s.dataset.slideId));
const dots = (page) => page.$$eval(".dot", (d) => d.findIndex((x) => x.getAttribute("aria-current") === "true"));
const BRIEF = "/api/method/ury.ury.api.chairman.get_brief";

async function realBrief(ctx) {
  const r = await ctx.request.get(BRIEF);
  return (await r.json()).message;
}
async function mockBriefHuf(ctx) {
  const b = await realBrief(ctx);
  b.features = { huf: true, voice_call: true };
  return b;
}

// ---------- 1. Deck light + dark ----------
for (const scheme of ["light", "dark"]) {
  await guard(`deck ${scheme}`, async () => {
    const ctx = await newCtx({ colorScheme: scheme });
    await login(ctx, env.chair);
    const page = await ctx.newPage();
    const brief = [];
    page.on("response", (r) => { if (r.url().includes("chairman.get_brief")) brief.push(r.status()); });
    await page.goto("/ury/brief/");
    await page.waitForSelector("section.slide", { timeout: 15000 });
    const ids = await slideIds(page);
    check(`[${scheme}] get_brief real data fetched (200)`, brief.includes(200), `statuses=${brief}`);
    check(`[${scheme}] slides present`, ids.length >= 6, ids.join(","));
    const mtd = await page.locator('section.slide[data-slide-id="mtd_target"]').innerText();
    check(`[${scheme}] slide 2 shows "Not recorded yet"`, /Not recorded yet/.test(mtd));
    if (scheme === "light") {
      await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700);
      check("ArrowRight advances to slide 2", (await dots(page)) === 1, `idx=${await dots(page)}`);
      await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(700);
      check("ArrowLeft returns to slide 1", (await dots(page)) === 0);
      await page.click('button[aria-label="Next slide"]'); await page.waitForTimeout(700);
      check("Next button advances", (await dots(page)) === 1);
      await page.click('button[aria-label="Previous slide"]'); await page.waitForTimeout(700);
      check("Prev button goes back", (await dots(page)) === 0);
      await page.click('button[aria-label="Go to slide 4"]'); await page.waitForTimeout(700);
      check("Dot jumps to slide 4", (await dots(page)) === 3);
      await page.click('button[aria-label="Go to slide 1"]'); await page.waitForTimeout(700);
    }
    for (let i = 0; i < ids.length; i++) {
      await page.click(`button[aria-label="Go to slide ${i + 1}"]`); await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(cfg.proofDir, `deck-${scheme}-${String(i + 1).padStart(2, "0")}-${ids[i]}.png`) });
    }
    await ctx.close();
  });
}

// ---------- 2. Service worker, SET_USER, offline, sign-out ----------
await guard("service worker / offline / sign-out", async () => {
  const ctx = await newCtx();
  await login(ctx, env.chair);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__sw = [];
    const orig = ServiceWorker.prototype.postMessage;
    ServiceWorker.prototype.postMessage = function (m, ...r) { try { window.__sw.push(JSON.parse(JSON.stringify(m))); } catch {} return orig.call(this, m, ...r); };
  });
  await page.goto("/ury/brief/");
  await page.waitForSelector("section.slide");
  const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active }; });
  check("service worker registers and activates", reg.active && reg.scope.endsWith("/ury/brief/"), JSON.stringify(reg));
  check("Playwright sees SW", ctx.serviceWorkers().length >= 1, `n=${ctx.serviceWorkers().length}`);
  // controller after first load may need reload
  await page.reload(); await page.waitForSelector("section.slide");
  await page.waitForTimeout(1500);
  const msgs = await page.evaluate(() => window.__sw);
  const su = msgs.find((m) => m.type === "SET_USER");
  check("SET_USER posted to SW", !!su && !!su.user, su ? `user key len=${su.user.length}` : `msgs=${JSON.stringify(msgs)}`);
  const keys = await page.evaluate(() => caches.keys());
  check("SW created per-user + meta caches", keys.some((k) => /ury-brief-.*-u-/.test(k)) && keys.includes("ury-brief-meta"), keys.join(","));

  // offline cached shell
  await page.reload(); await page.waitForSelector("section.slide");
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  const ok = await page.waitForSelector("section.slide", { timeout: 10000 }).then(() => true, () => false);
  check("offline reload shows cached deck", ok);
  if (!ok) {
    const fb = await page.locator("body").innerText();
    check("offline without cache falls back to offline.html page (not browser error)", /offline/i.test(fb) && /Try again/.test(fb), fb.replace(/\s+/g, " ").slice(0, 80));
  }
  const banner = await page.locator(".banner").allInnerTexts();
  check("offline banner shown", banner.some((t) => /offline/i.test(t)), JSON.stringify(banner));
  await page.screenshot({ path: path.join(cfg.proofDir, "offline-cached-deck.png") });
  const off = await page.evaluate(async () => {
    const r = await fetch("/api/method/ury.ury.api.chairman.get_brief", { credentials: "same-origin" });
    return { status: r.status, src: r.headers.get("X-Brief-Source"), ct: r.headers.get("content-type") };
  });
  check("offline get_brief served from cache with X-Brief-Source=cache", off.status === 200 && off.src === "cache", JSON.stringify(off));
  // offline JSON for uncached query (date) -> 503 offline json
  const off2 = await page.evaluate(async () => {
    const r = await fetch("/api/method/ury.ury.api.chairman.get_brief?date=2001-01-01", { credentials: "same-origin" });
    return { status: r.status, body: await r.text().catch(() => "") };
  });
  check("offline uncached brief gives JSON {offline:true} 503", off2.status === 503 && /offline/.test(off2.body), JSON.stringify(off2));
  await ctx.setOffline(false);

  // Sign out
  await page.reload(); await page.waitForSelector("section.slide");
  const lo = []; page.on("response", (r) => { if (r.url().includes("/api/method/logout")) lo.push(r.status()); });
  await page.click("text=Sign out");
  await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});
  check("logout POST accepted by server (not 400 CSRF)", lo.length && lo.every((s) => s < 400), `statuses=${lo}`);
  check("sign out lands on /login", /\/login/.test(page.url()), page.url());
  const after = await page.evaluate(() => caches.keys());
  check("sign out wipes ury-brief-* caches", after.filter((k) => k.startsWith("ury-brief-")).length === 0, JSON.stringify(after));
  await page.goto("/ury/brief/");
  await page.waitForLoadState("load");
  const body = await page.locator("body").innerText();
  check("second visit shows login (no deck)", /login/i.test(page.url()) && (await page.locator("section.slide").count()) === 0, page.url());
  const who = await (await ctx.request.get("/api/method/frappe.auth.get_logged_user")).json();
  check("server session actually ended", who.message === "Guest" || /Login to access/.test(JSON.stringify(who)), JSON.stringify(who).slice(0, 160));
  await page.screenshot({ path: path.join(cfg.proofDir, "after-signout-login.png") });
  await ctx.close();
});

// ---------- 3. No-role user ----------
await guard("no-role user", async () => {
  const ctx = await newCtx();
  await login(ctx, env.norole);
  const api = await ctx.request.get(BRIEF);
  const txt = await api.text();
  check("API denies no-role user (403)", api.status() === 403, `status=${api.status()}`);
  check("API response contains no slide data", !/"slides"/.test(txt));
  const page = await ctx.newPage();
  await page.goto("/ury/brief/");
  await page.waitForTimeout(2500);
  const n = await page.locator("section.slide").count();
  const t = await page.locator("body").innerText();
  check("UI shows sign-in/permission state, no slides", n === 0 && /sign in|do not have access/i.test(t), t.replace(/\s+/g, " ").slice(0, 120));
  await page.screenshot({ path: path.join(cfg.proofDir, "norole-denied.png") });
  await ctx.close();
});

// ---------- 4. Flag off: no tabs, no chairman_chat ----------
// The bench has a real chat agent, so this scenario forces features.huf=false by rewriting the
// get_brief response in the browser (service worker blocked so the route sees the request).
// It never touches the shared bench settings.
await guard("flag off", async () => {
  const ctx = await newCtx({ serviceWorkers: "block" });
  await login(ctx, env.chair);
  await ctx.route("**/api/method/ury.ury.api.chairman.get_brief*", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    if (body?.message) body.message.features = { ...(body.message.features || {}), huf: false, voice_call: false };
    await route.fulfill({ response: res, json: body });
  });
  const page = await ctx.newPage();
  const chat = [];
  ctx.on("request", (r) => { if (/chairman_chat|chairman_call|huf/i.test(r.url())) chat.push(r.url()); });
  await page.goto("/ury/brief/");
  await page.waitForSelector("section.slide");
  await page.reload(); await page.waitForSelector("section.slide"); await page.waitForTimeout(1500);
  const tabs = await page.$$eval(".tabs button", (b) => b.map((x) => x.textContent));
  check("features.huf=false: only Brief tab", JSON.stringify(tabs) === '["Brief"]', JSON.stringify(tabs));
  check("no Ask/Call controls in DOM", (await page.getByRole("button", { name: /^(Ask|Call)$/ }).count()) === 0);
  check("zero chairman_chat/huf requests", chat.length === 0, JSON.stringify(chat));
  await ctx.close();
});

// ---------- 5. Mocked huf: Call tab, Ask tab, Arabic ----------
async function mockedCtx(opts = {}) {
  const ctx = await newCtx({ serviceWorkers: "block", permissions: ["microphone"], ...opts });
  await login(ctx, env.chair);
  const brief = await mockBriefHuf(ctx);
  const calls = [];
  await ctx.route("**/api/method/ury.ury.api.chairman.get_brief*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: brief }) }));
  await ctx.route("**/api/method/ury.ury.api.chairman_chat.*", async (r) => {
    const name = r.request().url().split("chairman_chat.")[1].split("?")[0];
    let body = {}; try { body = r.request().postDataJSON() || {}; } catch {}
    calls.push({ name, body });
    const reply = (text) => ({ conversation: "CONV-1", messages: [{ id: "a-" + calls.length, role: "assistant", content: text }], pending: false });
    let msg = {};
    if (name === "start" || name === "send") msg = reply(body.message === "arabic" ? "مرحبا بك، هذه هي مبيعات الأمس" : "Sales were fine.");
    else if (name === "send_audio") msg = { ...reply("Heard you."), transcript: "how were sales" };
    else if (name === "history") msg = reply("Sales were fine.");
    else if (name === "call_capabilities") msg = { available: false };
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: msg }) });
  });
  return { ctx, calls };
}

await guard("call tab", async () => {
  const { ctx } = await mockedCtx();
  const page = await ctx.newPage();
  await page.goto("/ury/brief/"); await page.waitForSelector("section.slide");
  const tabs = await page.$$eval(".tabs button", (b) => b.map((x) => x.textContent));
  check("features.huf=true: Brief, Ask, Call tabs", JSON.stringify(tabs) === '["Brief","Ask","Call"]', JSON.stringify(tabs));
  await page.click('.tabs button:has-text("Call")');
  await page.waitForSelector("section.call");
  await page.evaluate(() => {
    window.__st = [];
    const el = document.querySelector("section.call");
    const push = () => window.__st.push(el.dataset.state);
    push(); new MutationObserver(push).observe(el, { attributes: true, attributeFilter: ["data-state"] });
  });
  await page.screenshot({ path: path.join(cfg.proofDir, "call-01-idle.png") });
  await page.click('button[aria-label="Start call"]');
  await page.waitForSelector('section.call[data-state="connected"], section.call[data-state="speaking"], section.call[data-state="listening"]', { timeout: 15000 });
  await page.screenshot({ path: path.join(cfg.proofDir, "call-02-live.png") });
  await page.click('button[aria-label="Mute microphone"]');
  const pressed = await page.getAttribute(".call-mute", "aria-pressed");
  check("mute toggles (aria-pressed=true)", pressed === "true");
  await page.screenshot({ path: path.join(cfg.proofDir, "call-03-muted.png") });
  await page.waitForTimeout(2500);
  await page.click('button[aria-label="End call"]');
  await page.waitForSelector('section.call[data-state="ended"]', { timeout: 10000 });
  await page.screenshot({ path: path.join(cfg.proofDir, "call-04-ended.png") });
  const st = [...new Set(await page.evaluate(() => window.__st))];
  check("mock call walked states", ["requesting_mic", "connecting", "ringing", "connected"].every((s) => st.includes(s)) && st.includes("ended"), st.join(">"));
  await ctx.close();
});

await guard("ask tab + mic upload", async () => {
  const { ctx, calls } = await mockedCtx();
  const page = await ctx.newPage();
  await page.goto("/ury/brief/"); await page.waitForSelector("section.slide");
  await page.click('.tabs button:has-text("Ask")');
  await page.waitForSelector("section.chat");
  await page.screenshot({ path: path.join(cfg.proofDir, "ask-01-intro.png") });
  await page.click('button[aria-label="Record a voice message"]');
  await page.waitForSelector('[role="dialog"][aria-label="Microphone"]');
  await page.click('button:has-text("Continue")');
  await page.waitForSelector('[role="timer"]');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(cfg.proofDir, "ask-02-recording.png") });
  await page.click('button[aria-label="Send voice message"]');
  await page.waitForTimeout(1500);
  const a = calls.find((c) => c.name === "send_audio");
  check("send_audio called with audio/webm", !!a && a.body.mime === "audio/webm", a ? `mime=${a.body.mime} b64len=${(a.body.b64 || "").length}` : "not called");
  check("send_audio b64 non-trivial", !!a && (a.body.b64 || "").length > 200);
  await page.screenshot({ path: path.join(cfg.proofDir, "ask-03-after-audio.png") });
  const txt = await page.locator(".msgs").innerText();
  check("transcript/reply shown", /Heard you/.test(txt), txt.replace(/\s+/g, " ").slice(0, 100));
  // Arabic
  await page.fill('input[aria-label="Message"]', "arabic");
  await page.press('input[aria-label="Message"]', "Enter");
  await page.waitForSelector(".msg.assistant .bubble:has-text(\"مرحبا\")", { timeout: 8000 });
  const dirs = await page.evaluate(() => [...document.querySelectorAll(".msg.assistant .bubble")].map((b) => {
    const p = b.querySelector("p, div, span") || b; return { dir: p.getAttribute("dir"), css: getComputedStyle(p).direction, align: getComputedStyle(p).textAlign, txt: b.innerText.slice(0, 20) };
  }));
  const ar = dirs.find((d) => /م/.test(d.txt));
  check("Arabic assistant text renders RTL (computed direction)", ar && ar.css === "rtl", JSON.stringify(ar));
  await page.fill('input[aria-label="Message"]', "مرحبا");
  const inputDir = await page.$eval('input[aria-label="Message"]', (e) => getComputedStyle(e).direction);
  check("Arabic typed in input is RTL", inputDir === "rtl", inputDir);
  await page.screenshot({ path: path.join(cfg.proofDir, "ask-04-arabic.png") });
  await ctx.close();
});

await guard("mic denied", async () => {
  const { ctx } = await mockedCtx();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("/ury/brief/"); await page.waitForSelector("section.slide");
  await page.click('.tabs button:has-text("Ask")');
  await page.click('button[aria-label="Record a voice message"]');
  await page.click('button:has-text("Continue")');
  const ok = await page.waitForSelector(".mic-err", { timeout: 5000 }).then(() => true, () => false);
  const t = ok ? await page.locator(".mic-err").innerText() : "";
  check("mic denied shows help message", ok && /blocked/i.test(t), t.slice(0, 80));
  await page.screenshot({ path: path.join(cfg.proofDir, "ask-05-mic-denied.png") });
  await ctx.close();
});

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
fs.writeFileSync(path.join(cfg.proofDir, "e2e-results.json"), JSON.stringify(results, null, 2));
process.exit(bad.length ? 1 : 0);

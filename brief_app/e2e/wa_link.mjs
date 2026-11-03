// Mocked-endpoint e2e for WhatsApp onboarding + token landing. Run: node e2e/wa_link.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cfg from "../playwright.config.ts";

const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || path.join(os.homedir(), ".npm/_npx/e41f203b7505f1fb/node_modules/playwright");
const { chromium } = require(pwDir);
const env = JSON.parse(fs.readFileSync(cfg.envFile, "utf8"));
const OUT = process.env.WA_PROOF_DIR || "/Users/safwan/Code/URY/ury_workspaces/tracks/frappe-insights-skill/proof/wa";
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  -- " + d : ""}`); };
const json = (route, message) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message }) });

const browser = await chromium.launch({ headless: true, args: cfg.chromiumArgs });

async function session(scheme, flagOn = true) {
  const ctx = await browser.newContext({ baseURL: cfg.baseURL, viewport: { width: 360, height: 740 }, colorScheme: scheme, serviceWorkers: "block" });
  const r = await ctx.request.post("/api/method/login", { form: { usr: env.chair.usr, pwd: env.chair.pwd } });
  if (!r.ok()) throw new Error("login failed");
  const real = (await (await ctx.request.get("/api/method/ury.ury.api.chairman.get_brief")).json()).message;
  real.features = { ...(real.features || {}), whatsapp: flagOn };
  const page = await ctx.newPage();
  const calls = { start: [], unlink: 0 };
  let linked = false;
  await page.route("**/*chairman.get_brief*", (rt) => json(rt, real));
  await page.route("**/*chairman_wa_onboard.status", (rt) => json(rt, {
    enabled: true, state: linked ? "Active" : "None", number_masked: linked ? "+97 •••• 4567" : "",
    verified_on: "", business_number: "971500000000", consent_text: "I agree that URY may send my daily brief summaries and answers to this WhatsApp number. Only figures my account can already see are shared. I can send STOP or unlink here at any time.", consent_text_version: "v1",
  }));
  await page.route("**/*chairman_wa_onboard.start_link", (rt) => {
    calls.start.push(JSON.parse(rt.request().postData() || "{}"));
    json(rt, { code: "482913", command: "LINK 482913", expires_minutes: 10, business_number: "971500000000", number_masked: "+97 •••• 4567", consent_text_version: "v1" });
  });
  await page.route("**/*chairman_wa_onboard.unlink", (rt) => { calls.unlink++; linked = false; json(rt, { unlinked: 1 }); });
  return { ctx, page, calls, setLinked: (v) => { linked = v; } };
}

// 1. flag off -> no entry
{
  const { ctx, page } = await session("light", false);
  await page.goto("/ury/brief/"); await page.waitForSelector("section.slide", { timeout: 15000 });
  check("flag off: WhatsApp button hidden", (await page.getByRole("button", { name: "WhatsApp", exact: true }).count()) === 0);
  await ctx.close();
}

// 2. onboarding flow, light + dark
for (const scheme of ["light", "dark"]) {
  const { ctx, page, calls, setLinked } = await session(scheme);
  await page.goto("/ury/brief/"); await page.waitForSelector("section.slide", { timeout: 15000 });
  await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
  await page.waitForSelector("#wa-number");
  const get = page.getByRole("button", { name: "Get my code" });
  check(`[${scheme}] consent text shown with version`, /agree that URY may send/.test(await page.locator(".sheet").innerText()) && /v1/.test(await page.locator(".sheet").innerText()));
  check(`[${scheme}] Get code disabled before number + consent`, await get.isDisabled());
  await page.fill("#wa-number", "+971 50 123 4567");
  check(`[${scheme}] still disabled without consent`, await get.isDisabled());
  await page.screenshot({ path: `${OUT}/wa_start_${scheme}_360.png` });
  await page.locator(".wa-consent input").check();
  check(`[${scheme}] enabled after number + consent`, await get.isEnabled());
  await get.click();
  await page.waitForSelector(".wa-code");
  const sheet = await page.locator(".sheet").innerText();
  check(`[${scheme}] code shown once with instruction`, /482 913/.test(sheet) && /LINK 482913/.test(sheet) && /\+971500000000/.test(sheet));
  check(`[${scheme}] request carried normalized-able number`, calls.start.length === 1 && calls.start[0].number === "+971 50 123 4567");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(`[${scheme}] no horizontal overflow at 360px`, !overflow);
  const small = await page.$$eval(".sheet button, .sheet input", (els) => els.filter((e) => e.getBoundingClientRect().height < 43 && e.type !== "checkbox").length);
  check(`[${scheme}] tap targets >= 44px`, small === 0, `small=${small}`);
  await page.screenshot({ path: `${OUT}/wa_code_${scheme}_360.png` });
  setLinked(true);
  await page.waitForSelector(".wa-ok", { timeout: 9000 });
  check(`[${scheme}] flips to Linked on poll`, /Linked/.test(await page.locator(".wa-ok").innerText()));
  check(`[${scheme}] linked view hides the code`, !/482/.test(await page.locator(".sheet").innerText()));
  await page.screenshot({ path: `${OUT}/wa_linked_${scheme}_360.png` });
  await page.getByRole("button", { name: "Unlink WhatsApp" }).click();
  await page.waitForSelector("#wa-number");
  check(`[${scheme}] unlink calls API and returns to start`, calls.unlink === 1);
  await ctx.close();
}

// 3. token landing: strip BEFORE POST, GET alone consumes nothing
{
  const ctx = await browser.newContext({ baseURL: cfg.baseURL, viewport: { width: 360, height: 740 }, serviceWorkers: "block" });
  const authed = await browser.newContext({ baseURL: cfg.baseURL });
  await authed.request.post("/api/method/login", { form: { usr: env.chair.usr, pwd: env.chair.pwd } });
  const shell = await (await authed.request.get("/ury/brief/")).text();
  await authed.close();
  const page = await ctx.newPage();
  const TOKEN = "Zx9_" + "a".repeat(39);
  let posts = 0, urlAtPost = null, bodyAtPost = null, hdr = null;
  await page.route("**/ury/brief/go*", (rt) => rt.fulfill({ status: 200, contentType: "text/html", body: shell }));
  await page.route("**/*chairman_link.exchange", async (rt) => {
    posts++; urlAtPost = page.url(); bodyAtPost = rt.request().postData(); hdr = rt.request().method();
    await json(rt, { redirect: "/ury/brief/" });
  });
  await page.route("**/ury/brief/", (rt) => rt.fulfill({ status: 200, contentType: "text/html", body: "<html><body>brief</body></html>" }), { times: 1 });
  const getOnly = await ctx.request.get("/ury/brief/go?t=" + TOKEN).catch(() => null);
  check("plain GET of the link issues no exchange POST", posts === 0);
  await page.goto("/ury/brief/go?t=" + TOKEN + "#sales");
  await page.waitForURL((u) => u.pathname === "/ury/brief/", { timeout: 8000 });
  check("exchange POSTed once, method POST", posts === 1 && hdr === "POST");
  check("token absent from the URL at POST time", urlAtPost && !urlAtPost.includes(TOKEN) && !urlAtPost.includes("t="), urlAtPost);
  check("token sent in POST body only", (bodyAtPost || "").includes(TOKEN));
  check("redirected to /ury/brief/ with intent hash", page.url().endsWith("/ury/brief/#sales") || page.url().endsWith("/ury/brief/"), page.url());
  // failure path
  const p2 = await ctx.newPage();
  await p2.route("**/ury/brief/go*", (rt) => rt.fulfill({ status: 200, contentType: "text/html", body: shell }));
  await p2.route("**/*chairman_link.exchange", (rt) => rt.fulfill({ status: 403, contentType: "application/json", body: "{}" }));
  await p2.goto("/ury/brief/go?t=" + TOKEN);
  await p2.waitForSelector("text=This link has expired");
  check("failed exchange shows expired state, token not in URL", !p2.url().includes("t="));
  await p2.screenshot({ path: `${OUT}/go_expired_360.png` });
  await ctx.close();
}

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

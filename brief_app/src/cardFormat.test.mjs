// node --test src/*.test.mjs
import test from "node:test";
import assert from "node:assert";
import { sanitizeCards, fmtValue, fmtDelta, safeLink, cardSummary, panelTitle, panelSubtitle, dashboardLink, trendGlyph, toneClass, fmtKpiValue, setBriefCurrency, currencySymbol, sameText, hideLoneKpiLabel, goodDirection } from "./chat/cardFormat.ts";
import { readFileSync } from "node:fs";
const live = JSON.parse(readFileSync("/tmp/cards.json", "utf8") || "{}");

test("fmtValue INR/int/missing", () => {
  assert.equal(fmtValue(34290, "money"), "₹34,290");
  assert.equal(fmtValue(444795, "money"), "₹4,44,795");
  assert.equal(fmtValue(-1200, "money"), "-₹1,200");
  assert.equal(fmtValue(22, "int"), "22");
  assert.equal(fmtValue(null, "money"), "–");
});
test("fmtDelta", () => {
  assert.deepEqual(fmtDelta(0.0009), { text: "+0.1%", dir: "up" });
  assert.deepEqual(fmtDelta(-0.25), { text: "−25%", dir: "down" });
  assert.equal(fmtDelta(0).dir, "flat");
  assert.equal(fmtDelta(null), null);
});
test("safeLink only allows /insights/ and /app/", () => {
  assert.ok(safeLink({ url: "/insights/x" }));
  assert.ok(safeLink({ url: "/app/sales" }));
  assert.equal(safeLink({ url: "https://evil.com" }), null);
  assert.equal(safeLink({ url: "//evil.com/insights/" }), null);
  assert.equal(safeLink({ url: "javascript:alert(1)" }), null);
  assert.equal(safeLink(null), null);
});
test("sanitizeCards drops unknown and malformed", () => {
  const out = sanitizeCards([{ type: "pie", title: "x" }, { type: "kpi" }, null, { type: "bar", series: [] }, { type: "table", cols: ["a"], rows: [] }]);
  assert.deepEqual(out.map((c) => c.type), ["bar", "table"]);
  assert.deepEqual(sanitizeCards(undefined), []);
});
test("live samples survive sanitize and summarize", () => {
  for (const cards of Object.values(live)) {
    const out = sanitizeCards(cards);
    assert.equal(out.length, cards.length);
    for (const c of out) assert.ok(cardSummary(c).length > 0);
  }
});

const dash = JSON.parse(readFileSync("/tmp/dash_one.json", "utf8"));
const kpi = { v: 1, type: "kpi", title: "K", kpis: [{ label: "a", value: 1, fmt: "int", trend: "up", tone: "good", delta: 0.1 }] };
test("dashboard fixture survives sanitize", () => {
  const [d] = sanitizeCards([dash]);
  assert.equal(d.type, "dashboard");
  assert.equal(d.panels.length, 3);
  assert.deepEqual(d.panels.map((p) => p.span), [2, 2, 2]);
  assert.match(cardSummary(d), /Last 7 Days Sales Overview/);
  assert.match(cardSummary(d), /Total net sales/);
  assert.match(dashboardLink(d).url, /^\/insights\/dashboards\/[a-z0-9]+$/);
});
test("dashboard malformed panels dropped, caps at 6, no nesting", () => {
  const nested = { v: 2, type: "dashboard", panels: [{ card: { type: "dashboard", panels: [] } }] };
  const many = { v: 2, type: "dashboard", title: "m", panels: Array.from({ length: 9 }, () => ({ card: kpi })) };
  const mixed = { v: 2, type: "dashboard", panels: [null, { card: { type: "pie" } }, { card: { type: "bar" } }, { card: kpi, span: 7, composed: "yes" }] };
  assert.deepEqual(sanitizeCards([nested, { type: "dashboard" }, { type: "dashboard", panels: "x" }]), []);
  assert.equal(sanitizeCards([many])[0].panels.length, 6);
  const [m] = sanitizeCards([mixed]);
  assert.equal(m.panels.length, 1);
  assert.equal(m.panels[0].span, 2);
  assert.equal(m.panels[0].composed, false);
});
test("dashboard helpers", () => {
  assert.equal(panelTitle({ card: { title: "c" }, title: "p" }), "p");
  assert.equal(panelTitle({ card: { title: "c" } }), "c");
  assert.equal(panelSubtitle({ card: { type: "kpi" } }), "");
  assert.equal(trendGlyph("up"), "▲");
  assert.equal(trendGlyph("down"), "▼");
  assert.equal(trendGlyph(null), "");
  assert.equal(toneClass("good"), "tone-good");
  assert.equal(toneClass("bad"), "tone-bad");
  assert.equal(toneClass("weird"), "tone-neutral");
  const unsafe = sanitizeCards([{ type: "dashboard", panels: [{ card: { ...kpi, link: { url: "https://evil.com" } } }] }])[0];
  assert.equal(dashboardLink(unsafe), null);
});
test("kpi summary includes trend", () => {
  assert.match(cardSummary(kpi), /a 1 up \+10%/);
});

test("fmtKpiValue abbreviates from 1Cr, keeps smaller figures in full", () => {
  assert.equal(fmtKpiValue(9999999, "money"), "₹99,99,999");
  assert.equal(fmtKpiValue(99999999, "money"), "₹10Cr");
  assert.equal(fmtKpiValue(123456789, "money"), "₹12.3Cr");
  assert.equal(fmtKpiValue(-25000000, "int"), "-2.5Cr");
  assert.equal(fmtKpiValue(99999999, "pct"), fmtValue(99999999, "pct"));
  assert.equal(fmtKpiValue("n/a", "money"), "n/a");
  assert.equal(fmtKpiValue(null, "money"), "–");
});
test("dedupe: lone KPI label repeating the panel title is hidden", () => {
  const one = (label) => ({ type: "kpi", kpis: [{ label, value: 1 }] });
  assert.equal(sameText(" Net Sales ", "net sales"), true);
  assert.equal(sameText("a", undefined), false);
  assert.equal(sameText("", ""), false);
  assert.equal(hideLoneKpiLabel(one("Net sales"), "net sales"), true);
  assert.equal(hideLoneKpiLabel(one("Orders"), "Net sales"), false);
  assert.equal(hideLoneKpiLabel({ type: "kpi", kpis: [{ label: "a", value: 1 }, { label: "a", value: 2 }] }, "a"), false);
  assert.equal(hideLoneKpiLabel({ type: "bar", series: [] }, "a"), false);
});
test("good_direction accepts only up or down", () => {
  assert.equal(goodDirection({ type: "bar", good_direction: "down" }), "down");
  assert.equal(goodDirection({ type: "bar", good_direction: "up" }), "up");
  assert.equal(goodDirection({ type: "bar", good_direction: "sideways" }), undefined);
  assert.equal(goodDirection({ type: "bar" }), undefined);
});

test("brief money follows the payload currency, INR default unchanged", () => {
  setBriefCurrency("INR");
  assert.equal(fmtValue(1234567, "money"), "₹12,34,567");
  setBriefCurrency("AED");
  assert.equal(fmtValue(1234567, "money"), currencySymbol("AED") + "1,234,567");
  setBriefCurrency("SAR");
  assert.equal(fmtValue(1500, "money"), "⃁1,500");
  setBriefCurrency("INR");
});

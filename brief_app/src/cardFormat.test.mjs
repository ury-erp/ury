// node --test src/*.test.mjs
import test from "node:test";
import assert from "node:assert";
import { sanitizeCards, fmtValue, fmtDelta, safeLink, cardSummary } from "./chat/cardFormat.ts";
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

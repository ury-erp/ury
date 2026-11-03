import test from "node:test";
import assert from "node:assert/strict";
import { heroSlide, tilesOf, factsOf, deltaOf, dashboardId } from "./today.ts";

const y = { id: "yesterday", title: "Yesterday", headline: "h", value: 1000, orders: 10, orders_compare: 8, delta_pct: 0.08, tone: "good", chart: { type: "spark", series: [] } };
test("hero + tiles use only existing fields", () => {
  assert.equal(heroSlide([{ id: "x", title: "", headline: "" }, y]), y);
  assert.equal(heroSlide([{ id: "x", title: "", headline: "", value: null }]), null);
  const t = tilesOf([y], y);
  assert.deepEqual(t.map((x) => x.id), ["orders", "avg"]);
  assert.deepEqual(tilesOf([], null), []);
});
test("delta + facts + dashboard id", () => {
  assert.equal(deltaOf(y).text, "+8%");
  assert.equal(deltaOf({ ...y, delta_pct: null }), null);
  const d = { id: "channel_mix", title: "", headline: "", chart: { type: "donut", series: [{ label: "A", value: 1 }, { label: "B", value: 3 }] } };
  assert.equal(factsOf(d)[0].l, "B · 75%");
  assert.equal(dashboardId("/insights/dashboards/994d"), "994d");
  assert.equal(dashboardId(null), null);
});

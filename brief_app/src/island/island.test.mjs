import test from "node:test";
import assert from "node:assert/strict";
import { extractDashboardId, isIslandAvailable, resetIslandCapability } from "./capability.ts";

test("extractDashboardId", () => {
  assert.equal(extractDashboardId("/insights/dashboards/abc123"), "abc123");
  assert.equal(extractDashboardId("/insights/dashboards/abc/x"), null);
  assert.equal(extractDashboardId("/insights/dashboards/"), null);
  assert.equal(extractDashboardId("/insights/dashboards/a-b"), null);
  assert.equal(extractDashboardId("https://evil.com/insights/dashboards/abc"), null);
  assert.equal(extractDashboardId("https://x.test/insights/dashboards/abc", "https://x.test"), "abc");
  assert.equal(extractDashboardId(undefined), null);
});

test("capability caches success", async () => {
  resetIslandCapability();
  let n = 0;
  const f = async () => { n++; return { ok: true, status: 200, json: async () => ({ message: { js: "/a.js", css: "/a.css" } }) }; };
  assert.equal(await isIslandAvailable(f), true);
  assert.equal(await isIslandAvailable(f), true);
  assert.equal(n, 1);
});

test("capability false on 403 / network error / empty, and cached", async () => {
  for (const f of [
    async () => ({ ok: false, status: 403, json: async () => ({}) }),
    async () => { throw new Error("offline"); },
    async () => ({ ok: true, status: 200, json: async () => ({ message: {} }) }),
  ]) {
    resetIslandCapability();
    assert.equal(await isIslandAvailable(f), false);
    assert.equal(await isIslandAvailable(async () => { throw new Error("no"); }), false);
  }
  resetIslandCapability();
});

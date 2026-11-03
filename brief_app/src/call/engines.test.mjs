// Run: node --experimental-strip-types --test src/call/engines.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { callErrorMessage, createCallEngine, liveSupported } from "./engines.ts";

test("callErrorMessage covers every reason code", () => {
  for (const r of ["disabled", "no_agent", "no_key", "policy", "role", "rate"]) {
    const m = callErrorMessage(r);
    assert.ok(m.length > 10 && m !== callErrorMessage("zzz"), r);
  }
  assert.equal(callErrorMessage(null), callErrorMessage("unknown"));
});

test("liveSupported needs available and gemini_live", () => {
  assert.equal(liveSupported(null), false);
  assert.equal(liveSupported({ available: true, engines: ["other"] }), false);
  assert.equal(liveSupported({ available: false, engines: ["gemini_live"] }), false);
  assert.equal(liveSupported({ available: true, engines: ["gemini_live"] }), true);
});

test("unavailable caps give mock with the reason message", async () => {
  const c = await createCallEngine({ available: false, reason: "disabled" }, { language: "en" });
  assert.equal(c.kind, "mock");
  assert.equal(c.notice, callErrorMessage("disabled"));
  const n = await createCallEngine(null, { language: "en" });
  assert.equal(n.kind, "mock");
  assert.equal(n.notice, null);
});

// node --test src/*.test.mjs
import test from "node:test";
import assert from "node:assert";
import { normalizeNumber, groupCode, businessLabel, whatsappEnabled, extractToken, landingTarget } from "./settings/whatsappHelpers.ts";

test("normalizeNumber", () => {
  assert.equal(normalizeNumber("+971 50 123 4567"), "971501234567");
  assert.equal(normalizeNumber("00971501234567"), "971501234567");
  assert.equal(normalizeNumber("0501234567"), null);
  assert.equal(normalizeNumber("12345"), null);
  assert.equal(normalizeNumber("1".repeat(16)), null);
  assert.equal(normalizeNumber(""), null);
});
test("groupCode / businessLabel", () => {
  assert.equal(groupCode("123456"), "123 456");
  assert.equal(businessLabel("971500000000"), "+971500000000");
  assert.equal(businessLabel(""), "");
});
test("whatsappEnabled only on explicit true", () => {
  assert.equal(whatsappEnabled({ whatsapp: true }), true);
  assert.equal(whatsappEnabled({}), false);
  assert.equal(whatsappEnabled(undefined), false);
  assert.equal(whatsappEnabled({ whatsapp: "yes" }), false);
});
test("extractToken", () => {
  const t = "A".repeat(43);
  assert.equal(extractToken("?t=" + t), t);
  assert.equal(extractToken("?t=short"), null);
  assert.equal(extractToken("?t=<script>" + t), null);
  assert.equal(extractToken(""), null);
});
test("landingTarget", () => {
  assert.equal(landingTarget("#sales"), "/ury/brief/#sales");
  assert.equal(landingTarget("#x/../evil"), "/ury/brief/");
  assert.equal(landingTarget(""), "/ury/brief/");
});

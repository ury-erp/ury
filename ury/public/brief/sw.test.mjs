import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "sw.js"), "utf8");
(0, eval)(src);
const h = globalThis.__briefSwHelpers;

test("helpers exposed and cache name versioned", () => {
	assert.ok(h);
	assert.equal(h.CACHE_NAME, "ury-brief-v1");
	assert.equal(h.KEEP, 7);
});

test("cacheKey keeps full query, drops hash", () => {
	const k = h.cacheKey("https://a.test/api/method/ury.ury.api.chairman.get_brief?date=2026-10-21#x");
	assert.equal(k, "/api/method/ury.ury.api.chairman.get_brief?date=2026-10-21");
});

test("cacheKey differs per date", () => {
	const b = "https://a.test/api/method/ury.ury.api.chairman.get_brief";
	assert.notEqual(h.cacheKey(b + "?date=2026-10-21"), h.cacheKey(b + "?date=2026-10-22"));
});

test("keysToTrim keeps newest 7", () => {
	const keys = Array.from({ length: 10 }, (_, i) => "k" + i);
	assert.deepEqual(h.keysToTrim(keys, 7), ["k0", "k1", "k2"]);
	assert.deepEqual(h.keysToTrim(keys.slice(0, 7), 7), []);
	assert.deepEqual(h.keysToTrim([], 7), []);
});

test("decorateHeaders sets X-Brief-Source and preserves others", () => {
	const out = h.decorateHeaders({ "content-type": "application/json" }, "cache");
	assert.equal(out.get("X-Brief-Source"), "cache");
	assert.equal(out.get("content-type"), "application/json");
	assert.equal(h.decorateHeaders(out, "network").get("x-brief-source"), "network");
});

test("route classification", () => {
	assert.ok(h.isBriefApi("/api/method/ury.ury.api.chairman.get_brief"));
	assert.ok(!h.isBriefApi("/api/method/frappe.ping"));
	assert.ok(h.isShellNavigation("/ury/brief"));
	assert.ok(h.isShellNavigation("/ury/brief/"));
	assert.ok(!h.isShellNavigation("/ury/briefcase"));
	assert.ok(h.isSwScript("/ury/brief/sw.js"));
});

test("staleCacheNames only touches ury-brief- prefix", () => {
	const names = ["ury-brief-v0", "ury-brief-v1", "ury-serve-shell-v1", "other"];
	assert.deepEqual(h.staleCacheNames(names, "ury-brief-v1"), ["ury-brief-v0"]);
});

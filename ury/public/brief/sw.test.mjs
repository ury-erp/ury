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
	assert.ok(h.CACHE_NAME.startsWith("ury-brief-"));
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
	assert.deepEqual(h.staleCacheNames(["ury-brief-old", h.CACHE_NAME], h.CACHE_NAME), ["ury-brief-old"]);
});

/* ---- fake Cache Storage ---- */
const ORIGIN = "https://a.test";
const API = ORIGIN + "/api/method/ury.ury.api.chairman.get_brief";
function k(key) { return typeof key === "string" ? key : new URL(key.url).pathname + new URL(key.url).search; }
function fakeCaches(initial = {}) {
	const stores = new Map(Object.entries(initial).map(([n, e]) => [n, new Map(Object.entries(e))]));
	const mk = (name) => ({
		async match(key) { const r = stores.get(name)?.get(k(key)); return r ? r.clone() : undefined; },
		async put(key, r) { stores.get(name).set(k(key), r); },
		async delete(key) { return stores.get(name).delete(k(key)); },
		async keys() { return [...stores.get(name).keys()].map((x) => ({ url: ORIGIN + x })); },
		async add(u) { stores.get(name).set(u, new Response("x")); }
	});
	return {
		stores,
		async open(name) { if (!stores.has(name)) stores.set(name, new Map()); return mk(name); },
		async keys() { return [...stores.keys()]; },
		async delete(name) { return stores.delete(name); },
		async match(key) { for (const [n] of stores) { const r = await mk(n).match(key); if (r) return r; } }
	};
}
function jsonRes(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function withUrl(res, url, redirected = false) {
	Object.defineProperty(res, "url", { value: url });
	Object.defineProperty(res, "redirected", { value: redirected });
	return res;
}
function deps(c, fetchImpl, extra = {}) {
	const sent = [];
	return { caches: c, fetch: fetchImpl, notify: (m) => sent.push(m), timeoutMs: 30, sent, ...extra };
}
const req = (u) => ({ url: u, method: "GET" });
const N = () => h.CACHE_NAME;

test("brief: network-first returns network response and stores it", async () => {
	const c = fakeCaches();
	const d = deps(c, async () => jsonRes({ message: { v: 1 } }));
	const res = await h.briefFetch(req(API), d);
	assert.equal(res.headers.get("X-Brief-Source"), "network");
	assert.deepEqual(await res.json(), { message: { v: 1 } });
	assert.ok(c.stores.get(N()).has("/api/method/ury.ury.api.chairman.get_brief"));
});

test("brief: slow network past timeout falls back to cache", async () => {
	const key = "/api/method/ury.ury.api.chairman.get_brief";
	const c = fakeCaches({ [N()]: { [key]: jsonRes({ message: { v: "old" } }) } });
	const d = deps(c, () => new Promise((r) => setTimeout(() => r(jsonRes({ message: { v: "new" } })), 300)));
	const res = await h.briefFetch(req(API), d);
	assert.equal(res.headers.get("X-Brief-Source"), "cache");
	assert.equal((await res.json()).message.v, "old");
});

test("brief: network failure with cache serves cache", async () => {
	const key = "/api/method/ury.ury.api.chairman.get_brief?date=2026-10-01";
	const c = fakeCaches({ [N()]: { [key]: jsonRes({ message: { v: "c" } }) } });
	const res = await h.briefFetch(req(API + "?date=2026-10-01"), deps(c, async () => { throw new Error("offline"); }));
	assert.equal(res.headers.get("X-Brief-Source"), "cache");
});

test("brief: offline without cache returns 503 JSON {offline:true}", async () => {
	const res = await h.briefFetch(req(API), deps(fakeCaches(), async () => { throw new Error("offline"); }));
	assert.equal(res.status, 503);
	assert.match(res.headers.get("content-type"), /application\/json/);
	assert.deepEqual(await res.json(), { offline: true });
});

test("brief: 401 evicts entry, wipes all ury-brief caches, notifies AUTH_LOST", async () => {
	const key = "/api/method/ury.ury.api.chairman.get_brief";
	const c = fakeCaches({ [N()]: { [key]: jsonRes({}) }, "ury-brief-old": { a: jsonRes({}) }, other: { a: jsonRes({}) } });
	const d = deps(c, async () => jsonRes({}, 401));
	const res = await h.briefFetch(req(API), d);
	assert.equal(res.status, 401);
	assert.deepEqual([...c.stores.keys()], ["other"]);
	assert.deepEqual(d.sent, [{ type: "AUTH_LOST" }]);
});

test("brief: 403 behaves like 401", async () => {
	const c = fakeCaches({ [N()]: {} });
	const d = deps(c, async () => jsonRes({}, 403));
	await h.briefFetch(req(API), d);
	assert.equal(c.stores.size, 0);
	assert.equal(d.sent.length, 1);
});

test("brief: keeps newest 7 entries", async () => {
	const c = fakeCaches();
	for (let i = 1; i <= 10; i++) {
		await h.briefFetch(req(API + "?date=2026-10-" + String(i).padStart(2, "0")), deps(c, async () => jsonRes({ i })));
	}
	const keys = [...c.stores.get(N()).keys()];
	assert.equal(keys.length, 7);
	assert.ok(keys[0].endsWith("2026-10-04") && keys[6].endsWith("2026-10-10"));
});

test("shell: ok brief page is cached and returned", async () => {
	const c = fakeCaches();
	const page = withUrl(new Response("<html>"), ORIGIN + "/ury/brief/");
	const res = await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => page));
	assert.equal(res, page);
	assert.ok(c.stores.get(N()).has("/ury/brief"));
});

test("shell: redirected responses are never cached", async () => {
	const c = fakeCaches();
	const r = withUrl(new Response("<html>"), ORIGIN + "/ury/brief/", true);
	await h.shellFetch(req(ORIGIN + "/ury/brief"), deps(c, async () => r));
	assert.equal(c.stores.get(N())?.has("/ury/brief") ?? false, false);
});

test("shell: redirect to /login wipes caches and returns the response", async () => {
	const c = fakeCaches({ [N()]: { "/ury/brief": new Response("A shell") } });
	const r = withUrl(new Response("login"), ORIGIN + "/login?redirect-to=/ury/brief/", true);
	const res = await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => r));
	assert.equal(res, r);
	assert.equal(c.stores.size, 0);
});

test("shell: 403 wipes caches", async () => {
	const c = fakeCaches({ [N()]: { "/ury/brief": new Response("A shell") } });
	await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => withUrl(new Response("no", { status: 403 }), ORIGIN + "/ury/brief/")));
	assert.equal(c.stores.size, 0);
});

test("shell: offline falls back to cached shell only on fetch throw", async () => {
	const c = fakeCaches({ [N()]: { "/ury/brief": new Response("cached shell") } });
	const res = await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => { throw new Error("offline"); }));
	assert.equal(await res.text(), "cached shell");
});

test("shell: online prefers network over cached shell", async () => {
	const c = fakeCaches({ [N()]: { "/ury/brief": new Response("stale") } });
	const res = await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => withUrl(new Response("fresh"), ORIGIN + "/ury/brief/")));
	assert.equal(await res.text(), "fresh");
});

test("LOGOUT wipe removes every ury-brief cache only", async () => {
	const c = fakeCaches({ "ury-brief-a": {}, "ury-brief-b": {}, keep: {} });
	await h.wipeAll({ caches: c });
	assert.deepEqual([...c.stores.keys()], ["keep"]);
});

test("activate deletes stale ury-brief caches but keeps current", async () => {
	const c = fakeCaches({ [N()]: {}, "ury-brief-old": {}, other: {} });
	await h.activate({ caches: c });
	assert.deepEqual([...c.stores.keys()].sort(), [N(), "other"].sort());
});

test("install fails when offline page is missing, tolerates missing icons", async () => {
	const mk = (failOn) => {
		const c = fakeCaches();
		const open = c.open.bind(c);
		c.open = async (n) => { const x = await open(n); x.add = async (u) => { if (u.includes(failOn)) throw new Error("404"); }; return x; };
		return c;
	};
	await assert.rejects(h.install({ caches: mk("offline.html") }));
	await h.install({ caches: mk("icon-192.png") });
});

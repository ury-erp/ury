import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "sw.js"), "utf8");
(0, eval)(src);
const h = globalThis.__briefSwHelpers;

/* ---- fake Cache Storage ---- */
const ORIGIN = "https://a.test";
const API = ORIGIN + "/api/method/ury.ury.api.chairman.get_brief";
const KEY = "/api/method/ury.ury.api.chairman.get_brief";
const UA = "userAAAA";
const UB = "userBBBB";
const SESSION_A = "a%40x.test";
const stamped = (body) => h.stamp(new Response(body), "a@x.test", Date.now());
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
function metaFor(user) { return { [h.META_CACHE]: { "/__ury_brief_user__": new Response(user) } }; }
function allKeys(c) { return [...c.stores.values()].flatMap((m) => [...m.keys()]); }
function jsonRes(body, status = 200, headers = {}) {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
function withUrl(res, url, redirected = false) {
	Object.defineProperty(res, "url", { value: url });
	Object.defineProperty(res, "redirected", { value: redirected });
	return res;
}
function deps(c, fetchImpl, extra = {}) {
	const sent = [];
	return { caches: c, fetch: fetchImpl, notify: (m) => sent.push(m), timeoutMs: 30, sent, cookieUser: async () => SESSION_A, ...extra };
}
const req = (u, user, init = {}) => ({ url: u, method: "GET", headers: new Headers(user ? { "X-Brief-User": user } : {}), ...init });
const U = (user) => h.userCacheName(user);

/* ---- versioning / pure helpers ---- */

test("cache names are versioned and per-user", () => {
	assert.ok(h.STATIC_CACHE.startsWith("ury-brief-") && h.STATIC_CACHE.endsWith("-static"));
	assert.equal(h.BUILD, "dev", "no ?v= in this context");
	assert.equal(h.VERSION_PREFIX, "ury-brief-dev-");
	assert.equal(U(UA), h.VERSION_PREFIX + "u-" + UA);
	assert.notEqual(U(UA), U(UB));
	assert.equal(U(""), "");
	assert.equal(h.KEEP, 7);
});

test("deriveBuild reads ?v=, sanitises, falls back to dev", () => {
	const b = (u) => h.deriveBuild(u);
	assert.equal(b("https://a.test/ury/brief/sw.js?v=abc.1_2-3"), "abc.1_2-3");
	assert.equal(b("https://a.test/ury/brief/sw.js?v=a/b%20c<x>"), "abcx");
	assert.equal(b("https://a.test/ury/brief/sw.js"), "dev");
	assert.equal(b("https://a.test/ury/brief/sw.js?v="), "dev");
	assert.equal(b("https://a.test/ury/brief/sw.js?v=%2F%2F"), "dev");
	assert.equal(b("https://a.test/ury/brief/sw.js?v=__BUILD_VERSION__"), "dev");
	assert.equal(b("not a url"), "dev");
	assert.equal(b(""), "dev");
});

test("sanitizeUser rejects unsafe or empty keys", () => {
	assert.equal(h.sanitizeUser("abcd1234"), "abcd1234");
	for (const bad of ["", "ab", "a/b/cdef", "x y zz", "../../x", null, 5, "a".repeat(200)]) {
		assert.equal(h.sanitizeUser(bad), "", String(bad));
	}
});

test("cacheKey keeps full query, drops hash; differs per date", () => {
	assert.equal(h.cacheKey(API + "?date=2026-10-21#x"), KEY + "?date=2026-10-21");
	assert.notEqual(h.cacheKey(API + "?date=2026-10-21"), h.cacheKey(API + "?date=2026-10-22"));
});

test("keysToTrim keeps newest 7", () => {
	const keys = Array.from({ length: 10 }, (_, i) => "k" + i);
	assert.deepEqual(h.keysToTrim(keys, 7), ["k0", "k1", "k2"]);
	assert.deepEqual(h.keysToTrim([], 7), []);
});

test("decorateHeaders sets X-Brief-Source and preserves others", () => {
	const out = h.decorateHeaders({ "content-type": "application/json" }, "cache");
	assert.equal(out.get("X-Brief-Source"), "cache");
	assert.equal(out.get("content-type"), "application/json");
});

test("never-cache list: chat, huf, files, socket.io", () => {
	for (const u of [
		ORIGIN + "/api/method/ury.ury.api.chairman_chat.send",
		ORIGIN + "/api/method/huf.ai.agent.chat.get_history?conversation_id=1",
		ORIGIN + "/files/voice.webm",
		ORIGIN + "/private/files/x.pdf",
		ORIGIN + "/socket.io/?EIO=4&transport=polling",
		ORIGIN + "/api/method/x?cmd=huf.ai.chat",
		ORIGIN + "/api/method/ury.ury.api.chairman%5Fchat.speak"
	]) assert.ok(h.isNeverCache(u), u);
	assert.ok(!h.isNeverCache(API));
	assert.ok(!h.isNeverCache(ORIGIN + "/assets/ury/brief/dist/index-abc.js"));
});

test("route: same-origin /ury/brief scope; skips chat/huf/files/socket.io, POST, cross-origin, other api", () => {
	const r = (url, init = {}) => h.route({ url, method: "GET", ...init }, ORIGIN);
	assert.equal(r(API), "brief");
	assert.equal(r(ORIGIN + "/ury/brief/", { mode: "navigate" }), "shell");
	assert.equal(r(ORIGIN + "/ury/brief/slide/2", { mode: "navigate" }), "shell");
	assert.equal(r(ORIGIN + "/ury/briefcase", { mode: "navigate" }), "skip");
	assert.equal(r(ORIGIN + "/ury/brief/sw.js"), "skip");
	assert.equal(r(ORIGIN + "/assets/ury/brief/dist/index-abc.js"), "asset");
	assert.equal(r(ORIGIN + "/api/method/ury.ury.api.chairman_chat.send"), "skip");
	assert.equal(r(ORIGIN + "/api/method/huf.ai.agent.chat.get_history"), "skip");
	assert.equal(r(ORIGIN + "/files/a.mp3"), "skip");
	assert.equal(r(ORIGIN + "/socket.io/?EIO=4"), "skip");
	assert.equal(r(ORIGIN + "/api/method/frappe.ping"), "skip");
	assert.equal(r(API, { method: "POST" }), "skip");
	assert.equal(r("https://evil.test/api/method/ury.ury.api.chairman.get_brief"), "skip");
});

test("storable refuses audio, no-store, errors and never-cache urls", () => {
	assert.ok(h.storable(jsonRes({})));
	assert.ok(!h.storable(new Response("x", { headers: { "content-type": "audio/mpeg" } })));
	assert.ok(!h.storable(new Response("x", { headers: { "content-type": "video/webm" } })));
	assert.ok(!h.storable(jsonRes({}, 200, { "cache-control": "no-store" })));
	assert.ok(h.storable(jsonRes({}, 200, { "cache-control": "no-store" }), true), "user-scoped override");
	assert.ok(!h.storable(withUrl(jsonRes({}), ORIGIN + "/api/method/ury.ury.api.chairman.chairman_chat"), true));
	assert.ok(!h.storable(new Response("x", { headers: { "content-type": "audio/mpeg" } }), true));
	assert.ok(!h.storable(jsonRes({}, 500)));
	assert.ok(!h.storable(withUrl(jsonRes({}), ORIGIN + "/api/method/huf.ai.x")));
});

test("staleCacheNames only touches ury-brief- prefix and never meta", () => {
	const names = ["ury-brief-v0-static", h.STATIC_CACHE, h.META_CACHE, "ury-serve-shell-v1", "other"];
	assert.deepEqual(h.staleCacheNames(names, [h.STATIC_CACHE]), ["ury-brief-v0-static"]);
});

/* ---- brief data ---- */

test("brief: network-first returns network response and stores it in the user cache", async () => {
	const c = fakeCaches();
	const res = await h.briefFetch(req(API, UA), deps(c, async () => jsonRes({ message: { v: 1 } })));
	assert.equal(res.headers.get("X-Brief-Source"), "network");
	assert.deepEqual(await res.json(), { message: { v: 1 } });
	assert.ok(c.stores.get(U(UA)).has(KEY));
	assert.equal(await h.getUser({ caches: c }), UA);
});

test("brief: unknown user is never stored and never served from cache", async () => {
	const c = fakeCaches({ [U(UA)]: { [KEY]: jsonRes({ v: "A" }) } });
	const r1 = await h.briefFetch(req(API), deps(c, async () => jsonRes({ v: "net" })));
	assert.deepEqual(await r1.json(), { v: "net" });
	assert.equal(c.stores.get(U(UA)).size, 1);
	const r2 = await h.briefFetch(req(API), deps(c, async () => { throw new Error("offline"); }));
	assert.equal(r2.status, 503);
	assert.deepEqual(await r2.json(), { offline: true });
});

test("brief: slow network past timeout falls back to cache", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { [KEY]: h.stamp(jsonRes({ message: { v: "old" } }), "a@x.test", Date.now()) } });
	const d = deps(c, () => new Promise((r) => setTimeout(() => r(jsonRes({ message: { v: "new" } })), 300)));
	const res = await h.briefFetch(req(API), d);
	assert.equal(res.headers.get("X-Brief-Source"), "cache");
	assert.equal((await res.json()).message.v, "old");
});

test("brief: offline without cache returns 503 JSON {offline:true}", async () => {
	const res = await h.briefFetch(req(API, UA), deps(fakeCaches(), async () => { throw new Error("offline"); }));
	assert.equal(res.status, 503);
	assert.match(res.headers.get("content-type"), /application\/json/);
	assert.deepEqual(await res.json(), { offline: true });
});

test("brief: 401 evicts and wipes every ury-brief cache, notifies AUTH_LOST", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { [KEY]: jsonRes({}) }, [h.STATIC_CACHE]: { a: jsonRes({}) }, "ury-brief-old": {}, other: { a: jsonRes({}) } });
	const d = deps(c, async () => jsonRes({}, 401));
	const res = await h.briefFetch(req(API, UA), d);
	assert.equal(res.status, 401);
	assert.deepEqual([...c.stores.keys()], ["other"]);
	assert.deepEqual(d.sent, [{ type: "AUTH_LOST" }]);
});

test("brief: 403 behaves like 401 (even for unknown user)", async () => {
	const c = fakeCaches({ [U(UA)]: { [KEY]: jsonRes({}) } });
	const d = deps(c, async () => jsonRes({}, 403));
	await h.briefFetch(req(API), d);
	assert.equal(c.stores.size, 0);
	assert.deepEqual(d.sent, [{ type: "AUTH_LOST" }]);
});

test("brief: audio responses are returned but not stored", async () => {
	const c = fakeCaches();
	await h.briefFetch(req(API + "?date=2026-10-01", UA), deps(c, async () => new Response("x", { headers: { "content-type": "audio/mpeg" } })));
	assert.equal(c.stores.get(U(UA)).size, 0);
});

test("brief: keeps newest 7 entries", async () => {
	const c = fakeCaches();
	for (let i = 1; i <= 10; i++) {
		await h.briefFetch(req(API + "?date=2026-10-" + String(i).padStart(2, "0"), UA), deps(c, async () => jsonRes({ i })));
	}
	const keys = [...c.stores.get(U(UA)).keys()];
	assert.equal(keys.length, 7);
	assert.ok(keys[0].endsWith("2026-10-04") && keys[6].endsWith("2026-10-10"));
});

/* ---- cross-user isolation ---- */

test("no cross-user leakage: user B never sees user A's cached brief", async () => {
	const c = fakeCaches();
	await h.briefFetch(req(API, UA), deps(c, async () => jsonRes({ who: "A" })));
	assert.ok(c.stores.has(U(UA)));
	/* B arrives offline on the same device */
	const res = await h.briefFetch(req(API, UB), deps(c, async () => { throw new Error("offline"); }));
	assert.equal(res.status, 503);
	assert.deepEqual(await res.json(), { offline: true });
	assert.ok(!c.stores.has(U(UA)), "A's cache wiped on user change");
	assert.ok(![...c.stores.keys()].some((n) => n.includes(UA)), "no cache name for A remains");
	assert.ok(!allKeys(c).includes(KEY), "no brief JSON remains anywhere");
	assert.equal(await h.getUser({ caches: c }), UB);
});

test("SET_USER with a different user wipes user caches but keeps static assets", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { [KEY]: jsonRes({}), "/ury/brief": new Response("A shell") }, [h.STATIC_CACHE]: { "/assets/ury/brief/offline.html": new Response("off") } });
	await h.onMessage({ type: "SET_USER", user: UB }, deps(c, null));
	assert.ok(!c.stores.has(U(UA)));
	assert.ok(c.stores.get(h.STATIC_CACHE).has("/assets/ury/brief/offline.html"));
	assert.equal(await h.getUser({ caches: c }), UB);
});

test("SET_USER with same user keeps data; with invalid user clears identity and data", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { [KEY]: jsonRes({}) } });
	await h.onMessage({ type: "SET_USER", user: UA }, deps(c, null));
	assert.ok(c.stores.get(U(UA)).has(KEY));
	await h.onMessage({ type: "SET_USER", user: "bad user!" }, deps(c, null));
	assert.ok(!c.stores.has(U(UA)));
	assert.equal(await h.getUser({ caches: c }), "");
});

test("header user switch wipes previous user's shell too", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { "/ury/brief": new Response("A shell") } });
	await h.briefFetch(req(API, UB), deps(c, async () => jsonRes({ who: "B" })));
	assert.ok(!c.stores.has(U(UA)));
	const shell = await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => { throw new Error("offline"); }));
	assert.notEqual(shell && shell.type !== "error" ? await shell.text() : "", "A shell");
});

/* ---- logout ---- */

test("LOGOUT message wipes all ury-brief caches (incl. meta) and notifies", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { [KEY]: jsonRes({}) }, [h.STATIC_CACHE]: {}, "ury-brief-b": {}, keep: {} });
	const d = deps(c, null);
	await h.onMessage({ type: "LOGOUT" }, d);
	assert.deepEqual([...c.stores.keys()], ["keep"]);
	assert.deepEqual(d.sent, [{ type: "LOGOUT_DONE" }]);
	assert.equal(await h.getUser({ caches: c }), "");
});

/* ---- shell ---- */

test("shell: ok brief page is cached per user and returned", async () => {
	const c = fakeCaches(metaFor(UA));
	const page = withUrl(new Response("<html>"), ORIGIN + "/ury/brief/");
	const res = await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => page));
	assert.equal(res, page);
	assert.ok(c.stores.get(U(UA)).has("/ury/brief"));
});

test("shell: not cached when user unknown, or response no-store/redirected", async () => {
	const c = fakeCaches();
	await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => withUrl(new Response("<html>"), ORIGIN + "/ury/brief/")));
	assert.equal(allKeys(c).includes("/ury/brief"), false);
	const c2 = fakeCaches(metaFor(UA));
	await h.shellFetch(req(ORIGIN + "/ury/brief"), deps(c2, async () => withUrl(new Response("<html>"), ORIGIN + "/ury/brief/", true)));
	assert.equal(allKeys(c2).includes("/ury/brief"), false);
});

const FRAPPE_CC = { "cache-control": "no-store,no-cache,must-revalidate,max-age=0" };

test("no-store override: shell IS stored with a user key, NOT without", async () => {
	const page = () => withUrl(new Response("<html>", { headers: FRAPPE_CC }), ORIGIN + "/ury/brief/");
	const c = fakeCaches(metaFor(UA));
	await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => page()));
	assert.ok(c.stores.get(U(UA)).has("/ury/brief"));
	const c2 = fakeCaches();
	await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c2, async () => page()));
	assert.equal(allKeys(c2).includes("/ury/brief"), false);
	assert.deepEqual(allKeys(c2), []);
});

test("no-store override: get_brief IS stored with a user key, NOT without", async () => {
	const c = fakeCaches();
	await h.briefFetch(req(API, UA), deps(c, async () => jsonRes({ v: 1 }, 200, FRAPPE_CC)));
	assert.ok(c.stores.get(U(UA)).has(KEY));
	const c2 = fakeCaches();
	const r = await h.briefFetch(req(API), deps(c2, async () => jsonRes({ v: 1 }, 200, FRAPPE_CC)));
	assert.deepEqual(await r.json(), { v: 1 });
	assert.deepEqual(allKeys(c2), []);
});

test("no-store override never applies to chairman_chat (with or without no-store)", async () => {
	const CHAT = ORIGIN + "/api/method/ury.ury.api.chairman.chairman_chat";
	assert.equal(h.route(req(CHAT, UA), ORIGIN), "skip");
	assert.equal(h.route(req(CHAT, UA, { method: "POST" }), ORIGIN), "skip");
	for (const hdrs of [FRAPPE_CC, {}]) {
		const c = fakeCaches(metaFor(UA));
		await h.briefFetch(req(CHAT, UA), deps(c, async () => withUrl(jsonRes({ a: 1 }, 200, hdrs), CHAT)));
		assert.equal(allKeys(c).some((x) => x.includes("chairman_chat")), false);
		assert.ok(!h.storable(withUrl(jsonRes({}, 200, hdrs), CHAT), true));
	}
});

test("offline after no-store responses: serves cached shell and brief for current user only", async () => {
	const c = fakeCaches({ [h.STATIC_CACHE]: { [h.OFFLINE_URL]: new Response("offline page") } });
	await h.briefFetch(req(API, UA), deps(c, async () => jsonRes({ v: "A" }, 200, FRAPPE_CC)));
	await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => withUrl(new Response("A shell", { headers: FRAPPE_CC }), ORIGIN + "/ury/brief/")));
	const off = async () => { throw new Error("offline"); };
	const b = await h.briefFetch(req(API, UA), deps(c, off));
	assert.equal(b.headers.get("X-Brief-Source"), "cache");
	assert.deepEqual(await b.json(), { v: "A" });
	assert.equal(await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, off))).text(), "A shell");
	/* user B: never sees A's data */
	const bB = await h.briefFetch(req(API, UB), deps(c, off));
	assert.equal(bB.status, 503);
	assert.equal(await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, off))).text(), "offline page");
	/* LOGOUT: nothing served */
	await h.briefFetch(req(API, UA), deps(c, async () => jsonRes({ v: "A" }, 200, FRAPPE_CC)));
	await h.onMessage({ type: "LOGOUT" }, deps(c, null));
	assert.equal((await h.briefFetch(req(API), deps(c, off))).status, 503);
});

test("no-store still refused for static assets", async () => {
	const c = fakeCaches();
	const u = ORIGIN + "/assets/ury/brief/x.js";
	await h.assetFetch(req(u), deps(c, async () => withUrl(new Response("x", { headers: FRAPPE_CC }), u)));
	assert.equal(allKeys(c).length, 0);
});

test("shell: redirect to /login wipes caches and returns the response", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { "/ury/brief": new Response("A shell") } });
	const r = withUrl(new Response("login"), ORIGIN + "/login?redirect-to=/ury/brief/", true);
	const res = await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => r));
	assert.equal(res, r);
	assert.equal(c.stores.size, 0);
});

test("shell: 403 wipes caches", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { "/ury/brief": new Response("A shell") } });
	await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => withUrl(new Response("no", { status: 403 }), ORIGIN + "/ury/brief/")));
	assert.equal(c.stores.size, 0);
});

test("shell: offline serves current user's cached shell, else offline page", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { "/ury/brief": stamped("cached shell") }, [h.STATIC_CACHE]: { [h.OFFLINE_URL]: new Response("offline page") } });
	const off = async () => { throw new Error("offline"); };
	assert.equal(await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, off))).text(), "cached shell");
	await h.onMessage({ type: "LOGOUT" }, deps(c, null));
	c.stores.set(h.STATIC_CACHE, new Map([[h.OFFLINE_URL, new Response("offline page")]]));
	assert.equal(await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, off))).text(), "offline page");
});

test("shell: online prefers network over cached shell", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { "/ury/brief": new Response("stale") } });
	const res = await h.shellFetch(req(ORIGIN + "/ury/brief/"), deps(c, async () => withUrl(new Response("fresh"), ORIGIN + "/ury/brief/")));
	assert.equal(await res.text(), "fresh");
});

/* ---- static assets / install / activate ---- */

test("asset: network-first into static cache, cache on failure, audio never stored", async () => {
	const c = fakeCaches();
	const js = ORIGIN + "/assets/ury/brief/dist/index-abc.js";
	await h.assetFetch(req(js), deps(c, async () => new Response("code", { headers: { "content-type": "text/javascript" } })));
	assert.equal(await (await h.assetFetch(req(js), deps(c, async () => { throw new Error("x"); }))).text(), "code");
	const mp3 = ORIGIN + "/assets/ury/brief/dist/beep.mp3";
	await h.assetFetch(req(mp3), deps(c, async () => new Response("a", { headers: { "content-type": "audio/mpeg" } })));
	assert.ok(!c.stores.get(h.STATIC_CACHE).has("/assets/ury/brief/dist/beep.mp3"));
});

test("distUrls reads vite manifest, rejects traversal/absolute/audio", () => {
	const urls = h.distUrls({
		"index.html": { file: "assets/index-1.js", css: ["assets/index-1.css"], assets: ["assets/logo.svg", "assets/ding.mp3"] },
		x: { file: "../../../private/files/x" }, y: { file: "https://evil.test/a.js" }, z: { file: "/files/a.js" }
	});
	assert.deepEqual(urls, [
		"/assets/ury/brief/dist/assets/index-1.js",
		"/assets/ury/brief/dist/assets/index-1.css",
		"/assets/ury/brief/dist/assets/logo.svg"
	]);
});

test("install: offline page required, icons and dist best-effort", async () => {
	const mk = (failOn) => {
		const c = fakeCaches();
		const open = c.open.bind(c);
		c.open = async (n) => { const x = await open(n); const add = x.add; x.add = async (u) => { if (u.includes(failOn)) throw new Error("404"); return add(u); }; return x; };
		return c;
	};
	await assert.rejects(h.install({ caches: mk("offline.html"), fetch: async () => jsonRes({}) }));
	const c = mk("icon-192.png");
	await h.install({ caches: c, fetch: async () => jsonRes({ "index.html": { file: "assets/i.js" } }) });
	assert.ok(c.stores.get(h.STATIC_CACHE).has("/assets/ury/brief/dist/assets/i.js"));
	await h.install({ caches: mk("nothing"), fetch: async () => { throw new Error("no manifest"); } });
});

test("activate deletes stale ury-brief caches, keeps static, meta and current user's cache", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: {}, [U(UB)]: {}, [h.STATIC_CACHE]: {}, "ury-brief-old-u-x": {}, other: {} });
	await h.activate({ caches: c });
	assert.deepEqual([...c.stores.keys()].sort(), [h.META_CACHE, U(UA), h.STATIC_CACHE, "other"].sort());
});

/* ---- M1: offline data requires proof of the same session user, and is max 24h old ---- */

const SIGN_IN = "Sign in to see your brief";
async function primeA(c, now) {
	const d = deps(c, null, { now: () => now });
	d.fetch = async () => jsonRes({ v: "A" }, 200, { "cache-control": "no-store" });
	await h.briefFetch(req(API, UA), d);
	d.fetch = async () => withUrl(new Response("A shell"), ORIGIN + "/ury/brief/");
	await h.shellFetch(req(ORIGIN + "/ury/brief/"), d);
}
const offlineDeps = (c, extra) => deps(c, async () => { throw new Error("offline"); }, extra);
const seed = () => fakeCaches({ [h.STATIC_CACHE]: { [h.OFFLINE_URL]: new Response("offline page") } });

test("M1: same session user reopening offline gets cached shell and brief", async () => {
	const c = seed(); const t0 = 1_000_000;
	await primeA(c, t0);
	const d = offlineDeps(c, { now: () => t0 + 60_000 });
	assert.equal(await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), d)).text(), "A shell");
	const b = await h.briefFetch(req(API, UA), d);
	assert.equal(b.headers.get("X-Brief-Source"), "cache");
	assert.deepEqual(await b.json(), { v: "A" });
	/* no SET_USER/header yet on reopen: still served (stored-user + matching cookie) */
	assert.equal((await h.briefFetch(req(API), d)).headers.get("X-Brief-Source"), "cache");
});

test("M1: logged out elsewhere (Guest/no cookie) or different session user is blocked offline", async () => {
	for (const cookie of ["Guest", "", null, "b%40x.test", async () => { throw new Error("no cookieStore"); }]) {
		const c = seed(); const t0 = 1_000_000;
		await primeA(c, t0);
		const cu = typeof cookie === "function" ? cookie : async () => cookie;
		const d = offlineDeps(c, { now: () => t0 + 60_000, cookieUser: cu });
		const shell = await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), d)).text();
		assert.ok(shell.includes(SIGN_IN), "shell blocked for cookie " + cookie);
		assert.ok(!shell.includes("A shell"));
		const b = await h.briefFetch(req(API, UA), d);
		assert.equal(b.status, 503);
		assert.deepEqual(await b.json(), { offline: true });
	}
});

test("M1: no cookieStore support at all (deps without cookieUser) never serves cached data", async () => {
	const c = seed(); await primeA(c, 1_000_000);
	const d = offlineDeps(c, { now: () => 1_000_001, cookieUser: undefined });
	assert.ok((await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), d)).text()).includes(SIGN_IN));
	assert.equal((await h.briefFetch(req(API, UA), d)).status, 503);
});

test("M1: cache older than 24h is not served offline; exactly 24h still is", async () => {
	const c = seed(); const t0 = 1_000_000;
	await primeA(c, t0);
	const ok = offlineDeps(c, { now: () => t0 + h.MAX_AGE_MS });
	assert.equal(await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), ok)).text(), "A shell");
	const old = offlineDeps(c, { now: () => t0 + h.MAX_AGE_MS + 1 });
	assert.ok((await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), old)).text()).includes(SIGN_IN));
	assert.equal((await h.briefFetch(req(API, UA), old)).status, 503);
	/* clock moved backwards also fails closed */
	assert.equal((await h.briefFetch(req(API, UA), offlineDeps(c, { now: () => t0 - 1 }))).status, 503);
});

test("M1: unstamped legacy entries are never served offline", async () => {
	const c = fakeCaches({ ...metaFor(UA), [U(UA)]: { "/ury/brief": new Response("legacy"), [KEY]: jsonRes({ v: 1 }) } });
	const d = offlineDeps(c);
	assert.ok((await (await h.shellFetch(req(ORIGIN + "/ury/brief/"), d)).text()).includes(SIGN_IN));
	assert.equal((await h.briefFetch(req(API, UA), d)).status, 503);
});

test("M1: online fallback (timeout) also requires proof", async () => {
	const c = seed(); const t0 = 1_000_000;
	await primeA(c, t0);
	const slow = () => new Promise((r) => setTimeout(() => r(jsonRes({ v: "new" })), 300));
	const res = await h.briefFetch(req(API, UA), deps(c, slow, { now: () => t0 + 1, cookieUser: async () => "Guest" }));
	assert.equal(res.status, 503);
});

test("normalizeCookieUser: decodes, Guest and junk become empty", () => {
	assert.equal(h.normalizeCookieUser("a%40x.test"), "a@x.test");
	assert.equal(h.normalizeCookieUser("Guest"), "");
	assert.equal(h.normalizeCookieUser(undefined), "");
	assert.equal(h.normalizeCookieUser("%E0%A4%A"), "");
});

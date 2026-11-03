/* URY Owner Brief service worker. Scope /ury/brief/. */
/* eslint-disable no-restricted-globals */
/*
 * Isolation model (P1):
 *  - Cache names are versioned: ury-brief-<build>-static (non-user assets) and
 *    ury-brief-<build>-u-<userKey> (shell + brief JSON for one user).
 *  - The active user key is persisted in ury-brief-meta. The page announces it
 *    with postMessage({type:"SET_USER", user:<opaque hash>}) and/or sends the
 *    "X-Brief-User" header on brief API requests. A different key wipes every
 *    user cache before anything is stored or served.
 *  - Without a known user key, nothing user-specific is stored or served from cache.
 *  - LOGOUT message, 401/403, or a login redirect wipe every ury-brief-* cache.
 *  - Chat, Huf, file, socket.io traffic and non-GET requests are never intercepted;
 *    audio/video and no-store responses are never stored, EXCEPT the shell document and
 *    the get_brief response, which ignore no-store (Frappe sends it on every response)
 *    but only when written into the per-user cache of a valid user key.
 *  - Offline proof (review M1): every cached shell/brief entry is stamped with the Frappe
 *    session user (user_id cookie, read via CookieStore) and the time it was stored. Offline,
 *    a cached entry is served only if the current user_id cookie is present, not Guest, and
 *    equals the stamp, and the entry is younger than MAX_AGE_MS (24h). A logout anywhere
 *    (desk, another tab) resets user_id to Guest, so the previous user's data is never shown;
 *    the shell then gets a "Sign in to see your brief" page instead.
 */
(function () {
	"use strict";

	var CACHE_PREFIX = "ury-brief-";
	var BUILD = "__BUILD_VERSION__";
	var VERSION_PREFIX = CACHE_PREFIX + BUILD + "-";
	var STATIC_CACHE = VERSION_PREFIX + "static";
	var META_CACHE = CACHE_PREFIX + "meta";
	var META_KEY = "/__ury_brief_user__";
	var USER_HEADER = "X-Brief-User";
	var SCOPE_PREFIX = "/ury/brief";
	var SHELL_KEY = "/ury/brief";
	var ASSET_PREFIX = "/assets/ury/brief/";
	var DIST_PREFIX = "/assets/ury/brief/dist/";
	var DIST_MANIFEST = "/assets/ury/brief/dist/.vite/manifest.json";
	var OFFLINE_URL = "/assets/ury/brief/offline.html";
	var KEEP = 7;
	var TIMEOUT_MS = 6000;
	var MAX_AGE_MS = 24 * 60 * 60 * 1000;
	var STAMP_USER = "X-Brief-Session-User";
	var STAMP_AT = "X-Brief-Cached-At";
	var SIGN_IN_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
		'<meta name="viewport" content="width=device-width,initial-scale=1"><title>Owner Brief</title>' +
		'<style>body{font-family:system-ui,sans-serif;margin:0;padding:48px 16px;text-align:center;background:#fff;color:#111}' +
		'@media (prefers-color-scheme:dark){body{background:#111;color:#eee}}</style></head><body>' +
		'<h1>Sign in to see your brief</h1><p>You are offline and this device has no saved brief for the signed-in user. ' +
		'Connect and sign in to load it.</p></body></html>';
	var BRIEF_API = "/api/method/ury.ury.api.chairman.get_brief";
	var NEVER_CACHE = ["chairman_chat", "huf.", "/files/", "/socket.io"];
	var ICONS = [
		"/assets/ury/brief/manifest.webmanifest",
		"/assets/ury/brief/icons/icon-192.png",
		"/assets/ury/brief/icons/icon-512.png",
		"/assets/ury/brief/icons/icon-192-maskable.png",
		"/assets/ury/brief/icons/icon-512-maskable.png",
		"/assets/ury/brief/icons/apple-touch-icon.png"
	];

	/* ---- pure helpers (also exposed for node tests) ---- */

	function parse(url) { return new URL(url, "https://x.invalid"); }
	function cacheKey(url) { var u = parse(url); return u.pathname + u.search; }
	function pathOf(url) { try { return parse(url).pathname; } catch (e) { return ""; } }
	function isBriefApi(pathname) { return pathname === BRIEF_API; }
	function isShellNavigation(pathname) {
		return pathname === SCOPE_PREFIX || pathname.indexOf(SCOPE_PREFIX + "/") === 0;
	}
	function isSwScript(pathname) {
		return pathname === SCOPE_PREFIX + "/sw.js" || /brief-sw\.js$/.test(pathname);
	}
	/** Chat, Huf, files and realtime traffic: never intercepted, never stored. */
	function isNeverCache(url) {
		var s;
		try {
			var u = parse(url);
			s = (decodeURIComponent(u.pathname) + u.search).toLowerCase();
		} catch (e) { return true; }
		for (var i = 0; i < NEVER_CACHE.length; i++) {
			if (s.indexOf(NEVER_CACHE[i]) !== -1) { return true; }
		}
		return false;
	}
	/** Opaque user key: safe charset only. Anything else is treated as unknown. */
	function sanitizeUser(v) {
		if (typeof v !== "string") { return ""; }
		return /^[A-Za-z0-9_-]{4,128}$/.test(v) ? v : "";
	}
	function userCacheName(user) { return user ? VERSION_PREFIX + "u-" + user : ""; }
	function keysToTrim(keys, n) { return keys.length > n ? keys.slice(0, keys.length - n) : []; }
	function staleCacheNames(names, keep) {
		var k = [].concat(keep);
		return names.filter(function (n) {
			return n.indexOf(CACHE_PREFIX) === 0 && n !== META_CACHE && k.indexOf(n) === -1;
		});
	}
	function briefCacheNames(names) { return names.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0; }); }
	function decorateHeaders(headers, source) {
		var out = new Headers(headers);
		out.set("X-Brief-Source", source);
		return out;
	}
	function decorate(response, source) {
		return new Response(response.body, {
			status: response.status, statusText: response.statusText,
			headers: decorateHeaders(response.headers, source)
		});
	}
	function isAuthStatus(status) { return status === 401 || status === 403; }
	function isAudio(res) {
		var ct = (res && res.headers && res.headers.get("content-type")) || "";
		return /^\s*(audio|video)\//i.test(ct);
	}
	function noStore(res) {
		var cc = (res && res.headers && res.headers.get("cache-control")) || "";
		return /no-store/i.test(cc);
	}
	/**
	 * Response may be written to Cache Storage at all.
	 * userScoped=true (only for shell/get_brief into a valid per-user cache) ignores no-store.
	 */
	function storable(res, userScoped) {
		return !!res && !!res.ok && res.type !== "opaqueredirect" && res.type !== "opaque" &&
			!isAudio(res) && (userScoped === true || !noStore(res)) && !(res.url && isNeverCache(res.url));
	}
	function isLoggedOutShell(res) {
		if (isAuthStatus(res.status) || res.type === "opaqueredirect") { return true; }
		return pathOf(res.url).indexOf("/login") === 0;
	}
	function shouldCacheShell(res, userScoped) {
		return storable(res, userScoped) && !res.redirected && pathOf(res.url).replace(/\/$/, "") === SCOPE_PREFIX;
	}
	function offlineJson() {
		return new Response(JSON.stringify({ offline: true }), {
			status: 503,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Brief-Source": "offline" }
		});
	}
	function withTimeout(promise, ms) {
		return new Promise(function (resolve, reject) {
			var t = setTimeout(function () { reject(new Error("timeout")); }, ms);
			promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
		});
	}
	/** Frappe user_id cookie value -> session user, "" when absent or Guest. */
	function normalizeCookieUser(v) {
		if (typeof v !== "string" || !v) { return ""; }
		try { v = decodeURIComponent(v); } catch (e) { return ""; }
		return v === "Guest" ? "" : v;
	}
	/** Copy of `response` stamped with the session user and store time. */
	function stamp(response, sessionUser, now) {
		var hd = new Headers(response.headers);
		hd.set(STAMP_USER, encodeURIComponent(sessionUser || ""));
		hd.set(STAMP_AT, String(now));
		return new Response(response.body, { status: response.status, statusText: response.statusText, headers: hd });
	}
	/** Cached entry may be served offline: stamped for this exact session user and not expired. */
	function provenFresh(cached, sessionUser, now) {
		if (!cached || !sessionUser) { return false; }
		var su;
		try { su = decodeURIComponent(cached.headers.get(STAMP_USER) || ""); } catch (e) { return false; }
		var at = Number(cached.headers.get(STAMP_AT));
		if (!su || su !== sessionUser || !isFinite(at)) { return false; }
		var age = now - at;
		return age >= 0 && age <= MAX_AGE_MS;
	}
	function nowOf(deps) { return deps.now ? deps.now() : Date.now(); }
	function sessionUserOf(deps) {
		if (!deps.cookieUser) { return Promise.resolve(""); }
		return Promise.resolve().then(deps.cookieUser).then(normalizeCookieUser, function () { return ""; });
	}
	function signInPage() {
		return new Response(SIGN_IN_HTML, {
			status: 200,
			headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Brief-Source": "sign-in" }
		});
	}
	function headerUser(request) {
		try { return sanitizeUser(request.headers && request.headers.get(USER_HEADER)); } catch (e) { return ""; }
	}

	/* ---- effectful logic, dependencies injected: deps = {caches, fetch, notify, timeoutMs} ---- */

	function wipeAll(deps) {
		return deps.caches.keys().then(function (keys) {
			return Promise.all(briefCacheNames(keys).map(function (k) { return deps.caches.delete(k); }));
		});
	}
	/** Wipe all user data (and the meta entry) but keep the static, non-user asset cache. */
	function wipeUserData(deps) {
		return deps.caches.keys().then(function (keys) {
			return Promise.all(briefCacheNames(keys).filter(function (k) { return k !== STATIC_CACHE; })
				.map(function (k) { return deps.caches.delete(k); }));
		});
	}

	function getUser(deps) {
		return deps.caches.open(META_CACHE).then(function (c) { return c.match(META_KEY); })
			.then(function (r) { return r ? r.text() : ""; })
			.then(sanitizeUser, function () { return ""; });
	}

	/** Make `user` the active user. Any change of user (including to none) wipes every user cache first. */
	function setUser(deps, user) {
		user = sanitizeUser(user);
		return getUser(deps).then(function (prev) {
			if (prev === user && user) { return user; }
			return wipeUserData(deps).then(function () {
				if (!user) { return ""; }
				return deps.caches.open(META_CACHE).then(function (c) {
					return c.put(META_KEY, new Response(user, { headers: { "Content-Type": "text/plain" } }));
				}).then(function () { return user; });
			});
		});
	}

	/** Resolve the user for a request: header wins (and switches user), else persisted meta. */
	function resolveUser(request, deps) {
		var hu = headerUser(request);
		return hu ? setUser(deps, hu) : getUser(deps);
	}

	function trim(cache) {
		return cache.keys().then(function (reqs) {
			var briefs = reqs.filter(function (r) { return isBriefApi(pathOf(r.url)); });
			return Promise.all(keysToTrim(briefs, KEEP).map(function (r) { return cache.delete(r); }));
		});
	}
	function store(cache, key, response, deps) {
		return sessionUserOf(deps).then(function (su) {
			return cache.delete(key).then(function () { return cache.put(key, stamp(response, su, nowOf(deps))); });
		}).then(function () { return trim(cache); });
	}

	function authLost(deps) {
		return wipeAll(deps).then(function () { if (deps.notify) { deps.notify({ type: "AUTH_LOST" }); } });
	}

	function briefFetch(request, deps) {
		var key = cacheKey(request.url);
		var ms = deps.timeoutMs || TIMEOUT_MS;
		return resolveUser(request, deps).then(function (user) {
			var name = userCacheName(user);
			if (!name) {
				/* unknown user: pure network, never stored, never served from cache */
				return deps.fetch(request).then(function (res) {
					if (isAuthStatus(res.status)) { return authLost(deps).then(function () { return decorate(res, "network"); }); }
					return decorate(res, "network");
				}, function () { return offlineJson(); });
			}
			return deps.caches.open(name).then(function (cache) {
				function fallback() {
					return Promise.all([cache.match(key), sessionUserOf(deps)]).then(function (x) {
						return provenFresh(x[0], x[1], nowOf(deps)) ? decorate(x[0], "cache") : offlineJson();
					});
				}
				return cache.match(key).then(function (cached) {
					var net = deps.fetch(request);
					return (cached ? withTimeout(net, ms) : net).then(function (res) {
						if (isAuthStatus(res.status)) {
							return authLost(deps).then(function () { return decorate(res, "network"); });
						}
						/* name is a valid per-user cache here, request is get_brief: no-store ignored */
						if (storable(res, isBriefApi(pathOf(request.url)))) {
							return store(cache, key, res.clone(), deps).then(function () { return decorate(res, "network"); });
						}
						return cached ? fallback() : decorate(res, "network");
					}, fallback);
				});
			});
		});
	}

	function offlinePage(deps) {
		return deps.caches.open(STATIC_CACHE).then(function (c) { return c.match(OFFLINE_URL); })
			.then(function (o) { return o || Response.error(); });
	}

	function shellFetch(request, deps) {
		return deps.fetch(request).then(function (res) {
			if (isLoggedOutShell(res)) {
				return wipeAll(deps).then(function () { return res; });
			}
			if (!shouldCacheShell(res, true)) { return res; }
			return getUser(deps).then(function (user) {
				var name = userCacheName(user);
				if (!name) { return res; } /* no-store override applies only with a valid user key */
				return Promise.all([deps.caches.open(name), sessionUserOf(deps)]).then(function (x) {
					return x[0].put(SHELL_KEY, stamp(res.clone(), x[1], nowOf(deps)));
				})
					.then(function () { return res; }, function () { return res; });
			});
		}, function () {
			return getUser(deps).then(function (user) {
				var name = userCacheName(user);
				if (!name) { return null; }
				return Promise.all([deps.caches.open(name).then(function (cache) { return cache.match(SHELL_KEY); }), sessionUserOf(deps)])
					.then(function (x) {
						if (!x[0]) { return null; }
						/* a cached shell exists but this session cannot prove it owns it */
						return provenFresh(x[0], x[1], nowOf(deps)) ? x[0] : signInPage();
					});
			}).then(function (cached) { return cached || offlinePage(deps); });
		});
	}

	/** Static brief assets (incl. dist bundle): network-first, cached in the shared static cache. */
	function assetFetch(request, deps) {
		var key = cacheKey(request.url);
		return deps.caches.open(STATIC_CACHE).then(function (cache) {
			return deps.fetch(request).then(function (res) {
				if (storable(res)) {
					return cache.put(key, res.clone()).then(function () { return res; }, function () { return res; });
				}
				return res;
			}, function () {
				return cache.match(key).then(function (c) { return c || Response.error(); });
			});
		});
	}

	/** Precache list from the Vite manifest (best effort; the shell works without it). */
	function distUrls(manifest) {
		var out = [];
		function add(f) {
			if (typeof f !== "string" || !f || f.indexOf("..") !== -1 || /^[a-z]+:|^\//i.test(f)) { return; }
			if (out.indexOf(DIST_PREFIX + f) === -1) { out.push(DIST_PREFIX + f); }
		}
		Object.keys(manifest || {}).forEach(function (k) {
			var e = manifest[k] || {};
			add(e.file);
			(e.css || []).forEach(add);
			(e.assets || []).forEach(add);
		});
		return out.filter(function (u) { return !isNeverCache(u) && !/\.(mp3|wav|ogg|oga|webm|m4a|mp4|aac|flac)$/i.test(u); });
	}

	function install(deps) {
		return deps.caches.open(STATIC_CACHE).then(function (cache) {
			/* offline page is required: no catch, install fails if missing */
			return cache.add(OFFLINE_URL).then(function () {
				var icons = Promise.all(ICONS.map(function (u) { return cache.add(u).catch(function () {}); }));
				var dist = Promise.resolve().then(function () {
					return deps.fetch ? deps.fetch(DIST_MANIFEST) : null;
				}).then(function (r) {
					return r && r.ok ? r.json() : {};
				}).then(function (m) {
					return Promise.all(distUrls(m).map(function (u) { return cache.add(u).catch(function () {}); }));
				}).catch(function () {});
				return Promise.all([icons, dist]);
			});
		});
	}

	/** Drop caches of older builds. Current-build user cache is kept only for the persisted user. */
	function activate(deps) {
		return getUser(deps).then(function (user) {
			var keep = [STATIC_CACHE];
			if (user) { keep.push(userCacheName(user)); }
			return deps.caches.keys().then(function (keys) {
				return Promise.all(staleCacheNames(keys, keep).map(function (k) { return deps.caches.delete(k); }));
			});
		});
	}

	/** Message handler (pure on deps). Returns a promise. */
	function onMessage(data, deps) {
		data = data || {};
		if (data.type === "LOGOUT") {
			return wipeAll(deps).then(function () { if (deps.notify) { deps.notify({ type: "LOGOUT_DONE" }); } });
		}
		if (data.type === "SET_USER") {
			return setUser(deps, data.user);
		}
		return Promise.resolve();
	}

	/** Route decision for a fetch event: "skip" | "brief" | "shell" | "asset". */
	function route(request, origin) {
		if (!request || (request.method || "GET").toUpperCase() !== "GET") { return "skip"; }
		var url;
		try { url = new URL(request.url); } catch (e) { return "skip"; }
		if (url.origin !== origin) { return "skip"; }
		if (isNeverCache(request.url)) { return "skip"; }
		if (isSwScript(url.pathname)) { return "skip"; }
		if (isBriefApi(url.pathname)) { return "brief"; }
		if (url.pathname.indexOf("/api/") === 0) { return "skip"; }
		if (isShellNavigation(url.pathname) && request.mode === "navigate") { return "shell"; }
		if (url.pathname.indexOf(ASSET_PREFIX) === 0) { return "asset"; }
		return "skip";
	}

	var helpers = {
		CACHE_PREFIX: CACHE_PREFIX, STATIC_CACHE: STATIC_CACHE, META_CACHE: META_CACHE, VERSION_PREFIX: VERSION_PREFIX,
		KEEP: KEEP, MAX_AGE_MS: MAX_AGE_MS, normalizeCookieUser: normalizeCookieUser, provenFresh: provenFresh, stamp: stamp,
		TIMEOUT_MS: TIMEOUT_MS, USER_HEADER: USER_HEADER, OFFLINE_URL: OFFLINE_URL,
		cacheKey: cacheKey, isBriefApi: isBriefApi, isShellNavigation: isShellNavigation, isSwScript: isSwScript,
		isNeverCache: isNeverCache, sanitizeUser: sanitizeUser, userCacheName: userCacheName, keysToTrim: keysToTrim,
		staleCacheNames: staleCacheNames, briefCacheNames: briefCacheNames, decorateHeaders: decorateHeaders,
		isLoggedOutShell: isLoggedOutShell, shouldCacheShell: shouldCacheShell, storable: storable, isAudio: isAudio,
		offlineJson: offlineJson, wipeAll: wipeAll, getUser: getUser, setUser: setUser, briefFetch: briefFetch,
		shellFetch: shellFetch, assetFetch: assetFetch, distUrls: distUrls, install: install, activate: activate,
		onMessage: onMessage, route: route
	};
	globalThis.__briefSwHelpers = helpers;

	if (typeof self === "undefined" || typeof self.addEventListener !== "function" || typeof caches === "undefined") {
		return;
	}

	function notifyClients(msg) {
		return self.clients.matchAll({ includeUncontrolled: true }).then(function (list) {
			list.forEach(function (c) { c.postMessage(msg); });
		});
	}
	function liveDeps(event) {
		return {
			caches: caches,
			fetch: function (r) { return fetch(r); },
			timeoutMs: TIMEOUT_MS,
			cookieUser: function () {
				if (!self.cookieStore || typeof self.cookieStore.get !== "function") { return ""; }
				return self.cookieStore.get("user_id").then(function (c) { return c ? c.value : ""; }, function () { return ""; });
			},
			notify: function (m) { event.waitUntil(notifyClients(m)); }
		};
	}

	self.addEventListener("install", function (event) {
		event.waitUntil(install({ caches: caches, fetch: function (r) { return fetch(r, { cache: "no-cache" }); } }));
	});

	self.addEventListener("activate", function (event) {
		event.waitUntil(activate({ caches: caches }).then(function () { return self.clients.claim(); }));
	});

	self.addEventListener("message", function (event) {
		if (event.origin && event.origin !== self.location.origin) { return; }
		var data = event.data || {};
		if (data.type === "SKIP_WAITING") { self.skipWaiting(); return; }
		event.waitUntil(onMessage(data, liveDeps(event)));
	});

	self.addEventListener("fetch", function (event) {
		var r = route(event.request, self.location.origin);
		if (r === "brief") { event.respondWith(briefFetch(event.request, liveDeps(event))); }
		else if (r === "shell") { event.respondWith(shellFetch(event.request, liveDeps(event))); }
		else if (r === "asset") { event.respondWith(assetFetch(event.request, liveDeps(event))); }
	});
})();

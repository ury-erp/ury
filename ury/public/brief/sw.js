/* URY Chairman Brief service worker. Scope /ury/brief/. */
/* eslint-disable no-restricted-globals */
(function () {
	"use strict";

	var CACHE_PREFIX = "ury-brief-";
	var CACHE_NAME = "ury-brief-v1";
	var SCOPE_PREFIX = "/ury/brief";
	var OFFLINE_URL = "/assets/ury/brief/offline.html";
	var KEEP = 7;
	var BRIEF_API = "/api/method/ury.ury.api.chairman.get_brief";
	var PRECACHE = [
		OFFLINE_URL,
		"/assets/ury/brief/manifest.webmanifest",
		"/assets/ury/brief/icons/icon-192.png",
		"/assets/ury/brief/icons/icon-512.png",
		"/assets/ury/brief/icons/icon-192-maskable.png",
		"/assets/ury/brief/icons/icon-512-maskable.png",
		"/assets/ury/brief/icons/apple-touch-icon.png"
	];

	/* ---- pure helpers (also exposed for node tests) ---- */

	/** Cache key = full URL (path + query), hash dropped. */
	function cacheKey(url) {
		var u = new URL(url, "https://x.invalid");
		return u.pathname + u.search;
	}

	function isBriefApi(pathname) {
		return pathname === BRIEF_API;
	}

	function isShellNavigation(pathname) {
		return pathname === SCOPE_PREFIX || pathname.indexOf(SCOPE_PREFIX + "/") === 0;
	}

	function isSwScript(pathname) {
		return pathname === SCOPE_PREFIX + "/sw.js" || /brief-sw\.js$/.test(pathname);
	}

	/** Keep the newest n items of a key list (oldest first in input); returns keys to delete. */
	function keysToTrim(keys, n) {
		return keys.length > n ? keys.slice(0, keys.length - n) : [];
	}

	function staleCacheNames(names, current) {
		return names.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== current; });
	}

	/** Returns new Headers copy with X-Brief-Source set. */
	function decorateHeaders(headers, source) {
		var out = new Headers(headers);
		out.set("X-Brief-Source", source);
		return out;
	}

	function decorate(response, source) {
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: decorateHeaders(response.headers, source)
		});
	}

	var helpers = {
		CACHE_NAME: CACHE_NAME, KEEP: KEEP, cacheKey: cacheKey, isBriefApi: isBriefApi,
		isShellNavigation: isShellNavigation, isSwScript: isSwScript, keysToTrim: keysToTrim,
		staleCacheNames: staleCacheNames, decorateHeaders: decorateHeaders
	};
	globalThis.__briefSwHelpers = helpers;

	if (typeof self === "undefined" || typeof self.addEventListener !== "function" || typeof caches === "undefined") {
		return;
	}

	function trim(cache) {
		return cache.keys().then(function (reqs) {
			var briefs = reqs.filter(function (r) { return isBriefApi(new URL(r.url).pathname); });
			return Promise.all(keysToTrim(briefs, KEEP).map(function (r) { return cache.delete(r); }));
		});
	}

	function store(cache, key, response) {
		/* delete first so re-put moves the entry to newest position */
		return cache.delete(key).then(function () { return cache.put(key, response); }).then(function () { return trim(cache); });
	}

	function briefRequest(event) {
		var request = event.request;
		var key = cacheKey(request.url);
		return caches.open(CACHE_NAME).then(function (cache) {
			return cache.match(key).then(function (cached) {
				var network = fetch(request).then(function (res) {
					if (res.ok) {
						return store(cache, key, res.clone()).then(function () { return res; });
					}
					return res;
				});
				if (cached) {
					/* stale-while-revalidate: refresh in background, answer from cache */
					event.waitUntil(network.catch(function () {}));
					return decorate(cached, "cache");
				}
				return network.then(function (res) { return decorate(res, "network"); }).catch(function () {
					return caches.match(OFFLINE_URL).then(function (o) { return o || Response.error(); });
				});
			});
		});
	}

	self.addEventListener("install", function (event) {
		event.waitUntil(
			caches.open(CACHE_NAME).then(function (cache) {
				return Promise.all(PRECACHE.map(function (u) { return cache.add(u).catch(function () {}); }));
			})
		);
	});

	self.addEventListener("activate", function (event) {
		event.waitUntil(
			caches.keys()
				.then(function (keys) { return Promise.all(staleCacheNames(keys, CACHE_NAME).map(function (k) { return caches.delete(k); })); })
				.then(function () { return self.clients.claim(); })
		);
	});

	self.addEventListener("message", function (event) {
		var data = event.data || {};
		if (data.type === "SKIP_WAITING") {
			self.skipWaiting();
		} else if (data.type === "LOGOUT") {
			event.waitUntil(
				caches.keys().then(function (keys) {
					return Promise.all(keys.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0; }).map(function (k) { return caches.delete(k); }));
				})
			);
		}
	});

	self.addEventListener("fetch", function (event) {
		var request = event.request;
		if (request.method !== "GET") { return; }
		var url = new URL(request.url);
		if (url.origin !== self.location.origin) { return; }
		if (isSwScript(url.pathname)) { return; }

		if (isBriefApi(url.pathname)) {
			event.respondWith(briefRequest(event));
			return;
		}
		if (url.pathname.indexOf("/api/") === 0) { return; }

		/* Shell page: cache-first, refreshed in background. Page is no_cache server-side but we keep a copy for offline. */
		if (isShellNavigation(url.pathname) && request.mode === "navigate") {
			event.respondWith(
				caches.open(CACHE_NAME).then(function (cache) {
					return cache.match("/ury/brief").then(function (cached) {
						var net = fetch(request).then(function (res) {
							/* only cache a real 200 page (not a login redirect result) */
							if (res.ok && !res.redirected && url.pathname.replace(/\/$/, "") === SCOPE_PREFIX) {
								cache.put("/ury/brief", res.clone());
							}
							return res;
						});
						if (cached) {
							event.waitUntil(net.catch(function () {}));
							return cached;
						}
						return net.catch(function () {
							return caches.match(OFFLINE_URL).then(function (o) { return o || Response.error(); });
						});
					});
				})
			);
			return;
		}

		if (url.pathname.indexOf("/assets/ury/brief/") === 0) {
			event.respondWith(
				caches.match(request).then(function (cached) {
					return cached || fetch(request).then(function (res) {
						if (res.ok) {
							var copy = res.clone();
							caches.open(CACHE_NAME).then(function (c) { c.put(request, copy); });
						}
						return res;
					});
				})
			);
		}
	});
})();

/* URY Chairman Brief service worker. Scope /ury/brief/. */
/* eslint-disable no-restricted-globals */
(function () {
	"use strict";

	var CACHE_PREFIX = "ury-brief-";
	var CACHE_NAME = CACHE_PREFIX + "__BUILD_VERSION__";
	var SCOPE_PREFIX = "/ury/brief";
	var SHELL_KEY = "/ury/brief";
	var OFFLINE_URL = "/assets/ury/brief/offline.html";
	var KEEP = 7;
	var TIMEOUT_MS = 6000;
	var BRIEF_API = "/api/method/ury.ury.api.chairman.get_brief";
	var ICONS = [
		"/assets/ury/brief/manifest.webmanifest",
		"/assets/ury/brief/icons/icon-192.png",
		"/assets/ury/brief/icons/icon-512.png",
		"/assets/ury/brief/icons/icon-192-maskable.png",
		"/assets/ury/brief/icons/icon-512-maskable.png",
		"/assets/ury/brief/icons/apple-touch-icon.png"
	];

	/* ---- pure helpers (also exposed for node tests) ---- */

	function cacheKey(url) {
		var u = new URL(url, "https://x.invalid");
		return u.pathname + u.search;
	}
	function isBriefApi(pathname) { return pathname === BRIEF_API; }
	function isShellNavigation(pathname) {
		return pathname === SCOPE_PREFIX || pathname.indexOf(SCOPE_PREFIX + "/") === 0;
	}
	function isSwScript(pathname) {
		return pathname === SCOPE_PREFIX + "/sw.js" || /brief-sw\.js$/.test(pathname);
	}
	function keysToTrim(keys, n) {
		return keys.length > n ? keys.slice(0, keys.length - n) : [];
	}
	function staleCacheNames(names, current) {
		return names.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== current; });
	}
	function briefCacheNames(names) {
		return names.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0; });
	}
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
	function isAuthStatus(status) { return status === 401 || status === 403; }
	function pathOf(url) {
		try { return new URL(url, "https://x.invalid").pathname; } catch (e) { return ""; }
	}
	/** True when a shell response means the user is logged out. */
	function isLoggedOutShell(res) {
		if (isAuthStatus(res.status) || res.type === "opaqueredirect") { return true; }
		return pathOf(res.url).indexOf("/login") === 0;
	}
	/** True when a shell response is safe to store. */
	function shouldCacheShell(res) {
		return !!res.ok && !res.redirected && res.type !== "opaqueredirect" &&
			pathOf(res.url).replace(/\/$/, "") === SCOPE_PREFIX;
	}
	function offlineJson() {
		return new Response(JSON.stringify({ offline: true }), {
			status: 503,
			headers: { "Content-Type": "application/json", "X-Brief-Source": "offline" }
		});
	}
	function withTimeout(promise, ms) {
		return new Promise(function (resolve, reject) {
			var t = setTimeout(function () { reject(new Error("timeout")); }, ms);
			promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
		});
	}

	/* ---- effectful logic, dependencies injected: deps = {caches, fetch, notify, timeoutMs} ---- */

	function wipeAll(deps) {
		return deps.caches.keys().then(function (keys) {
			return Promise.all(briefCacheNames(keys).map(function (k) { return deps.caches.delete(k); }));
		});
	}

	function trim(cache) {
		return cache.keys().then(function (reqs) {
			var briefs = reqs.filter(function (r) { return isBriefApi(pathOf(r.url)); });
			return Promise.all(keysToTrim(briefs, KEEP).map(function (r) { return cache.delete(r); }));
		});
	}

	function store(cache, key, response) {
		return cache.delete(key).then(function () { return cache.put(key, response); }).then(function () { return trim(cache); });
	}

	function briefFetch(request, deps) {
		var key = cacheKey(request.url);
		var ms = deps.timeoutMs || TIMEOUT_MS;
		return deps.caches.open(CACHE_NAME).then(function (cache) {
			function fallback() {
				return cache.match(key).then(function (cached) {
					return cached ? decorate(cached, "cache") : offlineJson();
				});
			}
			return cache.match(key).then(function (cached) {
				var net = deps.fetch(request);
				/* timeout only matters if there is something to fall back to */
				return (cached ? withTimeout(net, ms) : net).then(function (res) {
					if (isAuthStatus(res.status)) {
						return cache.delete(key)
							.then(function () { return wipeAll(deps); })
							.then(function () { deps.notify({ type: "AUTH_LOST" }); return decorate(res, "network"); });
					}
					if (res.ok) {
						return store(cache, key, res.clone()).then(function () { return decorate(res, "network"); });
					}
					return cached ? fallback() : decorate(res, "network");
				}, function () { return fallback(); });
			});
		});
	}

	function shellFetch(request, deps) {
		return deps.fetch(request).then(function (res) {
			if (isLoggedOutShell(res)) {
				return wipeAll(deps).then(function () { return res; });
			}
			if (shouldCacheShell(res)) {
				return deps.caches.open(CACHE_NAME).then(function (cache) {
					return cache.put(SHELL_KEY, res.clone());
				}).then(function () { return res; }, function () { return res; });
			}
			return res;
		}, function () {
			return deps.caches.open(CACHE_NAME).then(function (cache) {
				return cache.match(SHELL_KEY);
			}).then(function (cached) {
				if (cached) { return cached; }
				return deps.caches.match(OFFLINE_URL).then(function (o) { return o || Response.error(); });
			});
		});
	}

	function install(deps) {
		return deps.caches.open(CACHE_NAME).then(function (cache) {
			/* offline page is required: no catch, install fails if missing */
			return cache.add(OFFLINE_URL).then(function () {
				return Promise.all(ICONS.map(function (u) { return cache.add(u).catch(function () {}); }));
			});
		});
	}

	function activate(deps) {
		return deps.caches.keys().then(function (keys) {
			return Promise.all(staleCacheNames(keys, CACHE_NAME).map(function (k) { return deps.caches.delete(k); }));
		});
	}

	var helpers = {
		CACHE_NAME: CACHE_NAME, CACHE_PREFIX: CACHE_PREFIX, KEEP: KEEP, TIMEOUT_MS: TIMEOUT_MS,
		cacheKey: cacheKey, isBriefApi: isBriefApi, isShellNavigation: isShellNavigation,
		isSwScript: isSwScript, keysToTrim: keysToTrim, staleCacheNames: staleCacheNames,
		briefCacheNames: briefCacheNames, decorateHeaders: decorateHeaders, isLoggedOutShell: isLoggedOutShell,
		shouldCacheShell: shouldCacheShell, offlineJson: offlineJson, wipeAll: wipeAll,
		briefFetch: briefFetch, shellFetch: shellFetch, install: install, activate: activate
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
			notify: function (m) { event.waitUntil(notifyClients(m)); }
		};
	}

	self.addEventListener("install", function (event) {
		event.waitUntil(install({ caches: caches }));
	});

	self.addEventListener("activate", function (event) {
		event.waitUntil(activate({ caches: caches }).then(function () { return self.clients.claim(); }));
	});

	self.addEventListener("message", function (event) {
		var data = event.data || {};
		if (data.type === "SKIP_WAITING") {
			self.skipWaiting();
		} else if (data.type === "LOGOUT") {
			event.waitUntil(wipeAll({ caches: caches }).then(function () { return notifyClients({ type: "LOGOUT_DONE" }); }));
		}
	});

	self.addEventListener("fetch", function (event) {
		var request = event.request;
		if (request.method !== "GET") { return; }
		var url = new URL(request.url);
		if (url.origin !== self.location.origin) { return; }
		if (isSwScript(url.pathname)) { return; }

		if (isBriefApi(url.pathname)) {
			event.respondWith(briefFetch(request, liveDeps(event)));
			return;
		}
		if (url.pathname.indexOf("/api/") === 0) { return; }

		if (isShellNavigation(url.pathname) && request.mode === "navigate") {
			event.respondWith(shellFetch(request, liveDeps(event)));
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

/* URY Serve staff PWA service worker.
 *
 * Scope: /ury/serve/ only (registered at /ury/serve/sw.js).
 * Does not control /pos, /ury (management), or /ury/order.
 *
 * Never caches:
 *  - /api/* (authenticated business data)
 *  - CSRF-bearing HTML documents under /ury/serve
 *  - customer / order payloads
 *  - this worker script itself
 *
 * Offline: show a "connection required" screen. No order replay queue.
 *
 * Cache isolation: only create/delete names under the "ury-serve-" prefix so
 * POS / self-order / management caches on the same origin are preserved.
 */
/* eslint-disable no-restricted-globals */

const CACHE_PREFIX = "ury-serve-";
const CACHE_NAME = "ury-serve-shell-v1";
const SCOPE_PREFIX = "/ury/serve";
const OFFLINE_URL = "/assets/ury/serve/offline.html";

const PRECACHE_URLS = [
	OFFLINE_URL,
	"/assets/ury/serve/manifest.webmanifest",
	"/assets/ury/serve/icons/icon-192.png",
	"/assets/ury/serve/icons/icon-512.png",
	"/assets/ury/serve/icons/icon-192-maskable.png",
	"/assets/ury/serve/icons/icon-512-maskable.png",
];

/** Stale Serve caches only — never touch other apps' Cache Storage keys. */
function staleServeCacheNames(keys, currentName) {
	return keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== currentName);
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) =>
				Promise.all(
					PRECACHE_URLS.map((url) =>
						cache.add(url).catch(() => {
							/* Asset may not exist until first frontend build; ignore. */
						})
					)
				)
			)
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(staleServeCacheNames(keys, CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

function isServeNavigation(url) {
	return url.pathname === SCOPE_PREFIX || url.pathname.startsWith(SCOPE_PREFIX + "/");
}

function isServeStaticAsset(url) {
	return url.pathname.startsWith("/assets/ury/serve/");
}

function isApiRequest(url) {
	return url.pathname.startsWith("/api/");
}

function isServiceWorkerScript(url) {
	return url.pathname === SCOPE_PREFIX + "/sw.js" || url.pathname.endsWith("/serve-sw.js");
}

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") {
		return;
	}

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) {
		return;
	}

	/* Never intercept authenticated API — network only, no cache. */
	if (isApiRequest(url)) {
		return;
	}

	/* Never intercept/cache the worker script (avoid offline HTML fallback). */
	if (isServiceWorkerScript(url)) {
		return;
	}

	/* Navigations under /ury/serve: network-only, offline fallback (no replay). */
	if (request.mode === "navigate" && isServeNavigation(url)) {
		event.respondWith(
			fetch(request)
				.then((response) => response)
				.catch(() => caches.match(OFFLINE_URL).then((cached) => cached || Response.error()))
		);
		return;
	}

	/* Do not cache CSRF HTML documents even if fetched as non-navigate. */
	if (isServeNavigation(url) && (url.pathname === SCOPE_PREFIX || url.pathname === SCOPE_PREFIX + "/")) {
		return;
	}

	/* Shell static assets from the Vite build output. */
	if (isServeStaticAsset(url)) {
		event.respondWith(
			caches.match(request).then((cached) => {
				if (cached) {
					return cached;
				}
				return fetch(request).then((response) => {
					if (!response.ok) {
						return response;
					}
					const contentType = response.headers.get("content-type") || "";
					/* Skip anything that looks like HTML with session/csrf. */
					if (contentType.includes("text/html")) {
						return response;
					}
					const copy = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
					return response;
				});
			})
		);
	}
});

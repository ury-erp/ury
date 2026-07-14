/**
 * URY Restaurant POS — Service Worker
 * Sprint 5 / Task 4.1
 *
 * Scope:    /urypos/  (set at registration time in main.js)
 * Location: urypos/public/ury-sw.js
 *           → Vite copies public/ verbatim to ury/public/urypos/
 *           → served at /urypos/ury-sw.js
 *
 * Strategy:
 *   - Cache-first  : Vite-built JS/CSS/image assets (hashed filenames)
 *   - Network-first: all /api/ calls; fall back to cache when offline
 *   - On reconnect : broadcast URY_SYNC_FLUSH to all open tabs so
 *                    the Offline Pinia store drains its pending queue
 */

const SW_VERSION = 'ury-pos-v1';

/**
 * Vite asset extensions that are safe to cache aggressively.
 * Hashed filenames mean stale-while-revalidate is fine but
 * cache-first is simpler and sufficient here.
 */
const CACHEABLE_EXTENSIONS = ['.js', '.css', '.woff2', '.woff', '.ttf', '.png', '.jpg', '.svg', '.ico'];

/**
 * URL patterns that must always go to the network first.
 * The Frappe API, websocket endpoint, and print endpoints
 * must never be served stale.
 */
const NETWORK_FIRST_PATTERNS = [
  /\/api\/method\//,
  /\/api\/resource\//,
  /\/socket\.io\//,
  /\/printview/,
  /\/private\//,
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Skip waiting so the new SW activates immediately without waiting
  // for all tabs running the old version to close.
  self.skipWaiting();
  // Nothing to pre-cache: Vite assets have hashed names and will be
  // cached on first fetch. Pre-caching would require knowing hashes
  // at build time — use vite-plugin-pwa for that in a future sprint.
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SW_VERSION)
          .map((k) => {
            console.log('[URY SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests. POST/PATCH writes go through the
  // Offline queue in OfflineDB.js and reach the server directly
  // when online (or are queued when offline).
  if (request.method !== 'GET') return;

  // Let the browser handle chrome-extension and non-http schemes.
  if (!request.url.startsWith('http')) return;

  const isNetworkFirst = NETWORK_FIRST_PATTERNS.some((re) => re.test(request.url));

  if (isNetworkFirst) {
    event.respondWith(networkFirst(request));
  } else if (isCacheable(request.url)) {
    event.respondWith(cacheFirst(request));
  }
  // All other requests (navigation, non-cacheable) fall through to
  // the browser's default fetch behaviour.
});

function isCacheable(url) {
  return CACHEABLE_EXTENSIONS.some((ext) => url.includes(ext));
}

/**
 * Network-first: try the network; on failure return cached copy or a
 * minimal offline JSON stub so the Vue app can handle the error gracefully.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Opportunistically update the cache for this API response
      // so it's available if the user goes offline mid-session.
      const cache = await caches.open(SW_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Return a structured offline stub so frappe.call() error handlers
    // in the Vue stores receive a parseable response rather than a
    // network exception.
    return new Response(
      JSON.stringify({
        exc_type: 'OfflineError',
        _error_message: 'Device is offline',
        _server_messages: JSON.stringify([
          JSON.stringify({ message: 'Device is offline — changes will sync when reconnected.' })
        ]),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Cache-first: serve from cache if available, otherwise fetch and cache.
 * Used for Vite-hashed JS/CSS/font/image assets.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SW_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Static asset unavailable offline — nothing sensible to return.
    return new Response('Offline', { status: 503 });
  }
}

// ─── Background Sync ──────────────────────────────────────────────────────────

/**
 * The Background Sync API fires this event when the browser regains
 * connectivity (even if the tab was in the background).
 * We broadcast to all open clients so their Offline Pinia stores
 * call flush() and drain any pending sync_order payloads.
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'ury-pos-sync') {
    event.waitUntil(broadcastFlush());
  }
});

// ─── Message bus ──────────────────────────────────────────────────────────────

/**
 * The Vue app posts URY_ONLINE when window.addEventListener('online')
 * fires on a visible tab, giving us a second flush trigger path for
 * browsers that don't support Background Sync.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'URY_ONLINE') {
    broadcastFlush();
  }
});

async function broadcastFlush() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
  clients.forEach((client) => {
    client.postMessage({ type: 'URY_SYNC_FLUSH' });
  });
}

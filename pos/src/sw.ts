/**
 * @file sw.ts
 * @description Workbox Service Worker for URY POS.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. NO BUSINESS LOGIC INSIDE SERVICE WORKER.
 * 2. INDEXEDDB REMAINS THE SINGLE SOURCE OF TRUTH FOR ALL TRANSACTIONAL DATA.
 * 3. NO CACHING FOR POST, PUT, OR DELETE REQUESTS.
 * 4. WORKBOX IS USED EXCLUSIVELY FOR APP SHELL, STATIC ASSETS, FONTS, IMAGES,
 *    READ-ONLY GET CACHE, AND BROADCAST UPDATES.
 *
 * ENDPOINT ALIGNMENT NOTES:
 * - All cached GET endpoints must match the actual `@frappe.whitelist()` Python
 *   function names in `ury/ury_pos/api.py` and `ury/ury/doctype/ury_order/ury_order.py`.
 * - NEVER cache POST endpoints (sync_order, make_invoice, etc.) — these must go
 *   through the IndexedDB command queue managed by SyncEngine in the app thread.
 * - `update_print_status` does NOT exist — the correct endpoint is `qz_print_update`.
 */

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BroadcastUpdatePlugin } from 'workbox-broadcast-update';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Immediately activate new service worker versions
self.skipWaiting();
clientsClaim();

// 1. App Shell Pre-caching
precacheAndRoute(self.__WB_MANIFEST || []);

// Custom Workbox plugin to fall back to a matching endpoint response in Cache Storage
// if an exact URL parameter key lookup misses during NetworkFirst error handling.
// CRITICAL: only return cached responses whose critical query parameters match the
// request, otherwise wrong-context (wrong pos_profile / room / aggregator / doctype)
// master data can poison the UI. If no safe match exists, return undefined so the
// app can fall back to IndexedDB instead.
const PARAMETERIZED_ENDPOINTS = new Set([
  'getRestaurantMenu',
  'getAggregatorItem',
  'getModeOfPayment',
  'getMenuCourses',
  'getPosProfile',
  'getBranchRoom',
  'get_list',
]);

function getEndpointName(pathname: string): string {
  const parts = pathname.split('/');
  return parts[parts.length - 1] || '';
}

function getParam(url: URL, keys: string[]): string | null {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value !== null) return value;
  }
  return null;
}

function isSafeParameterizedMatch(requestUrl: URL, candidateUrl: URL): boolean {
  const endpoint = getEndpointName(requestUrl.pathname);
  if (!PARAMETERIZED_ENDPOINTS.has(endpoint)) {
    // Unknown endpoint: keep the previous pathname-only behavior, but only if the
    // candidate carries no critical parameters that the request omits.
    const requestHasParams =
      requestUrl.searchParams.has('pos_profile') ||
      requestUrl.searchParams.has('doctype') ||
      requestUrl.searchParams.has('selectedRoom') ||
      requestUrl.searchParams.has('room') ||
      requestUrl.searchParams.has('customer') ||
      requestUrl.searchParams.has('aggregator');
    const candidateHasParams =
      candidateUrl.searchParams.has('pos_profile') ||
      candidateUrl.searchParams.has('doctype') ||
      candidateUrl.searchParams.has('selectedRoom') ||
      candidateUrl.searchParams.has('room') ||
      candidateUrl.searchParams.has('customer') ||
      candidateUrl.searchParams.has('aggregator');
    return !requestHasParams && !candidateHasParams;
  }

  const requestPosProfile = requestUrl.searchParams.get('pos_profile');
  const candidatePosProfile = candidateUrl.searchParams.get('pos_profile');
  if (requestPosProfile !== candidatePosProfile) return false;

  const requestDoctype = requestUrl.searchParams.get('doctype');
  const candidateDoctype = candidateUrl.searchParams.get('doctype');
  if (requestDoctype !== candidateDoctype) return false;

  const requestRoom = getParam(requestUrl, ['selectedRoom', 'room']);
  const candidateRoom = getParam(candidateUrl, ['selectedRoom', 'room']);
  if (requestRoom !== null && requestRoom !== candidateRoom) return false;
  if (candidateRoom !== null && requestRoom === null) return false;

  const requestCustomer = getParam(requestUrl, ['customer', 'aggregator']);
  const candidateCustomer = getParam(candidateUrl, ['customer', 'aggregator']);
  if (requestCustomer !== null && requestCustomer !== candidateCustomer) return false;
  if (candidateCustomer !== null && requestCustomer === null) return false;

  return true;
}

const masterDataFallbackPlugin = {
  handlerDidError: async ({ request }: { request: Request }) => {
    try {
      const cache = await caches.open('ury-pos-master-data-get');
      const exactMatch = await cache.match(request);
      if (exactMatch) return exactMatch;

      const requestUrl = new URL(request.url);
      const keys = await cache.keys();
      for (const key of keys) {
        const keyUrl = new URL(key.url);
        if (keyUrl.pathname !== requestUrl.pathname) continue;

        if (!isSafeParameterizedMatch(requestUrl, keyUrl)) continue;

        const response = await cache.match(key);
        if (response) {
          console.warn(
            `[SW] Parameterized master-data fallback used for ${request.url} -> ${key.url}`
          );
          const headers = new Headers(response.headers);
          headers.set('X-SW-Fallback', 'true');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        }
      }
    } catch (e) {
      console.warn('[SW] Master data fallback search error:', e);
    }
    return undefined;
  },
};

// 2. SPA Navigation Route (NetworkFirst with offline index.html fallback)
try {
  const navigationRoute = new NavigationRoute(
    new NetworkFirst({
      cacheName: 'ury-pos-navigation',
      networkTimeoutSeconds: 3,
      plugins: [
        {
          handlerDidError: async () => {
            const match = (await caches.match('/assets/ury/pos/index.html')) ||
                          (await caches.match('/index.html')) ||
                          (await caches.match('/pos')) ||
                          (await caches.match('/pos/index.html'));
            return match || new Response('<!doctype html><html><head><meta http-equiv="refresh" content="3"></head><body>Loading POS...</body></html>', {
              headers: { 'Content-Type': 'text/html' }
            });
          }
        },
        new ExpirationPlugin({
          maxEntries: 5,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
        }),
      ],
    }),
    {
      allowlist: [/^\/pos/],
      denylist: [/^\/api\//, /^\/assets\//],
    }
  );
  registerRoute(navigationRoute);
} catch (e) {
  console.warn('[SW] Navigation route registration failed:', e);
}

// 3. Static Assets (JS / CSS) -> StaleWhileRevalidate + BroadcastUpdate
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'ury-pos-static-assets',
    plugins: [
      new BroadcastUpdatePlugin({
        headersToCheck: ['content-type', 'etag', 'last-modified'],
      }),
    ],
  })
);

// 4. Fonts -> CacheFirst (30 days expiration)
registerRoute(
  ({ request }) =>
    request.destination === 'font' ||
    request.url.includes('fonts.googleapis.com') ||
    request.url.includes('fonts.gstatic.com'),
  new CacheFirst({
    cacheName: 'ury-pos-fonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
      }),
    ],
  })
);

// 5. Images -> CacheFirst (30 days expiration)
registerRoute(
  ({ request }) =>
    request.destination === 'image' ||
    /\.(?:png|gif|jpg|jpeg|webp|svg)$/i.test(request.url),
  new CacheFirst({
    cacheName: 'ury-pos-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 1500,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
      }),
    ],
  })
);

// 6. Master Data & Bootstrap GET Endpoints (NetworkFirst with 24h offline fallback)
// Includes auth, user roles, POS profile, and master menus
registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    (url.pathname.includes('/api/method/frappe.auth.get_logged_user') ||
      url.pathname.includes('/api/method/frappe.client.get_value') ||
      url.pathname.includes('/api/method/frappe.client.get') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.getRestaurantMenu') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.getModeOfPayment') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.getMenuCourses') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.getAggregator') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.getAggregatorItem') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.getPosProfile') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.getBranchRoom')),
  new NetworkFirst({
    cacheName: 'ury-pos-master-data-get',
    networkTimeoutSeconds: 3,
    plugins: [
      masterDataFallbackPlugin,
      new BroadcastUpdatePlugin(),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60, // 24 Hours offline fallback
      }),
    ],
  })
);

// 7. Generic Frappe Resource API GET lists for URY Room / URY Table
registerRoute(
  ({ request, url }) => {
    if (request.method !== 'GET') return false;
    if (!url.pathname.includes('/api/method/frappe.client.get_list')) return false;
    const doctype = url.searchParams.get('doctype');
    return doctype === 'URY Room' || doctype === 'URY Table';
  },
  new NetworkFirst({
    cacheName: 'ury-pos-master-data-get',
    networkTimeoutSeconds: 3,
    plugins: [
      masterDataFallbackPlugin,
      new BroadcastUpdatePlugin(),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 24 * 60 * 60, // 24 Hours offline fallback
      }),
    ],
  })
);



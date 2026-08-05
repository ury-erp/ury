/**
 * @file sw.ts
 * @description Workbox Service Worker for URY POS.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. NO BUSINESS LOGIC INSIDE SERVICE WORKER.
 * 2. INDEXEDDB REMAINS THE SINGLE SOURCE OF TRUTH FOR ALL TRANSACTIONAL DATA.
 * 3. NO CACHING FOR POST, PUT, OR DELETE REQUESTS.
 * 4. WORKBOX IS USED EXCLUSIVELY FOR APP SHELL, STATIC ASSETS, FONTS, IMAGES,
 *    READ-ONLY GET CACHE, BACKGROUND SYNC PINGS, AND BROADCAST UPDATES.
 */

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BroadcastUpdatePlugin } from 'workbox-broadcast-update';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Immediately activate new service worker versions
self.skipWaiting();
clientsClaim();

// 1. App Shell Pre-caching
precacheAndRoute(self.__WB_MANIFEST || []);

// 2. SPA Navigation Route (Fallback to index.html for client-side routing)
try {
  const handler = createHandlerBoundToURL('/index.html');
  const navigationRoute = new NavigationRoute(handler, {
    denylist: [/^\/api\//, /^\/assets\//],
  });
  registerRoute(navigationRoute);
} catch (e) {
  // Navigation fallback fallback handling
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
  ({ request }) => request.destination === 'font' || request.url.includes('fonts.googleapis.com') || request.url.includes('fonts.gstatic.com'),
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
  ({ request }) => request.destination === 'image' || /\.(?:png|gif|jpg|jpeg|webp|svg)$/i.test(request.url),
  new CacheFirst({
    cacheName: 'ury-pos-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
      }),
    ],
  })
);

// 6. GET Cache (Read-only Master Data Endpoints ONLY)
// ONLY GET requests. Never cache POST, PUT, or DELETE.
registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    (url.pathname.includes('/api/method/ury.ury_pos.api.getRestaurantMenu') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.get_table_list') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.get_customer_list') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.get_payment_methods') ||
      url.pathname.includes('/api/method/ury.ury_pos.api.getAggregatorItem')),
  new NetworkFirst({
    cacheName: 'ury-pos-master-data-get',
    networkTimeoutSeconds: 3,
    plugins: [
      new BroadcastUpdatePlugin(),
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 24 * 60 * 60, // 24 Hours fallback
      }),
    ],
  })
);

// 7. Background Sync Plugin for Health Check Ping
const bgSyncPlugin = new BackgroundSyncPlugin('ury-pos-ping-queue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
});

registerRoute(
  ({ url }) => url.pathname.includes('/api/method/ury.ury_pos.api.ping'),
  new NetworkFirst({
    plugins: [bgSyncPlugin],
  })
);

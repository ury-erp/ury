/**
 * Service Worker registration for URY POS PWA.
 *
 * Provides:
 * - Offline caching of app shell (HTML, CSS, JS)
 * - Cache-first strategy for static assets
 * - Network-first strategy for API calls
 * - Automatic cache cleanup on new version deployment
 */

const STATIC_CACHE = 'ury-pos-static-v1';
const API_CACHE = 'ury-pos-api-v1';

// Static assets to cache on install (app shell)
const APP_SHELL = [
  '/pos/',
  '/pos/index.html',
];

// Install event — cache the app shell
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  // Activate immediately without waiting
  self.skipWaiting();
});

// Activate event — clean up old caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event — serve from cache or network
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls: network-first strategy
  if (url.pathname.includes('/api/') || url.pathname.includes('ury.')) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cache.match(request))
      )
    );
    return;
  }

  // Static assets: cache-first strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const responseToCache = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      });
    })
  );
});

// Type declarations for Service Worker
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEvent extends Event {
  request: Request;
  respondWith(promise: Promise<Response>): void;
}

declare const self: ServiceWorkerGlobalScope;

export {};

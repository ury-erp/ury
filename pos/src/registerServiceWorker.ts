/**
 * @file registerServiceWorker.ts
 * @description Registers the URY POS Workbox Service Worker.
 *
 * The service worker is built from src/sw.ts by vite-plugin-pwa (injectManifest)
 * and emitted to /assets/ury/pos/sw.js. It handles app shell precaching, static
 * assets, fonts/images, and read-only master-data GET caching. All mutations
 * bypass the SW and are queued by @ury/core's SyncEngine.
 *
 * Scope handling:
 * - The POS app is served from /pos but assets live under /assets/ury/pos/.
 * - To control the /pos page we register with scope '/'.
 * - This requires the server to send 'Service-Worker-Allowed: /' for the SW
 *   script (the URY backend hook does this in development; production nginx
 *   should add the same header for /assets/ury/pos/sw.js).
 * - If the wide scope is rejected, we fall back to the default scope
 *   (/assets/ury/pos/) so caching still works for direct asset requests.
 */

import { Workbox } from 'workbox-window';

const isProduction = import.meta.env.PROD;
const swPath = `${import.meta.env.BASE_URL}sw.js`;

async function doRegister(scope?: string): Promise<ServiceWorkerRegistration> {
  const wb = new Workbox(swPath, { scope });

  wb.addEventListener('installed', event => {
    if (event.isUpdate) {
      console.log('[Workbox SW] New version installed. Reloading page...');
      window.location.reload();
    } else {
      console.log('[Workbox SW] Service worker installed for the first time.');
    }
  });

  wb.addEventListener('activated', () => {
    console.log('[Workbox SW] Service worker activated.');
  });

  wb.addEventListener('waiting', () => {
    console.log('[Workbox SW] New service worker waiting.');
  });

  return wb.register();
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    console.log('[Workbox SW] Service workers not supported in this environment.');
    return;
  }

  if (!isProduction) {
    console.log('[Workbox SW] Skipping registration in development mode.');
    return;
  }

  // Attempt the widest scope first so /pos is controlled. If the server does
  // not allow it (missing Service-Worker-Allowed header), fall back to the
  // default scope determined by the SW script location.
  doRegister('/')
    .then(reg => {
      console.log('[Workbox SW] Registered with scope:', reg.scope);
    })
    .catch(err => {
      console.warn('[Workbox SW] Wide-scope registration failed, falling back:', err);
      doRegister()
        .then(reg => {
          console.log('[Workbox SW] Registered with default scope:', reg.scope);
        })
        .catch(fallbackErr => {
          console.error('[Workbox SW] Service worker registration failed:', fallbackErr);
        });
    });
}

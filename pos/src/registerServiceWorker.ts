/**
 * @file registerServiceWorker.ts
 * @description Registers the URY POS Workbox Service Worker.
 */

import { Workbox } from 'workbox-window';

const swPath = '/api/method/ury.utils.get_service_worker';

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

/**
 * @file registerServiceWorker.ts
 * @description Registers Workbox Service Worker in browser environment.
 */

import { Workbox } from 'workbox-window';

export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    const wb = new Workbox('/assets/ury/pos/sw.js');

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

    wb.register().catch(err => {
      console.error('[Workbox SW] Service worker registration failed:', err);
    });
  }
}

/**
 * Service Worker registration utility for URY POS.
 *
 * Registers the service worker in production mode and handles
 * updates gracefully by notifying the user.
 */

import { logger } from './logger';

export function registerServiceWorker(): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/pos/sw.js', {
          scope: '/pos/',
        });

        logger.info('Service Worker registered successfully');

        // Check for updates periodically (every 30 minutes)
        setInterval(() => {
          registration.update();
        }, 30 * 60 * 1000);

        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              logger.info('New Service Worker activated — app updated');
            }
          });
        });
      } catch (error) {
        logger.warn('Service Worker registration failed:', error);
      }
    });
  }
}

/**
 * Unregister the service worker (useful for debugging).
 */
export async function unregisterServiceWorker(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    logger.info('Service Worker unregistered');
  }
}

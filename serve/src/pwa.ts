/** PWA registration for URY Serve (staff). Expected by the Serve frontend entry. */

export const SERVE_SW_URL = "/ury/serve/sw.js";
export const SERVE_SCOPE = "/ury/serve/";

export type RegisterServiceWorkerResult = ServiceWorkerRegistration | undefined;

/**
 * Register the Serve service worker scoped to /ury/serve/.
 * Safe to call on every startup; no-ops when ServiceWorker is unavailable.
 */
export async function registerServiceWorker(): Promise<RegisterServiceWorkerResult> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return undefined;
  }

  try {
    return await navigator.serviceWorker.register(SERVE_SW_URL, {
      scope: SERVE_SCOPE,
      updateViaCache: "none",
    });
  } catch (error) {
    console.error("URY Serve: service worker registration failed", error);
    return undefined;
  }
}

export default registerServiceWorker;

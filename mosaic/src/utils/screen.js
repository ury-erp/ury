/**
 * Keeping a kitchen display awake and full-screen.
 *
 * A KDS is a wall-mounted screen nobody touches for hours, so the OS dims and
 * then sleeps it — and a sleeping screen means missed tickets. The Screen Wake
 * Lock API prevents that, but it is released automatically whenever the tab is
 * hidden (tab switch, screen lock, another app), so it has to be re-acquired
 * on `visibilitychange` or it silently stops working after the first switch.
 *
 * Both APIs are unevenly supported; every entry point degrades to a no-op
 * rather than throwing, and `supported` lets the UI hide controls that would
 * do nothing.
 */

let sentinel = null;
let wanted = false;
let listening = false;

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export const fullscreenSupported =
  typeof document !== 'undefined' &&
  !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

async function acquire() {
  if (!wakeLockSupported || !wanted || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    // The browser drops the lock on its own terms; forget the stale sentinel
    // so the next re-acquire is not skipped by the `sentinel` guard above.
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Denied (often: not a user gesture, or the device is on low battery).
    sentinel = null;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') acquire();
}

/** Requests the wake lock and keeps re-requesting it after tab switches. */
export async function enableWakeLock() {
  wanted = true;
  if (!listening) {
    document.addEventListener('visibilitychange', onVisibilityChange);
    listening = true;
  }
  await acquire();
  return !!sentinel;
}

export async function disableWakeLock() {
  wanted = false;
  if (listening) {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    listening = false;
  }
  if (sentinel) {
    try {
      await sentinel.release();
    } catch {
      /* Already released by the browser. */
    }
    sentinel = null;
  }
}

export function wakeLockActive() {
  return !!sentinel;
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/** Toggles full-screen. Must be called from a user gesture to be allowed. */
export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
      return false;
    }
    const el = document.documentElement;
    await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    return true;
  } catch {
    return isFullscreen();
  }
}

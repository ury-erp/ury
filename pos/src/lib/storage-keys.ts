/**
 * Which browser-storage keys the POS may throw away, and which it may not.
 *
 * "Clear cache" used to call `localStorage.clear()`. That key space also
 * holds `posOrderTabsData` — the open order tabs and their unsent lines — so
 * the maintenance button a cashier reaches for when a screen looks stale
 * deleted the work in front of them (UX-04).
 *
 * The split is declared here, as an explicit delete-list rather than a
 * preserve-list. A key nobody classified then survives a cache clear, which
 * is the harmless failure: the button does slightly less than it could.
 * Under a preserve-list the same oversight destroys data.
 *
 * When you add a persisted key, add it below if it is re-fetchable. If it
 * holds anything a user typed, leave it out and say so here.
 */

/** Re-fetched from the server on demand. Safe to drop at any time. */
export const CACHE_STORAGE_KEYS = [
  'posProfile',
  'pos_profile',
  'menuCategories',
  'customerGroups',
  'territories',
  'payment_modes',
] as const;

/**
 * Not cache. Listed only so the distinction is written down somewhere:
 * - `posOrderTabsData` — open order tabs and their unsent lines.
 * - `ury_language`     — the user's chosen language.
 */
export const PROTECTED_STORAGE_KEYS = ['posOrderTabsData', 'ury_language'] as const;

/**
 * Drops the re-fetchable entries and leaves everything else alone.
 *
 * Each removal is guarded: a browser in private mode, or with site data
 * blocked, throws on access, and a maintenance action must not become the
 * thing that breaks the screen.
 */
export function clearCachedStorage(): void {
  for (const key of CACHE_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // Storage unavailable — nothing cached to clear either.
    }
  }
}

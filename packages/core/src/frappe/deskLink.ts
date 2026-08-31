/**
 * Cross-app navigation helpers for "escaping" from one of URY's SPAs
 * (`/ury`, `/pos`, `/mosaic`, `/urypos`, `/order`) into the Frappe desk and
 * getting back again.
 *
 * The mechanism has two halves:
 *
 *  1. **This module (SPA side).** `buildDeskUrl()` produces a desk URL that
 *     carries a `ury_return_to` (path) + `ury_return_label` (human name of the
 *     originating app) query pair describing where the user came from.
 *
 *  2. **`ury/public/js/return_to_app.js` (desk side).** Loaded globally on the
 *     desk via `app_include_js`. On page load it reads those params, stashes
 *     them in `sessionStorage` (because Frappe's desk router rewrites
 *     `location.search` as the user navigates, so the params only survive the
 *     very first paint) and renders a small floating "Back to <App>" chip.
 *
 * The params are read exactly once, immediately, by the desk script — so it
 * does not matter that Frappe's router discards them afterwards.
 *
 * This is UX plumbing only. It is never a permission boundary: the desk
 * enforces document permissions itself, and `buildDeskUrl` will happily build
 * a URL for a document the user cannot open. Gate the *visibility* of any link
 * on a real server-side permission check (see the frontend `DeskLink`
 * component / `ury.ury.api.ury_desk_link.get_desk_permissions`).
 */

/** Query param carrying the path to return to, e.g. `/ury/wastage`. */
export const DESK_RETURN_PARAM = 'ury_return_to';

/** Query param carrying the display name of the originating app. */
export const DESK_RETURN_LABEL_PARAM = 'ury_return_label';

/**
 * Path prefixes that a `ury_return_to` value is allowed to point at.
 *
 * Both this module and `return_to_app.js` enforce this list. It exists to keep
 * the return value from becoming an open-redirect: the desk script turns the
 * value into an `href`, so an unvalidated value (`//evil.example`,
 * `javascript:...`, an absolute URL) would be a real vulnerability. Keep the
 * two copies in sync.
 */
export const RETURN_TO_ALLOWED_PREFIXES = ['/ury', '/pos', '/mosaic', '/urypos', '/order'];

/** Human-readable app names, longest prefix first so `/ury/order` beats `/ury`. */
const APP_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['/ury/order', 'Self Ordering'],
  ['/ury/pos', 'POS'],
  ['/ury', 'URY'],
  ['/pos', 'POS'],
  ['/mosaic', 'Mosaic'],
  ['/urypos', 'POS (Legacy)'],
  ['/order', 'Self Ordering'],
];

/**
 * True when `path` is a same-origin absolute path under one of the URY SPAs.
 *
 * Rejects absolute URLs, protocol-relative URLs (`//host`), backslash variants
 * that some browsers normalise to `//`, and anything outside the allowlist.
 */
export const isReturnPathAllowed = (path: unknown): path is string => {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  return RETURN_TO_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)
  );
};

/** Display name for the app owning `path` (`'URY'` as a neutral fallback). */
export const appLabelForPath = (path: string): string => {
  const match = APP_LABELS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return match ? match[1] : 'URY';
};

export interface ReturnContext {
  /** Absolute same-origin path (including query string) to come back to. */
  path: string;
  /** Display name of the app that path belongs to. */
  label: string;
}

/**
 * The current location expressed as a return context, or `null` when the
 * current page is not one of the URY SPAs (or there is no `window`, e.g. SSR
 * and unit tests).
 */
export const getCurrentReturnContext = (): ReturnContext | null => {
  if (typeof window === 'undefined' || !window.location) return null;
  const path = `${window.location.pathname}${window.location.search}`;
  if (!isReturnPathAllowed(path)) return null;
  return { path, label: appLabelForPath(window.location.pathname) };
};

export interface BuildDeskUrlOptions {
  /**
   * Override the return context. Defaults to the current location; pass
   * `null` explicitly to build a plain desk URL with no return chip.
   */
  returnTo?: ReturnContext | null;
}

/**
 * Build a desk URL for a document (or a doctype list, when `name` is omitted),
 * carrying the return context that `return_to_app.js` turns into a floating
 * "Back to <App>" chip.
 *
 * @example buildDeskUrl('URY Issue Wastage', 'WST-0001')
 *          // '/app/ury-issue-wastage/WST-0001?ury_return_to=%2Fury%2Fwastage&ury_return_label=URY'
 */
export const buildDeskUrl = (
  doctype: string,
  name?: string | null,
  options: BuildDeskUrlOptions = {}
): string => {
  const slug = doctype.trim().toLowerCase().replace(/\s+/g, '-');
  const base = name ? `/app/${slug}/${encodeURIComponent(name)}` : `/app/${slug}`;
  return withReturnContext(base, options);
};

/**
 * Attach the return context to an arbitrary desk path.
 *
 * Use this for the plain "switch to desk" exits (`/app`, `/app/point-of-sale`)
 * that are not tied to a specific document, so those users get the same
 * "Back to <App>" chip as the document links do.
 *
 * @example withReturnContext('/app')  // '/app?ury_return_to=%2Fpos&ury_return_label=POS'
 */
export const withReturnContext = (
  deskPath: string,
  options: BuildDeskUrlOptions = {}
): string => {
  const context = options.returnTo === undefined ? getCurrentReturnContext() : options.returnTo;
  if (!context) return deskPath;

  const params = new URLSearchParams();
  params.set(DESK_RETURN_PARAM, context.path);
  params.set(DESK_RETURN_LABEL_PARAM, context.label);
  return `${deskPath}${deskPath.includes('?') ? '&' : '?'}${params.toString()}`;
};

import { call } from '../frappe/client';

/**
 * What the signed-in user may open, and which optional features are off.
 *
 * The server is the authority — it redirects Desk paths and refuses calls
 * into switched-off features — so this only lets a screen hide what would
 * be refused anyway, instead of showing a button that ends in an error.
 * Fetched once per page load and shared by every caller.
 */
export interface UryAccess {
  user: string;
  /** May open Desk (/app). */
  desk: boolean;
  /** Where this user lands after signing in. */
  landing: string | null;
  role: string | null;
  /** May open the URY Control Center. */
  can_manage: boolean;
  features: Record<string, boolean>;
  /** Management-dashboard routes of switched-off features. */
  hidden_routes: string[];
  /** POS capabilities of switched-off features (coupons, loyalty, captain...). */
  pos_off: string[];
}

/** Used when the server cannot be asked: show everything, the server still guards. */
export const OPEN_ACCESS: UryAccess = {
  user: '',
  desk: true,
  landing: null,
  role: null,
  can_manage: false,
  features: {},
  hidden_routes: [],
  pos_off: [],
};

let pending: Promise<UryAccess> | null = null;

export function getAccess(): Promise<UryAccess> {
  if (!pending) {
    pending = call<{ message?: UryAccess } | UryAccess>('ury.ury.controllers.access.get_my_access')
      .then((res) => ({ ...OPEN_ACCESS, ...(((res as { message?: UryAccess }).message ?? res) as UryAccess) }))
      .catch(() => {
        // A failed lookup must not leave the next caller with a cached failure.
        pending = null;
        return OPEN_ACCESS;
      });
  }
  return pending;
}

/** True when a management route (e.g. "/purchases") belongs to a switched-off feature. */
export function isRouteHidden(access: UryAccess, path: string): boolean {
  return access.hidden_routes.some((r) => path === r || path.startsWith(`${r}/`));
}

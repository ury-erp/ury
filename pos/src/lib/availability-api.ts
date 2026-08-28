import { call } from '@ury/core';

/**
 * Thin, read-only adapter over V3-44's `get_item_availability` whitelisted
 * endpoint (`ury/ury/api/ury_availability.py`). Mirrors this app's existing
 * `lib/*-api.ts` convention (see `menu-api.ts`, `order-api.ts`).
 *
 * This module never re-derives availability math client-side — every field
 * below is passed through verbatim from the server response.
 *
 * Cache-invalidation / TTL policy (V3-40 design note: "Cached availability
 * may drive menus, dashboards, and UX, but order acceptance must re-check
 * transactionally"):
 *   - The in-memory cache here is for MENU DISPLAY ONLY (dimming/greying an
 *     item, showing a "Sold out" badge, etc).
 *   - Entries expire after `CACHE_TTL_MS` (30s) and are also invalidated
 *     manually via `invalidateAvailabilityCache()` (e.g. after a submitted
 *     order changes stock).
 *   - Cart/order-placement code must NEVER read from this cache to decide
 *     whether an item can actually be added/confirmed — it must call
 *     `getItemAvailability(..., { skipCache: true })` (or the equivalent
 *     live re-check at the transactional boundary) at the moment of that
 *     decision.
 */

export type AvailabilityReasonCode =
  | 'AVAILABLE'
  | 'NOT_PRODUCED'
  | 'PLAN_EXHAUSTED'
  | 'FG_OUT_OF_STOCK'
  | 'NO_ACTIVE_PLAN'
  | 'BLOCKING_COMPONENT'
  | 'MISSING_BOM'
  | 'MISSING_PRODUCTION_UNIT'
  | 'PRODUCTION_UNIT_DISABLED'
  | 'MISSING_DEPARTMENT'
  | 'DEPARTMENT_DISABLED'
  | 'CONFIGURATION_ERROR';

export interface ItemAvailability {
  item_code: string;
  sellable: boolean;
  available_qty: number;
  production_policy: string | null;
  company: string;
  branch: string;
  department: string | null;
  production_unit: string | null;
  warehouse: string | null;
  plan_qty: number | null;
  plan_remaining: number | null;
  fg_available: number | null;
  max_producible: number | null;
  blocking_component: string | null;
  reason_code: AvailabilityReasonCode | string;
  as_of: string;
}

export interface GetItemAvailabilityParams {
  item_code: string;
  branch: string;
  company: string;
  department?: string;
}

/**
 * Reason code -> user-facing message, for consistent UX across surfaces.
 * Codes taken verbatim from `ury/ury/api/ury_availability.py` (the only
 * authoritative source for the reason_code enum) — no invented codes.
 */
export const AVAILABILITY_REASON_MESSAGES: Record<string, string> = {
  AVAILABLE: 'Available',
  NOT_PRODUCED: 'Not available today',
  PLAN_EXHAUSTED: 'Sold out',
  FG_OUT_OF_STOCK: 'Sold out',
  NO_ACTIVE_PLAN: 'Not available today',
  BLOCKING_COMPONENT: 'Temporarily unavailable',
  MISSING_BOM: 'Temporarily unavailable',
  MISSING_PRODUCTION_UNIT: 'Temporarily unavailable',
  PRODUCTION_UNIT_DISABLED: 'Temporarily unavailable',
  MISSING_DEPARTMENT: 'Temporarily unavailable',
  DEPARTMENT_DISABLED: 'Temporarily unavailable',
  CONFIGURATION_ERROR: 'Temporarily unavailable',
};

const DEFAULT_UNAVAILABLE_MESSAGE = 'Currently unavailable';

export const getAvailabilityMessage = (reasonCode: string | null | undefined): string => {
  if (!reasonCode) return DEFAULT_UNAVAILABLE_MESSAGE;
  return AVAILABILITY_REASON_MESSAGES[reasonCode] ?? DEFAULT_UNAVAILABLE_MESSAGE;
};

// --- display-only cache -----------------------------------------------

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  value: ItemAvailability;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const buildCacheKey = (params: GetItemAvailabilityParams): string =>
  [params.item_code, params.branch, params.company, params.department || ''].join('::');

export const invalidateAvailabilityCache = (params?: GetItemAvailabilityParams) => {
  if (!params) {
    cache.clear();
    return;
  }
  cache.delete(buildCacheKey(params));
};

interface GetItemAvailabilityOptions {
  /** Bypass the display cache entirely — required at order-acceptance/add-to-cart time. */
  skipCache?: boolean;
}

export const getItemAvailability = async (
  params: GetItemAvailabilityParams,
  options: GetItemAvailabilityOptions = {},
): Promise<ItemAvailability> => {
  const key = buildCacheKey(params);

  if (!options.skipCache) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  try {
    const response = await call.get<{ message: ItemAvailability }>(
      'ury.ury.api.ury_availability.get_item_availability',
      {
        item_code: params.item_code,
        branch: params.branch,
        company: params.company,
        department: params.department,
      },
    );
    const value = response.message;
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error: any) {
    if (error._server_messages) {
      const messages = JSON.parse(error._server_messages);
      const message = JSON.parse(messages[0]);
      throw new Error(message.message);
    }
    throw error;
  }
};

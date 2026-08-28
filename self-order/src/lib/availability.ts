import { call } from '@ury/core'

const M = 'ury.ury.api.ury_availability'

/**
 * Thin, read-only adapter over V3-44's `get_item_availability` whitelisted
 * endpoint (`ury/ury/api/ury_availability.py`). Mirrors this app's existing
 * `M.<method>` dotted-path convention (see `api.ts`).
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
 *     manually via `invalidateAvailabilityCache()`.
 *   - `addItems`/order-confirmation code must NEVER read from this cache to
 *     decide whether an item can actually be added — it must call
 *     `getItemAvailability(..., { skipCache: true })` at that decision
 *     point, or rely on the backend's own transactional rejection.
 *
 * Known gap: `OrderingContext` (see `api.ts`) currently exposes `restaurant`
 * (used here as `branch`) but no `company` field. `get_item_availability`
 * requires `company` and fails closed (throws) without it. Until the
 * self-order bootstrap context carries `company`, callers here should treat
 * a thrown/failed lookup as "unknown availability" (soft-fail, do not block
 * the whole menu) rather than as CONFIGURATION_ERROR — adding `company` to
 * `OrderingContext` is out of this task's scope (frontend-only, no backend
 * changes).
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
  | 'CONFIGURATION_ERROR'

export interface ItemAvailability {
  item_code: string
  sellable: boolean
  available_qty: number
  production_policy: string | null
  company: string
  branch: string
  department: string | null
  production_unit: string | null
  warehouse: string | null
  plan_qty: number | null
  plan_remaining: number | null
  fg_available: number | null
  max_producible: number | null
  blocking_component: string | null
  reason_code: AvailabilityReasonCode | string
  as_of: string
}

export interface GetItemAvailabilityParams {
  item_code: string
  branch: string
  company: string
  department?: string
}

/** Reason code -> user-facing message. Codes taken verbatim from
 * `ury/ury/api/ury_availability.py` — no invented codes. */
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
}

const DEFAULT_UNAVAILABLE_MESSAGE = 'Currently unavailable'

export function getAvailabilityMessage(reasonCode: string | null | undefined): string {
  if (!reasonCode) return DEFAULT_UNAVAILABLE_MESSAGE
  return AVAILABILITY_REASON_MESSAGES[reasonCode] ?? DEFAULT_UNAVAILABLE_MESSAGE
}

interface FrappeResponse<T> {
  message: T
}

// --- display-only cache -----------------------------------------------

const CACHE_TTL_MS = 30_000

interface CacheEntry {
  value: ItemAvailability
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function buildCacheKey(params: GetItemAvailabilityParams): string {
  return [params.item_code, params.branch, params.company, params.department || ''].join('::')
}

export function invalidateAvailabilityCache(params?: GetItemAvailabilityParams) {
  if (!params) {
    cache.clear()
    return
  }
  cache.delete(buildCacheKey(params))
}

interface GetItemAvailabilityOptions {
  /** Bypass the display cache entirely — required at order-confirmation time. */
  skipCache?: boolean
}

export async function getItemAvailability(
  params: GetItemAvailabilityParams,
  options: GetItemAvailabilityOptions = {},
): Promise<ItemAvailability> {
  const key = buildCacheKey(params)

  if (!options.skipCache) {
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }
  }

  const response = await call.get<FrappeResponse<ItemAvailability>>(`${M}.get_item_availability`, {
    item_code: params.item_code,
    branch: params.branch,
    company: params.company,
    department: params.department,
  })
  const value = response.message
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

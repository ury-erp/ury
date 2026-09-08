import { call } from '@ury/core'

/**
 * Read-only adapter for menu display. Order acceptance stays on sync_order /
 * server stock authority — never gate cart writes solely on this cache.
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

export const getAvailabilityMessage = (reasonCode: string | null | undefined): string => {
  if (!reasonCode) return DEFAULT_UNAVAILABLE_MESSAGE
  return AVAILABILITY_REASON_MESSAGES[reasonCode] ?? DEFAULT_UNAVAILABLE_MESSAGE
}

const CACHE_TTL_MS = 30_000

interface CacheEntry {
  value: ItemAvailability
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

const buildCacheKey = (params: GetItemAvailabilityParams): string =>
  [params.item_code, params.branch, params.company, params.department || ''].join('::')

export const invalidateAvailabilityCache = (params?: GetItemAvailabilityParams) => {
  if (!params) {
    cache.clear()
    return
  }
  cache.delete(buildCacheKey(params))
}

interface GetItemAvailabilityOptions {
  skipCache?: boolean
}

export const getItemAvailability = async (
  params: GetItemAvailabilityParams,
  options: GetItemAvailabilityOptions = {}
): Promise<ItemAvailability> => {
  const key = buildCacheKey(params)

  if (!options.skipCache) {
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }
  }

  const response = await call.get<{ message: ItemAvailability }>(
    'ury.ury.api.ury_availability.get_item_availability',
    {
      item_code: params.item_code,
      branch: params.branch,
      company: params.company,
      department: params.department,
    }
  )
  const value = response.message
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

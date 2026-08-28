import { beforeEach, describe, expect, it, vi } from 'vitest'

const callGetMock = vi.fn()

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: any[]) => callGetMock(...args),
  },
}))

import {
  AVAILABILITY_REASON_MESSAGES,
  getAvailabilityMessage,
  getItemAvailability,
  invalidateAvailabilityCache,
  ItemAvailability,
} from './availability'

const buildAvailability = (overrides: Partial<ItemAvailability> = {}): ItemAvailability => ({
  item_code: 'ITEM-001',
  sellable: true,
  available_qty: 5,
  production_policy: 'MADE_TO_ORDER',
  company: 'URY',
  branch: 'Kozhikode',
  department: 'Indian',
  production_unit: 'Hot Kitchen',
  warehouse: 'Kozhikode - URY',
  plan_qty: 10,
  plan_remaining: 5,
  fg_available: null,
  max_producible: 5,
  blocking_component: null,
  reason_code: 'AVAILABLE',
  as_of: '2026-08-28 10:00:00',
  ...overrides,
})

describe('availability service (self-order)', () => {
  beforeEach(() => {
    callGetMock.mockReset()
    invalidateAvailabilityCache()
  })

  it('fetches availability and passes the server response through verbatim', async () => {
    const payload = buildAvailability()
    callGetMock.mockResolvedValueOnce({ message: payload })

    const result = await getItemAvailability({ item_code: 'ITEM-001', branch: 'Kozhikode', company: 'URY' })

    expect(callGetMock).toHaveBeenCalledWith('ury.ury.api.ury_availability.get_item_availability', {
      item_code: 'ITEM-001',
      branch: 'Kozhikode',
      company: 'URY',
      department: undefined,
    })
    expect(result).toEqual(payload)
  })

  it('maps every documented reason_code to a user-facing message', () => {
    for (const code of Object.keys(AVAILABILITY_REASON_MESSAGES)) {
      expect(getAvailabilityMessage(code)).toBe(AVAILABILITY_REASON_MESSAGES[code])
    }
    expect(getAvailabilityMessage('SOME_UNKNOWN_CODE')).toBe('Currently unavailable')
    expect(getAvailabilityMessage(null)).toBe('Currently unavailable')
  })

  it('caches per (item_code, branch, company) key and does not leak across keys', async () => {
    const itemA = buildAvailability({ item_code: 'ITEM-A', branch: 'Kozhikode', available_qty: 3 })
    const itemAOtherCompany = buildAvailability({ item_code: 'ITEM-A', branch: 'Kozhikode', company: 'URY-2', available_qty: 9 })
    const itemB = buildAvailability({ item_code: 'ITEM-B', branch: 'Kozhikode', available_qty: 1 })

    callGetMock
      .mockResolvedValueOnce({ message: itemA })
      .mockResolvedValueOnce({ message: itemAOtherCompany })
      .mockResolvedValueOnce({ message: itemB })

    const a1 = await getItemAvailability({ item_code: 'ITEM-A', branch: 'Kozhikode', company: 'URY' })
    const a2 = await getItemAvailability({ item_code: 'ITEM-A', branch: 'Kozhikode', company: 'URY' })
    const aOtherCompany = await getItemAvailability({ item_code: 'ITEM-A', branch: 'Kozhikode', company: 'URY-2' })
    const b = await getItemAvailability({ item_code: 'ITEM-B', branch: 'Kozhikode', company: 'URY' })

    expect(callGetMock).toHaveBeenCalledTimes(3)
    expect(a1).toEqual(itemA)
    expect(a2).toEqual(itemA)
    expect(aOtherCompany).toEqual(itemAOtherCompany)
    expect(aOtherCompany).not.toEqual(a1)
    expect(b).toEqual(itemB)
  })

  it('skipCache always re-calls the live endpoint, bypassing any cached display value', async () => {
    const first = buildAvailability({ available_qty: 5 })
    const second = buildAvailability({ available_qty: 0, sellable: false, reason_code: 'BLOCKING_COMPONENT' })
    callGetMock.mockResolvedValueOnce({ message: first }).mockResolvedValueOnce({ message: second })

    const params = { item_code: 'ITEM-001', branch: 'Kozhikode', company: 'URY' }
    const cached = await getItemAvailability(params)
    const live = await getItemAvailability(params, { skipCache: true })

    expect(callGetMock).toHaveBeenCalledTimes(2)
    expect(cached.available_qty).toBe(5)
    expect(live.available_qty).toBe(0)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const callGet = vi.fn()

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: unknown[]) => callGet(...args),
  },
}))

import {
  getAvailabilityMessage,
  getItemAvailability,
  invalidateAvailabilityCache,
} from './availability-api'

describe('availability-api', () => {
  beforeEach(() => {
    callGet.mockReset()
    invalidateAvailabilityCache()
  })

  it('maps reason codes to messages', () => {
    expect(getAvailabilityMessage('PLAN_EXHAUSTED')).toBe('Sold out')
    expect(getAvailabilityMessage('UNKNOWN')).toBe('Currently unavailable')
  })

  it('caches display lookups', async () => {
    callGet.mockResolvedValue({
      message: {
        item_code: 'X',
        sellable: true,
        available_qty: 2,
        reason_code: 'AVAILABLE',
      },
    })
    const params = { item_code: 'X', branch: 'B', company: 'C' }
    await getItemAvailability(params)
    await getItemAvailability(params)
    expect(callGet).toHaveBeenCalledTimes(1)
  })
})

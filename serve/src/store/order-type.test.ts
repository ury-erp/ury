import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ury/core', () => ({
  call: { get: vi.fn(), post: vi.fn() },
  storage: { setItem: vi.fn(), getItem: vi.fn() },
}))

vi.mock('../lib/menu-api', () => ({
  getRestaurantMenu: vi.fn(async () => []),
}))

vi.mock('../lib/pos-profile-api', () => ({
  getCombinedPosProfile: vi.fn(),
  getCurrencyInfo: vi.fn(),
}))

vi.mock('../lib/customer-api', () => ({
  getCustomerGroups: vi.fn(async () => []),
  getCustomerTerritories: vi.fn(async () => []),
}))

import { DEFAULT_ORDER_TYPE, DINE_IN, TAKEAWAY } from '../data/order-types'
import { useServeStore } from '../store/serve-store'

describe('serve-store order type', () => {
  beforeEach(() => {
    useServeStore.getState().discardDraft()
    useServeStore.setState({
      selectedTable: null,
      selectedRoom: null,
      selectedOrderType: DEFAULT_ORDER_TYPE,
      activeOrders: [],
      orderLoading: false,
    })
  })

  it('defaults to takeaway until a table is selected', () => {
    expect(useServeStore.getState().selectedOrderType).toBe(TAKEAWAY)
    expect(DEFAULT_ORDER_TYPE).toBe(TAKEAWAY)
  })

  it('forces Dine In when selecting a table (without loading invoice)', () => {
    useServeStore.getState().setSelectedOrderType(TAKEAWAY)
    useServeStore.getState().setSelectedTable('T-9', 'Hall A', true)

    expect(useServeStore.getState().selectedTable).toBe('T-9')
    expect(useServeStore.getState().selectedOrderType).toBe(DINE_IN)
  })
})

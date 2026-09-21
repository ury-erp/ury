import { beforeEach, describe, expect, it, vi } from 'vitest'

const callGet = vi.fn()

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: unknown[]) => callGet(...args),
    post: vi.fn(),
  },
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

import { useServeStore } from '../store/serve-store'

describe('loadTableOrder fail-closed', () => {
  beforeEach(() => {
    callGet.mockReset()
    useServeStore.getState().discardDraft()
    useServeStore.setState({
      selectedTable: 'T1',
      draftTable: 'T1',
      activeOrders: [
        {
          id: 'ITEM-1',
          item: 'ITEM-1',
          item_name: 'Soup',
          name: 'Soup',
          price: 5,
          quantity: 2,
          image: null,
          course: '',
          comment: 'hot',
        },
      ],
      selectedCustomer: { id: 'CUST-1', name: 'Ada', phone: '' },
      noOfPax: 3,
      orderComment: 'window',
      isUpdatingOrder: false,
      orderId: null,
      error: null,
    })
  })

  it('keeps local draft and throws when get_order_invoice fails', async () => {
    callGet.mockRejectedValue(new Error('network down'))
    const before = useServeStore.getState().activeOrders

    await expect(useServeStore.getState().loadTableOrder('T1')).rejects.toThrow(/network down/)

    const after = useServeStore.getState()
    expect(after.activeOrders).toEqual(before)
    expect(after.selectedCustomer?.id).toBe('CUST-1')
    expect(after.noOfPax).toBe(3)
    expect(after.orderComment).toBe('window')
    expect(after.error).toMatch(/network down/)
  })

  it('force reload applies empty server state on explicit reconcile', async () => {
    callGet.mockResolvedValue({ message: null })
    await useServeStore.getState().loadTableOrder('T1', { force: true })
    expect(useServeStore.getState().activeOrders).toHaveLength(0)
    expect(useServeStore.getState().selectedCustomer).toBeNull()
  })
})

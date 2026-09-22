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

  it('coerces string no_of_pax from the API so + increments numerically', async () => {
    callGet.mockResolvedValue({
      message: {
        name: 'INV-1',
        customer: 'CUST-1',
        customer_name: 'Ada',
        mobile_number: '',
        no_of_pax: '1',
        custom_comments: '',
        modified: '2026-01-01 00:00:00',
        items: [
          {
            name: 'row-1',
            item_code: 'ITEM-1',
            item_name: 'Soup',
            rate: 5,
            qty: 1,
            amount: 5,
            comment: '',
            description: '',
            image: null,
          },
        ],
      },
    })
    await useServeStore.getState().loadTableOrder('T1', { force: true })
    expect(useServeStore.getState().noOfPax).toBe(1)

    useServeStore.getState().setNoOfPax(useServeStore.getState().noOfPax + 1)
    expect(useServeStore.getState().noOfPax).toBe(2)
  })
})

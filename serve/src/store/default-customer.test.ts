import { beforeEach, describe, expect, it, vi } from 'vitest'

const callGet = vi.fn()

vi.mock('@ury/core', () => ({
  call: { get: (...args: unknown[]) => callGet(...args), post: vi.fn() },
  storage: { setItem: vi.fn(), getItem: vi.fn() },
  siteCurrencyCode: () => null,
}))
vi.mock('../lib/menu-api', () => ({ getRestaurantMenu: vi.fn(async () => []) }))
vi.mock('../lib/pos-profile-api', () => ({
  getCombinedPosProfile: vi.fn(),
  getCurrencyInfo: vi.fn(),
}))
vi.mock('../lib/customer-api', () => ({
  getCustomerGroups: vi.fn(async () => []),
  getCustomerTerritories: vi.fn(async () => []),
}))

import { useServeStore } from './serve-store'

const walkIn = { customer: 'CUST-WALK', customer_name: 'Walk-In Customer', mobile_number: '000' }
const dineInDefault = { customer: 'CUST-DINE', customer_name: 'Dine Guest', mobile_number: null }
const regular = { customer: 'CUST-REG', customer_name: 'Regular', mobile_number: '999' }
const WALK_IN = { id: 'CUST-WALK', name: 'Walk-In Customer', phone: '000' }
const DINE_GUEST = { id: 'CUST-DINE', name: 'Dine Guest', phone: '' }
const REGULAR = { id: 'CUST-REG', name: 'Regular', phone: '999' }
const PICKED = { id: 'CUST-PICK', name: 'Picked', phone: '123' }

function setProfile(config: object) {
  useServeStore.setState({ posProfile: { name: 'P', ...config } as never })
}

describe('serve-store default customer', () => {
  beforeEach(() => {
    callGet.mockReset()
    useServeStore.getState().discardDraft()
    useServeStore.setState({
      selectedCustomer: null,
      customerSource: 'auto',
      isUpdatingOrder: false,
      selectedOrderType: 'Take Away',
      selectedTable: null,
      selectedRoom: null,
    })
    setProfile({
      order_type_customer_map: { 'Take Away': walkIn, 'Dine In': dineInDefault },
      default_customer: regular,
    })
  })

  it('startTakeaway preselects the Take Away default on a fresh entry', () => {
    useServeStore.getState().startTakeaway()
    expect(useServeStore.getState().selectedCustomer).toEqual(WALK_IN)
    expect(useServeStore.getState().customerSource).toBe('auto')
  })

  it('startTakeaway keeps a manual customer when an unsent draft exists', () => {
    useServeStore.setState({
      activeOrders: [{ id: 'I', item: 'I', item_name: 'Soup', name: 'Soup', price: 1, quantity: 1, image: null, course: '' } as never],
      draftTable: 'takeaway',
      selectedCustomer: PICKED,
      customerSource: 'manual',
    })
    useServeStore.getState().startTakeaway()
    expect(useServeStore.getState().selectedCustomer).toEqual(PICKED)
  })

  it('selecting a table sets the Dine In default', () => {
    useServeStore.getState().setSelectedTable('T-1', 'Hall', true)
    expect(useServeStore.getState().selectedOrderType).toBe('Dine In')
    expect(useServeStore.getState().selectedCustomer).toEqual(DINE_GUEST)
  })

  it('selecting a table keeps a manually picked customer', () => {
    useServeStore.getState().setSelectedCustomer(PICKED)
    useServeStore.getState().setSelectedTable('T-1', 'Hall', true)
    expect(useServeStore.getState().selectedCustomer).toEqual(PICKED)
  })

  it('order type change follows the default while auto and falls back to the profile default', () => {
    useServeStore.getState().setSelectedOrderType('Dine In')
    expect(useServeStore.getState().selectedCustomer).toEqual(DINE_GUEST)
    useServeStore.getState().setSelectedOrderType('Delivery')
    expect(useServeStore.getState().selectedCustomer).toEqual(REGULAR)
  })

  it('order type change never overwrites a manual pick, a loaded order or an order being updated', () => {
    useServeStore.getState().setSelectedCustomer(PICKED)
    useServeStore.getState().setSelectedOrderType('Dine In')
    expect(useServeStore.getState().selectedCustomer).toEqual(PICKED)

    useServeStore.setState({ customerSource: 'order' })
    useServeStore.getState().setSelectedOrderType('Take Away')
    expect(useServeStore.getState().selectedCustomer).toEqual(PICKED)

    useServeStore.setState({ customerSource: 'auto', isUpdatingOrder: true })
    useServeStore.getState().setSelectedOrderType('Delivery')
    expect(useServeStore.getState().selectedCustomer).toEqual(PICKED)
  })

  it('does not resolve a customer for Aggregators', () => {
    useServeStore.getState().setSelectedOrderType('Aggregators')
    expect(useServeStore.getState().selectedCustomer).toBeNull()
  })

  it('applyAutoCustomer preselects on profile load and respects manual picks', () => {
    useServeStore.getState().applyAutoCustomer()
    expect(useServeStore.getState().selectedCustomer).toEqual(WALK_IN)
    useServeStore.getState().setSelectedCustomer(PICKED)
    useServeStore.getState().applyAutoCustomer()
    expect(useServeStore.getState().selectedCustomer).toEqual(PICKED)
  })

  it('resetOrderState and discardDraft return to auto with the default', () => {
    useServeStore.getState().setSelectedCustomer(PICKED)
    useServeStore.getState().resetOrderState()
    expect(useServeStore.getState().selectedCustomer).toEqual(WALK_IN)
    expect(useServeStore.getState().customerSource).toBe('auto')

    useServeStore.getState().setSelectedCustomer(PICKED)
    useServeStore.getState().discardDraft()
    expect(useServeStore.getState().selectedCustomer).toEqual(WALK_IN)
    expect(useServeStore.getState().customerSource).toBe('auto')
  })

  it('loading an existing order keeps its customer and marks the source as order', async () => {
    callGet.mockResolvedValue({
      message: {
        name: 'INV-1',
        customer: 'CUST-OLD',
        customer_name: 'Old Customer',
        mobile_number: '555',
        no_of_pax: 2,
        items: [{ item_code: 'I', item_name: 'Item', rate: 1, qty: 1, amount: 1 }],
      },
    })
    await useServeStore.getState().loadTableOrder('T-1')
    const state = useServeStore.getState()
    expect(state.selectedCustomer).toEqual({ id: 'CUST-OLD', name: 'Old Customer', phone: '555' })
    expect(state.customerSource).toBe('order')
    state.setSelectedOrderType('Take Away')
    expect(useServeStore.getState().selectedCustomer?.id).toBe('CUST-OLD')
  })

  it('entering an empty table preselects the default for the current order type', async () => {
    callGet.mockResolvedValue({ message: null })
    useServeStore.setState({ selectedOrderType: 'Dine In', selectedCustomer: PICKED, customerSource: 'manual' })
    await useServeStore.getState().loadTableOrder('T-2')
    expect(useServeStore.getState().selectedCustomer).toEqual(DINE_GUEST)
    expect(useServeStore.getState().customerSource).toBe('auto')
  })
})

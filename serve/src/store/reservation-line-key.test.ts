import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useServeStore } from './serve-store'

const getTableOrder = vi.fn()

vi.mock('../lib/order-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/order-api')>('../lib/order-api')
  return {
    ...actual,
    getTableOrder: (...args: unknown[]) => getTableOrder(...args),
  }
})

describe('reservation_line_key (B02b)', () => {
  beforeEach(() => {
    getTableOrder.mockReset()
    useServeStore.getState().discardDraft()
    useServeStore.setState({
      selectedTable: null,
      draftTable: null,
      activeOrders: [],
      isUpdatingOrder: false,
      orderId: null,
      loadGeneration: 0,
      draftBaseline: null,
    })
  })

  it('loads persisted reservation_line_key verbatim and never uses child row name', async () => {
    getTableOrder.mockResolvedValue({
      message: {
        name: 'INV-1',
        customer: 'CUST-1',
        customer_name: 'Ada',
        mobile_number: '',
        no_of_pax: 2,
        custom_comments: '',
        modified: '2026-09-21 10:00:00',
        items: [
          {
            name: 'row-autoname-xyz',
            item_code: 'ITEM-1',
            item_name: 'Pizza',
            rate: 10,
            qty: 1,
            amount: 10,
            comment: '',
            description: '',
            image: null,
            reservation_line_key: 'client-key-stable-abc',
          },
        ],
      },
    })

    await useServeStore.getState().loadTableOrder('T1')
    const line = useServeStore.getState().activeOrders[0]
    expect(line.reservationLineKey).toBe('client-key-stable-abc')
    expect(line.uniqueId).toBe('client-key-stable-abc')
    expect(line.invoiceItemName).toBe('row-autoname-xyz')
    expect(line.uniqueId).not.toBe(`inv:${line.invoiceItemName}`)
  })

  it('legacy unkeyed rows fall back to local uniqueId, not inv:<row name>', async () => {
    getTableOrder.mockResolvedValue({
      message: {
        name: 'INV-2',
        customer: 'CUST-1',
        customer_name: 'Ada',
        mobile_number: '',
        no_of_pax: 1,
        custom_comments: '',
        modified: '2026-09-21 10:00:00',
        items: [
          {
            name: 'row-legacy-1',
            item_code: 'ITEM-2',
            item_name: 'Soup',
            rate: 5,
            qty: 2,
            amount: 10,
            comment: '',
            description: '',
            image: null,
          },
        ],
      },
    })

    await useServeStore.getState().loadTableOrder('T1')
    const line = useServeStore.getState().activeOrders[0]
    expect(line.reservationLineKey).toBe(line.uniqueId)
    expect(line.uniqueId).not.toMatch(/^inv:/)
    expect(line.uniqueId).not.toContain('row-legacy-1')
  })

  it('qty change keeps the original reservationLineKey byte-for-byte', async () => {
    useServeStore.setState({
      selectedTable: 'T1',
      draftTable: 'T1',
      activeOrders: [
        {
          id: 'ITEM-1',
          item: 'ITEM-1',
          item_name: 'Pizza',
          name: 'Pizza',
          price: 10,
          quantity: 1,
          image: null,
          course: '',
          invoiceItemName: 'row-a',
          uniqueId: 'client-key-stable-abc',
          reservationLineKey: 'client-key-stable-abc',
        },
      ],
    })

    await useServeStore.getState().updateQuantity('client-key-stable-abc', 3)
    const line = useServeStore.getState().activeOrders[0]
    expect(line.quantity).toBe(3)
    expect(line.reservationLineKey).toBe('client-key-stable-abc')
    expect(line.uniqueId).toBe('client-key-stable-abc')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { TAKEAWAY, DINE_IN } from '../data/order-types'
import { TAKEAWAY_DRAFT_KEY, useServeStore } from '../store/serve-store'

describe('serve-store draft + cart keys', () => {
  beforeEach(() => {
    useServeStore.getState().discardDraft()
    useServeStore.setState({
      selectedTable: null,
      selectedRoom: null,
      draftTable: null,
      activeOrders: [],
      submitting: false,
      orderLoading: false,
      isUpdatingOrder: false,
      orderId: null,
      needsReconcile: false,
      selectedOrderType: TAKEAWAY,
      posProfile: null,
    })
  })

  it('keeps distinct invoice rows with same item code as separate lines', async () => {
    const store = useServeStore.getState()
    await store.addToOrder({
      id: 'ITEM-1',
      item: 'ITEM-1',
      item_name: 'Pizza',
      name: 'Pizza',
      price: 10,
      quantity: 1,
      image: null,
      course: '',
      invoiceItemName: 'row-a',
      uniqueId: 'inv:row-a',
    })
    await store.addToOrder({
      id: 'ITEM-1',
      item: 'ITEM-1',
      item_name: 'Pizza',
      name: 'Pizza',
      price: 12,
      quantity: 1,
      image: null,
      course: '',
      invoiceItemName: 'row-b',
      uniqueId: 'inv:row-b',
    })
    expect(useServeStore.getState().activeOrders).toHaveLength(2)
  })

  it('merges draft lines with identical keys but not different rates', async () => {
    const store = useServeStore.getState()
    await store.addToOrder({
      id: 'ITEM-3',
      item: 'ITEM-3',
      item_name: 'Tea',
      name: 'Tea',
      price: 5,
      quantity: 1,
      image: null,
      course: '',
    })
    await store.addToOrder({
      id: 'ITEM-3',
      item: 'ITEM-3',
      item_name: 'Tea',
      name: 'Tea',
      price: 5,
      quantity: 2,
      image: null,
      course: '',
    })
    expect(useServeStore.getState().activeOrders).toHaveLength(1)
    expect(useServeStore.getState().activeOrders[0].quantity).toBe(3)

    await store.addToOrder({
      id: 'ITEM-3',
      item: 'ITEM-3',
      item_name: 'Tea',
      name: 'Tea',
      price: 7,
      quantity: 1,
      image: null,
      course: '',
    })
    expect(useServeStore.getState().activeOrders).toHaveLength(2)
  })

  it('reports unsent draft and discards it', async () => {
    const store = useServeStore.getState()
    useServeStore.setState({ selectedTable: 'T1', draftTable: 'T1', selectedOrderType: DINE_IN })
    await store.addToOrder({
      id: 'ITEM-2',
      item: 'ITEM-2',
      item_name: 'Soup',
      name: 'Soup',
      price: 5,
      quantity: 1,
      image: null,
      course: '',
    })
    expect(useServeStore.getState().hasUnsentDraft()).toBe(true)
    store.discardDraft()
    expect(useServeStore.getState().activeOrders).toHaveLength(0)
    expect(useServeStore.getState().hasUnsentDraft()).toBe(false)
  })

  it('preserves draft when switching tables is blocked via hasUnsentDraft', async () => {
    const store = useServeStore.getState()
    useServeStore.setState({ selectedTable: 'T1', draftTable: 'T1', selectedOrderType: DINE_IN })
    await store.addToOrder({
      id: 'ITEM-9',
      item: 'ITEM-9',
      item_name: 'Salad',
      name: 'Salad',
      price: 8,
      quantity: 1,
      image: null,
      course: '',
    })
    expect(store.hasUnsentDraft()).toBe(true)
    expect(useServeStore.getState().draftTable).toBe('T1')
  })

  it('keeps an uncertain submission blocked while preserving its draft', () => {
    const store = useServeStore.getState()
    store.setNeedsReconcile(true)
    store.clearTableOrder({ preserveDraft: true })
    expect(useServeStore.getState().needsReconcile).toBe(true)
    expect(useServeStore.getState().hasUnsentDraft()).toBe(true)
    store.discardDraft()
    expect(useServeStore.getState().needsReconcile).toBe(false)
  })

  it('blocks interaction while submitting', () => {
    useServeStore.setState({ submitting: true })
    expect(useServeStore.getState().isOrderInteractionDisabled()).toBe(true)
  })

  it('validateQuantity rejects non-positive and non-finite values', () => {
    const { validateQuantity } = useServeStore.getState()
    expect(validateQuantity(1)).toBe(true)
    expect(validateQuantity(0)).toBe(false)
    expect(validateQuantity(-1)).toBe(false)
    expect(validateQuantity(Number.NaN)).toBe(false)
  })

  it('treats qty/comment/customer/pax edits on loaded invoice as unsent draft', async () => {
    useServeStore.setState({
      selectedTable: 'T1',
      draftTable: 'T1',
      isUpdatingOrder: true,
      orderId: 'INV-1',
      noOfPax: 2,
      orderComment: '',
      selectedCustomer: { id: 'CUST-1', name: 'Ada', phone: '' },
      activeOrders: [
        {
          id: 'ITEM-1',
          item: 'ITEM-1',
          item_name: 'Pizza',
          name: 'Pizza',
          price: 10,
          quantity: 2,
          image: null,
          course: '',
          invoiceItemName: 'row-a',
          uniqueId: 'inv:row-a',
          comment: '',
        },
      ],
      draftBaseline: {
        lines: [{ uniqueId: 'inv:row-a', quantity: 2, comment: '' }],
        customerId: 'CUST-1',
        noOfPax: 2,
        orderComment: '',
      },
    })
    expect(useServeStore.getState().hasUnsentDraft()).toBe(false)

    await useServeStore.getState().updateQuantity('inv:row-a', 3)
    expect(useServeStore.getState().hasUnsentDraft()).toBe(true)

    useServeStore.getState().updateQuantity('inv:row-a', 2)
    expect(useServeStore.getState().hasUnsentDraft()).toBe(false)

    useServeStore.getState().updateItemComment('inv:row-a', 'no onion')
    expect(useServeStore.getState().hasUnsentDraft()).toBe(true)

    useServeStore.getState().updateItemComment('inv:row-a', '')
    useServeStore.getState().setNoOfPax(4)
    expect(useServeStore.getState().hasUnsentDraft()).toBe(true)

    useServeStore.getState().setNoOfPax(2)
    useServeStore.getState().setSelectedCustomer({ id: 'CUST-2', name: 'Bob', phone: '' })
    expect(useServeStore.getState().hasUnsentDraft()).toBe(true)
  })

  it('stamps takeaway draft key when adding items without a table', async () => {
    useServeStore.getState().startTakeaway()
    await useServeStore.getState().addToOrder({
      id: 'ITEM-TW',
      item: 'ITEM-TW',
      item_name: 'Wrap',
      name: 'Wrap',
      price: 9,
      quantity: 1,
      image: null,
      course: '',
    })
    expect(useServeStore.getState().draftTable).toBe(TAKEAWAY_DRAFT_KEY)
    expect(useServeStore.getState().getDraftDestination()).toBe(TAKEAWAY_DRAFT_KEY)
    expect(useServeStore.getState().hasUnsentDraft()).toBe(true)
  })

  it('startTakeaway clears stale table/room and preserves the same takeaway draft', async () => {
    useServeStore.getState().startTakeaway()
    await useServeStore.getState().addToOrder({
      id: 'ITEM-TW',
      item: 'ITEM-TW',
      item_name: 'Wrap',
      name: 'Wrap',
      price: 9,
      quantity: 1,
      image: null,
      course: '',
    })
    // Simulate leftover selection from a prior dine-in visit.
    useServeStore.setState({ selectedTable: 'T-STALE', selectedRoom: 'Hall Stale' })

    useServeStore.getState().startTakeaway()

    const state = useServeStore.getState()
    expect(state.selectedOrderType).toBe(TAKEAWAY)
    expect(state.selectedTable).toBeNull()
    expect(state.selectedRoom).toBeNull()
    expect(state.draftTable).toBe(TAKEAWAY_DRAFT_KEY)
    expect(state.activeOrders).toHaveLength(1)
    expect(state.activeOrders[0].id).toBe('ITEM-TW')
  })

  it('draft switch: discard table draft then startTakeaway leaves a clean takeaway cart', async () => {
    useServeStore.setState({
      selectedTable: 'T1',
      selectedRoom: 'Hall A',
      selectedOrderType: DINE_IN,
      draftTable: 'T1',
    })
    await useServeStore.getState().addToOrder({
      id: 'ITEM-T',
      item: 'ITEM-T',
      item_name: 'Table dish',
      name: 'Table dish',
      price: 12,
      quantity: 1,
      image: null,
      course: '',
    })
    expect(useServeStore.getState().getDraftDestination()).toBe('T1')

    useServeStore.getState().discardDraft()
    useServeStore.getState().startTakeaway()

    const state = useServeStore.getState()
    expect(state.hasUnsentDraft()).toBe(false)
    expect(state.activeOrders).toHaveLength(0)
    expect(state.selectedOrderType).toBe(TAKEAWAY)
    expect(state.selectedTable).toBeNull()
    expect(state.selectedRoom).toBeNull()
    expect(state.draftTable).toBeNull()
  })

  it('setSelectedTable still forces Dine In without loading when requested', () => {
    useServeStore.getState().setSelectedOrderType(TAKEAWAY)
    useServeStore.getState().setSelectedTable('T-9', 'Hall A', true)

    expect(useServeStore.getState().selectedTable).toBe('T-9')
    expect(useServeStore.getState().selectedRoom).toBe('Hall A')
    expect(useServeStore.getState().selectedOrderType).toBe(DINE_IN)
  })
})

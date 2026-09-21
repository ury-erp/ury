import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bootstrapMock = vi.fn()
const getMenuMock = vi.fn()
const getCurrentOrderMock = vi.fn()
const getStatusMock = vi.fn()
const addItemsMock = vi.fn()
const requestBillMock = vi.fn()
const createPaymentRequestMock = vi.fn()
const getStoredContextMock = vi.fn()

vi.mock('../lib/api', () => ({
  bootstrap: (...args: any[]) => bootstrapMock(...args),
  getMenu: (...args: any[]) => getMenuMock(...args),
  getCurrentOrder: (...args: any[]) => getCurrentOrderMock(...args),
  getStatus: (...args: any[]) => getStatusMock(...args),
  addItems: (...args: any[]) => addItemsMock(...args),
  requestBill: (...args: any[]) => requestBillMock(...args),
  createPaymentRequest: (...args: any[]) => createPaymentRequestMock(...args),
  getStoredContext: (...args: any[]) => getStoredContextMock(...args),
}))

const getItemAvailabilityMock = vi.fn()
const getAvailabilityMessageMock = vi.fn((reasonCode: string) => `unavailable: ${reasonCode}`)

vi.mock('../lib/availability', () => ({
  getItemAvailability: (...args: any[]) => getItemAvailabilityMock(...args),
  getAvailabilityMessage: (...args: any[]) => getAvailabilityMessageMock(...args),
}))

import { useOrderingSession } from './useOrderingSession'
import type { CustomerOrder, MenuItem, OrderingContext } from '../lib/api'

const buildContext = (overrides: Partial<OrderingContext> = {}): OrderingContext => ({
  session: 'SESSION-1',
  source: 'qr',
  restaurant: 'Kozhikode',
  company: 'URY',
  table: 'T1',
  layout: 'Mobile',
  capabilities: {
    product_detail_enabled: true,
    show_item_images: true,
    show_item_descriptions: true,
    item_notes_enabled: true,
    request_bill_enabled: true,
    customer_payment_enabled: true,
    payment_link_enabled: true,
    pay_at_counter_enabled: true,
    add_to_running_table_enabled: true,
  },
  session_idle_timeout_minutes: 30,
  ...overrides,
})

const buildMenuItem = (overrides: Partial<MenuItem> = {}): MenuItem => ({
  item: 'COFFEE',
  item_name: 'Coffee',
  rate: 100,
  special_dish: 0,
  disabled: 0,
  item_image: null,
  course: null,
  course_label: null,
  ...overrides,
})

const buildOrder = (overrides: Partial<CustomerOrder> = {}): CustomerOrder => ({
  invoice: null,
  items: [],
  grand_total: 0,
  billed: false,
  ...overrides,
})

// Every test resolves init() through a device-bootstrapped `initialContext`
// (matches App.tsx's kiosk/tablet path) so hook state settles deterministically
// without touching window.location.search / the QR-token bootstrap branch,
// which is exercised separately in the "session bootstrap" describe block.
async function renderReady(overrides?: {
  context?: OrderingContext
  menu?: MenuItem[]
  order?: CustomerOrder
}) {
  const context = overrides?.context ?? buildContext()
  getMenuMock.mockResolvedValueOnce({
    items: overrides?.menu ?? [buildMenuItem()],
    modified_time: null,
    name: null,
  })
  getCurrentOrderMock.mockResolvedValueOnce(overrides?.order ?? buildOrder())

  const view = renderHook(() => useOrderingSession(context))
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

describe('useOrderingSession', () => {
  beforeEach(() => {
    bootstrapMock.mockReset()
    getMenuMock.mockReset()
    getCurrentOrderMock.mockReset()
    getStatusMock.mockReset()
    addItemsMock.mockReset()
    requestBillMock.mockReset()
    createPaymentRequestMock.mockReset()
    getStoredContextMock.mockReset()
    getItemAvailabilityMock.mockReset()
    getAvailabilityMessageMock.mockClear()
    sessionStorage.clear()
    vi.stubGlobal('location', { ...window.location, search: '' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('session bootstrap', () => {
    it('uses a device-bootstrapped initialContext without calling bootstrap() or reading stored context', async () => {
      const context = buildContext()
      const view = await renderReady({ context })

      expect(bootstrapMock).not.toHaveBeenCalled()
      expect(getStoredContextMock).not.toHaveBeenCalled()
      expect(view.result.current.context).toEqual(context)
      expect(view.result.current.error).toBeNull()
    })

    it('filters disabled items out of the loaded menu', async () => {
      const view = await renderReady({
        menu: [buildMenuItem({ item: 'A' }), buildMenuItem({ item: 'B', disabled: 1 })],
      })

      expect(view.result.current.menu.map((m) => m.item)).toEqual(['A'])
    })

    it('surfaces a friendly error and stops loading when there is no token and no stored context', async () => {
      getStoredContextMock.mockReturnValueOnce(null)

      const view = renderHook(() => useOrderingSession())
      await waitFor(() => expect(view.result.current.loading).toBe(false))

      expect(view.result.current.error).toMatch(/rescan the QR code/i)
      expect(getMenuMock).not.toHaveBeenCalled()
    })

    it('surfaces the thrown error message when menu/order loading fails', async () => {
      getMenuMock.mockRejectedValueOnce(new Error('network exploded'))

      const view = renderHook(() => useOrderingSession(buildContext()))
      await waitFor(() => expect(view.result.current.loading).toBe(false))

      expect(view.result.current.error).toBe('network exploded')
    })
  })

  describe('cart management', () => {
    it('adds a new item to the cart with qty 1', async () => {
      const view = await renderReady()
      const item = buildMenuItem()

      act(() => view.result.current.addToCart(item))

      expect(view.result.current.cart[item.item]).toEqual({
        item,
        qty: 1,
        comment: undefined,
        variant: undefined,
        addons: undefined,
      })
      expect(view.result.current.cartCount).toBe(1)
    })

    it('increments qty and keeps prior comment/variant/addons when re-adding without options', async () => {
      const view = await renderReady()
      const item = buildMenuItem()

      act(() => view.result.current.addToCart(item, { comment: 'no sugar', variant: 'Large' }))
      act(() => view.result.current.addToCart(item))

      expect(view.result.current.cart[item.item]).toMatchObject({
        qty: 2,
        comment: 'no sugar',
        variant: 'Large',
      })
    })

    it('computes cartCount and cartTotal across multiple lines', async () => {
      const view = await renderReady()
      const coffee = buildMenuItem({ item: 'COFFEE', rate: 100 })
      const tea = buildMenuItem({ item: 'TEA', rate: 50 })

      act(() => {
        view.result.current.addToCart(coffee)
        view.result.current.addToCart(coffee)
        view.result.current.addToCart(tea)
      })

      expect(view.result.current.cartCount).toBe(3)
      expect(view.result.current.cartTotal).toBe(250)
    })

    it('decrementCart reduces qty by one and removes the line at zero', async () => {
      const view = await renderReady()
      const item = buildMenuItem()

      act(() => {
        view.result.current.addToCart(item)
        view.result.current.addToCart(item)
      })
      expect(view.result.current.cart[item.item].qty).toBe(2)

      act(() => view.result.current.decrementCart(item.item))
      expect(view.result.current.cart[item.item].qty).toBe(1)

      act(() => view.result.current.decrementCart(item.item))
      expect(view.result.current.cart[item.item]).toBeUndefined()
      expect(view.result.current.cartCount).toBe(0)
    })

    it('decrementCart on an item not in the cart is a no-op', async () => {
      const view = await renderReady()
      act(() => view.result.current.decrementCart('NOT-IN-CART'))
      expect(view.result.current.cart).toEqual({})
    })
  })

  // B04-class risk: submitCart is this app's only client-side guard against
  // overselling a scarce made-to-order item between menu-display time and
  // order-submit time. These tests pin down exactly what the hook does and
  // does not check.
  describe('submitCart availability re-check (B04 cart-capacity risk)', () => {
    it('does nothing and returns false when the cart is empty', async () => {
      const view = await renderReady()
      let ok: boolean | undefined
      await act(async () => {
        ok = await view.result.current.submitCart()
      })
      expect(ok).toBe(false)
      expect(getItemAvailabilityMock).not.toHaveBeenCalled()
      expect(addItemsMock).not.toHaveBeenCalled()
    })

    it('re-checks availability with skipCache:true for every cart line before submitting', async () => {
      const context = buildContext({ restaurant: 'Kozhikode', company: 'URY' })
      const view = await renderReady({ context })
      const coffee = buildMenuItem({ item: 'COFFEE' })
      const tea = buildMenuItem({ item: 'TEA' })
      act(() => {
        view.result.current.addToCart(coffee)
        view.result.current.addToCart(tea)
      })

      getItemAvailabilityMock.mockResolvedValue({ sellable: true, reason_code: 'AVAILABLE' })
      addItemsMock.mockResolvedValueOnce(buildOrder({ invoice: 'INV-1' }))

      let ok: boolean | undefined
      await act(async () => {
        ok = await view.result.current.submitCart()
      })

      expect(ok).toBe(true)
      expect(getItemAvailabilityMock).toHaveBeenCalledTimes(2)
      expect(getItemAvailabilityMock).toHaveBeenCalledWith(
        { item_code: 'COFFEE', branch: 'Kozhikode', company: 'URY' },
        { skipCache: true },
      )
      expect(addItemsMock).toHaveBeenCalledWith('SESSION-1', [
        { item: 'COFFEE', qty: 1, comment: undefined },
        { item: 'TEA', qty: 1, comment: undefined },
      ])
    })

    it('blocks submission and surfaces a message when live availability says not sellable, without calling addItems', async () => {
      const context = buildContext({ restaurant: 'Kozhikode', company: 'URY' })
      const view = await renderReady({ context })
      const coffee = buildMenuItem({ item: 'COFFEE', item_name: 'Coffee' })
      act(() => view.result.current.addToCart(coffee, undefined))
      act(() => {
        // push qty to 4, mirroring B04's repro of over-incrementing a capacity-limited item
        view.result.current.addToCart(coffee)
        view.result.current.addToCart(coffee)
        view.result.current.addToCart(coffee)
      })

      getItemAvailabilityMock.mockResolvedValueOnce({ sellable: false, reason_code: 'NO_CAPACITY' })

      let ok: boolean | undefined
      await act(async () => {
        ok = await view.result.current.submitCart()
      })

      expect(ok).toBe(false)
      expect(addItemsMock).not.toHaveBeenCalled()
      expect(view.result.current.error).toBe('Coffee: unavailable: NO_CAPACITY')
      // Cart is preserved so the customer can adjust quantity rather than
      // silently losing their selection on a blocked submit.
      expect(view.result.current.cart[coffee.item].qty).toBe(4)
    })

    it('skips the availability re-check entirely when context has no restaurant/company', async () => {
      const context = buildContext({ restaurant: '', company: '' })
      const view = await renderReady({ context })
      act(() => view.result.current.addToCart(buildMenuItem()))
      addItemsMock.mockResolvedValueOnce(buildOrder())

      await act(async () => {
        await view.result.current.submitCart()
      })

      expect(getItemAvailabilityMock).not.toHaveBeenCalled()
      expect(addItemsMock).toHaveBeenCalled()
    })

    it('clears the cart and updates the order on success', async () => {
      const view = await renderReady()
      act(() => view.result.current.addToCart(buildMenuItem()))
      getItemAvailabilityMock.mockResolvedValue({ sellable: true, reason_code: 'AVAILABLE' })
      const updated = buildOrder({ invoice: 'INV-9' })
      addItemsMock.mockResolvedValueOnce(updated)

      await act(async () => {
        await view.result.current.submitCart()
      })

      expect(view.result.current.cart).toEqual({})
      expect(view.result.current.order).toEqual(updated)
      expect(view.result.current.submitting).toBe(false)
    })

    it('surfaces a friendly error and never throws when addItems rejects', async () => {
      const view = await renderReady()
      act(() => view.result.current.addToCart(buildMenuItem()))
      getItemAvailabilityMock.mockResolvedValue({ sellable: true, reason_code: 'AVAILABLE' })
      addItemsMock.mockRejectedValueOnce(new Error('server down'))

      let ok: boolean | undefined
      await act(async () => {
        ok = await view.result.current.submitCart()
      })

      expect(ok).toBe(false)
      expect(view.result.current.error).toBe('server down')
      expect(view.result.current.submitting).toBe(false)
      // Failed submission must not silently clear what the customer picked.
      expect(Object.keys(view.result.current.cart)).toHaveLength(1)
    })
  })

  describe('resetSession', () => {
    it('clears cart/order/session state and sessionStorage, then re-runs init', async () => {
      const context = buildContext()
      sessionStorage.setItem('ury_order_session', context.session)
      sessionStorage.setItem('ury_order_context', JSON.stringify(context))
      const view = await renderReady({ context })
      act(() => view.result.current.addToCart(buildMenuItem()))
      expect(view.result.current.cartCount).toBe(1)

      // resetSession re-runs init(); for a device-bootstrapped session this
      // re-resolves the same initialContext (no re-scan needed).
      getMenuMock.mockResolvedValueOnce({ items: [], modified_time: null, name: null })
      getCurrentOrderMock.mockResolvedValueOnce(buildOrder())

      act(() => view.result.current.resetSession())
      await waitFor(() => expect(view.result.current.loading).toBe(false))

      expect(sessionStorage.getItem('ury_order_session')).toBeNull()
      expect(sessionStorage.getItem('ury_order_context')).toBeNull()
      expect(view.result.current.cart).toEqual({})
      expect(view.result.current.screen).toBe('menu')
    })
  })

  describe('screen navigation', () => {
    it('walks the menu -> detail -> cart -> checkout -> status state machine', async () => {
      const context = buildContext()
      const view = await renderReady({ context })

      act(() => view.result.current.goToDetail('COFFEE'))
      expect(view.result.current.screen).toBe('detail')
      expect(view.result.current.detailItemCode).toBe('COFFEE')

      act(() => view.result.current.goToCart())
      expect(view.result.current.screen).toBe('cart')

      act(() => view.result.current.goToCheckout())
      expect(view.result.current.screen).toBe('checkout')

      getStatusMock.mockResolvedValueOnce({ session_status: 'Open', invoice: null })
      act(() => view.result.current.goToStatus())
      expect(view.result.current.screen).toBe('status')
      await waitFor(() => expect(getStatusMock).toHaveBeenCalledWith(context.session))
      await waitFor(() => expect(view.result.current.orderStatus).toEqual({ session_status: 'Open', invoice: null }))

      act(() => view.result.current.goToMenu())
      expect(view.result.current.screen).toBe('menu')
      expect(view.result.current.detailItemCode).toBeNull()
    })
  })

  describe('handleRequestBill / payOnline', () => {
    it('sets billRequested on success', async () => {
      const view = await renderReady()
      requestBillMock.mockResolvedValueOnce({ status: 'ok', request: 'REQ-1' })

      await act(async () => {
        await view.result.current.handleRequestBill()
      })

      expect(view.result.current.billRequested).toBe(true)
    })

    it('surfaces an error when requestBill fails and does not set billRequested', async () => {
      const view = await renderReady()
      requestBillMock.mockRejectedValueOnce(new Error('bill service down'))

      await act(async () => {
        await view.result.current.handleRequestBill()
      })

      expect(view.result.current.billRequested).toBe(false)
      expect(view.result.current.error).toBe('bill service down')
    })

    it('payOnline stores the payment request and redirects when a payment_url is returned', async () => {
      const view = await renderReady()
      const result = {
        payment_request: 'PR-1',
        amount: 500,
        currency: 'INR',
        payment_url: 'https://pay.example/pr-1',
        status: 'Requested',
      }
      createPaymentRequestMock.mockResolvedValueOnce(result)
      vi.stubGlobal('location', { ...window.location, href: '' })

      await act(async () => {
        await view.result.current.payOnline()
      })

      expect(view.result.current.paymentRequest).toEqual(result)
      expect(view.result.current.payingOnline).toBe(false)
      expect(window.location.href).toBe('https://pay.example/pr-1')
    })

    it('payOnline surfaces the graceful "not set up" error without redirecting', async () => {
      const view = await renderReady()
      createPaymentRequestMock.mockRejectedValueOnce(new Error("online payment isn't set up yet"))

      await act(async () => {
        await view.result.current.payOnline()
      })

      expect(view.result.current.error).toBe("online payment isn't set up yet")
      expect(view.result.current.paymentRequest).toBeNull()
    })
  })
})

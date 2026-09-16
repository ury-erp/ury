import { beforeEach, describe, expect, it, vi } from 'vitest'

const callGetMock = vi.fn()
const callPostMock = vi.fn()

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: unknown[]) => callGetMock(...args),
    post: (...args: unknown[]) => callPostMock(...args),
  },
}))

import {
  addItems,
  assignDeviceTable,
  bootstrap,
  bootstrapDevice,
  createPaymentRequest,
  getCurrentOrder,
  getCustomerProduct,
  getMenu,
  getPaymentStatus,
  getStatus,
  getStoredContext,
  getStoredSession,
  OrderingContext,
  requestBill,
  sharePaymentLink,
} from './api'

const M = 'ury.ury.api.self_ordering'

const buildContext = (overrides: Partial<OrderingContext> = {}): OrderingContext => ({
  session: 'sess-1',
  source: 'qr',
  restaurant: 'URY Kozhikode',
  company: 'URY',
  table: 'T-1',
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
    add_to_running_table_enabled: false,
  },
  session_idle_timeout_minutes: 30,
  ...overrides,
})

describe('self-order api', () => {
  beforeEach(() => {
    callGetMock.mockReset()
    callPostMock.mockReset()
    sessionStorage.clear()
  })

  describe('bootstrap()', () => {
    it('calls get_ordering_context with a token and persists session+context', async () => {
      const context = buildContext()
      callGetMock.mockResolvedValueOnce({ message: context })

      const result = await bootstrap('tok-123')

      expect(callGetMock).toHaveBeenCalledWith(`${M}.get_ordering_context`, { token: 'tok-123' })
      expect(result).toEqual(context)
      expect(getStoredSession()).toBe('sess-1')
      expect(getStoredContext()).toEqual(context)
    })
  })

  describe('bootstrapDevice()', () => {
    it('calls get_ordering_context with device credentials and persists the result', async () => {
      const context = buildContext({ session: 'sess-device' })
      callGetMock.mockResolvedValueOnce({ message: context })

      const result = await bootstrapDevice('dev-1', 'cred-1')

      expect(callGetMock).toHaveBeenCalledWith(`${M}.get_ordering_context`, {
        device_id: 'dev-1',
        device_credential: 'cred-1',
      })
      expect(result).toEqual(context)
      expect(getStoredSession()).toBe('sess-device')
    })
  })

  describe('assignDeviceTable()', () => {
    it('posts device/staff/table params and persists the returned context', async () => {
      const context = buildContext({ session: 'sess-assigned', table: 'T-5' })
      callPostMock.mockResolvedValueOnce({ message: context })

      const result = await assignDeviceTable('dev-1', 'cred-1', 'pin-9', 'T-5')

      expect(callPostMock).toHaveBeenCalledWith(`${M}.assign_device_table`, {
        device_id: 'dev-1',
        device_credential: 'cred-1',
        staff_pin: 'pin-9',
        table: 'T-5',
      })
      expect(result).toEqual(context)
      expect(getStoredContext()).toEqual(context)
    })
  })

  describe('getStoredContext()', () => {
    it('returns null when nothing is stored', () => {
      expect(getStoredContext()).toBeNull()
    })

    it('returns null (not throw) when stored JSON is corrupt', () => {
      sessionStorage.setItem('ury_order_context', '{not-json')
      expect(getStoredContext()).toBeNull()
    })
  })

  describe('getMenu()', () => {
    it('unwraps the message envelope for get_customer_menu', async () => {
      const menu = { items: [], modified_time: null, name: null }
      callGetMock.mockResolvedValueOnce({ message: menu })

      const result = await getMenu('sess-1')

      expect(callGetMock).toHaveBeenCalledWith(`${M}.get_customer_menu`, { session: 'sess-1' })
      expect(result).toEqual(menu)
    })
  })

  describe('getCurrentOrder()', () => {
    it('unwraps the message envelope for get_customer_order', async () => {
      const order = { invoice: null, items: [], grand_total: 0, billed: false }
      callGetMock.mockResolvedValueOnce({ message: order })

      const result = await getCurrentOrder('sess-1')

      expect(callGetMock).toHaveBeenCalledWith(`${M}.get_customer_order`, { session: 'sess-1' })
      expect(result).toEqual(order)
    })
  })

  describe('addItems()', () => {
    it('serializes items as a JSON string and unwraps the response', async () => {
      const order = { invoice: 'INV-1', items: [], grand_total: 100, billed: false }
      callPostMock.mockResolvedValueOnce({ message: order })

      const items = [{ item: 'ITEM-1', qty: 2, comment: 'no onions' }]
      const result = await addItems('sess-1', items)

      expect(callPostMock).toHaveBeenCalledWith(`${M}.add_customer_items`, {
        session: 'sess-1',
        items: JSON.stringify(items),
      })
      expect(result).toEqual(order)
    })
  })

  describe('getCustomerProduct()', () => {
    it('passes item_code (snake_case) and unwraps the response', async () => {
      const detail = {
        item_code: 'ITEM-1',
        item_name: 'Item 1',
        description: null,
        image: null,
        variants: [],
        addons: [],
      }
      callGetMock.mockResolvedValueOnce({ message: detail })

      const result = await getCustomerProduct('sess-1', 'ITEM-1')

      expect(callGetMock).toHaveBeenCalledWith(`${M}.get_customer_product`, {
        session: 'sess-1',
        item_code: 'ITEM-1',
      })
      expect(result).toEqual(detail)
    })
  })

  describe('requestBill()', () => {
    it('posts session and unwraps the response', async () => {
      const response = { status: 'requested', request: 'REQ-1' }
      callPostMock.mockResolvedValueOnce({ message: response })

      const result = await requestBill('sess-1')

      expect(callPostMock).toHaveBeenCalledWith(`${M}.request_bill`, { session: 'sess-1' })
      expect(result).toEqual(response)
    })
  })

  describe('getStatus()', () => {
    it('gets order status and unwraps the response', async () => {
      const status = { session_status: 'ACTIVE', invoice: null }
      callGetMock.mockResolvedValueOnce({ message: status })

      const result = await getStatus('sess-1')

      expect(callGetMock).toHaveBeenCalledWith(`${M}.get_order_status`, { session: 'sess-1' })
      expect(result).toEqual(status)
    })
  })

  describe('createPaymentRequest()', () => {
    it('posts session and unwraps the payment request result', async () => {
      const payment = { payment_request: 'PR-1', amount: 500, currency: 'INR', payment_url: null, status: 'Initiated' }
      callPostMock.mockResolvedValueOnce({ message: payment })

      const result = await createPaymentRequest('sess-1')

      expect(callPostMock).toHaveBeenCalledWith(`${M}.create_payment_request`, { session: 'sess-1' })
      expect(result).toEqual(payment)
    })
  })

  describe('getPaymentStatus()', () => {
    it('gets payment status and unwraps the response', async () => {
      const status = { status: 'Paid' }
      callGetMock.mockResolvedValueOnce({ message: status })

      const result = await getPaymentStatus('sess-1')

      expect(callGetMock).toHaveBeenCalledWith(`${M}.get_payment_status`, { session: 'sess-1' })
      expect(result).toEqual(status)
    })
  })

  describe('sharePaymentLink()', () => {
    it('posts session and recipient, unwraps the response', async () => {
      const response = { status: 'sent', payment_request: 'PR-1' }
      callPostMock.mockResolvedValueOnce({ message: response })

      const result = await sharePaymentLink('sess-1', '+911234567890')

      expect(callPostMock).toHaveBeenCalledWith(`${M}.share_payment_link`, {
        session: 'sess-1',
        recipient: '+911234567890',
      })
      expect(result).toEqual(response)
    })
  })
})

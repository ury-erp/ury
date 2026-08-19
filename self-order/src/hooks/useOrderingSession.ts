import { useCallback, useEffect, useState } from 'react'
import {
  addItems,
  bootstrap,
  createPaymentRequest,
  getCurrentOrder,
  getMenu,
  getStoredContext,
  requestBill,
  type CustomerOrder,
  type MenuItem,
  type OrderingContext,
  type PaymentRequestResult,
} from '../lib/api'

// Same keys api.ts uses internally for sessionStorage persistence. api.ts
// doesn't expose a clear function (only get/store), so resetSession clears
// them directly here rather than changing api.ts's exported surface.
const SESSION_KEY = 'ury_order_session'
const CONTEXT_KEY = 'ury_order_context'

// `comment`/`variant`/`addons` extend the original `{item, qty}` shape so a
// cart line can carry the per-item note the backend already accepts
// (`add_customer_items`'s `items[].comment`, see api.ts's `addItems`) plus
// the variant/add-on selections a Phase 1 product-detail screen will let
// customers pick. Only `comment` has a server-side field today — `variant`/
// `addons` are carried for display/UI purposes in this cart model and are
// NOT sent to `add_customer_items` (which has no such params); see
// self_ordering.py's `add_customer_items` docstring for the exact payload
// shape it accepts.
export interface CartEntry {
  item: MenuItem
  qty: number
  comment?: string
  variant?: string
  addons?: string[]
}

type Cart = Record<string, CartEntry>

// Screen state machine shared by all 4 layout shells (Mobile/Tablet/
// Landscape Kiosk/Portrait Kiosk) instead of a router — deliberate per the
// plan: react-router-dom is present in package.json but unused, and a
// single hook composed by every layout is simpler than a router shared
// across layout shells that each render a completely different chrome.
export type Screen = 'menu' | 'detail' | 'cart' | 'checkout' | 'status'

function useQueryToken(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('t')
}

/**
 * Owns all the stateful ordering logic shared across layouts: token
 * bootstrap, menu/order loading, cart management, order submission, and
 * bill requests. Layout components consume this hook and are responsible
 * only for rendering.
 *
 * Pass `initialContext` when the caller has already resolved a context
 * through some other bootstrap path (e.g. device-credential bootstrap for
 * a kiosk/tablet, done once in App.tsx before a layout is chosen) — this
 * skips the QR-token/session-resume bootstrap entirely and loads menu/order
 * directly against the given context, so a device only ever bootstraps once.
 */
export function useOrderingSession(initialContext?: OrderingContext) {
  const token = useQueryToken()
  const [context, setContext] = useState<OrderingContext | null>(null)
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [order, setOrder] = useState<CustomerOrder | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [billRequested, setBillRequested] = useState(false)
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequestResult | null>(null)
  const [payingOnline, setPayingOnline] = useState(false)
  const [screen, setScreen] = useState<Screen>('menu')
  // The item a `detail` screen should render for — set by goToDetail,
  // cleared whenever navigation leaves `detail` so a stale item never
  // lingers into the next detail visit.
  const [detailItemCode, setDetailItemCode] = useState<string | null>(null)

  const loadOrder = useCallback(async (session: string) => {
    const current = await getCurrentOrder(session)
    setOrder(current)
  }, [])

  const init = useCallback(async () => {
    setLoading(true)
    try {
      let ctx: OrderingContext
      if (initialContext) {
        ctx = initialContext
      } else if (token) {
        ctx = await bootstrap(token)
      } else {
        const storedContext = getStoredContext()
        if (storedContext) {
          // No fresh token in the URL (e.g. a bookmarked/refreshed page)
          // — reuse the full context saved at bootstrap time, not just
          // the session token, so capabilities/table/layout survive a
          // refresh too. The backend still rejects the session once it
          // actually expires.
          ctx = storedContext
        } else {
          setError('This link is missing an ordering code. Please rescan the QR code on your table.')
          setLoading(false)
          return
        }
      }
      setContext(ctx)
      const menuResponse = await getMenu(ctx.session)
      setMenu(menuResponse.items.filter((item) => !item.disabled))
      await loadOrder(ctx.session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the menu. Please rescan the QR code.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContext, token])

  useEffect(() => {
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Manual "start a fresh order" action — the MVP alternative to an
   * auto-idle-reset timer (not wired up yet). Always clears the cart and
   * any in-memory order/payment/bill state, and always clears both
   * sessionStorage keys so a stale session/context can never leak into the
   * next customer.
   *
   * For device-bootstrapped sessions (kiosk/tablet — `initialContext` was
   * passed to the hook) there's a durable device credential behind the
   * context, so we can immediately re-bootstrap a fresh session via `init`
   * without sending the customer back through a QR scan.
   *
   * For QR/link-based sessions there is no device credential to re-derive
   * a session from — clearing storage here means the next `init` run finds
   * neither a token override nor a stored context, so the hook falls back
   * to its normal "missing ordering code" error state and the customer (or
   * staff) must rescan/re-open the link. That is the correct outcome, not
   * a bug: a QR session's only source of truth is the token in the URL.
   */
  const resetSession = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(CONTEXT_KEY)
    setCart({})
    setOrder(null)
    setBillRequested(false)
    setPaymentRequest(null)
    setPayingOnline(false)
    setSubmitting(false)
    setError(null)
    setContext(null)
    setMenu([])
    setScreen('menu')
    setDetailItemCode(null)
    init()
  }, [init])

  function addToCart(
    item: MenuItem,
    options?: { comment?: string; variant?: string; addons?: string[] },
  ) {
    setCart((prev) => {
      const existing = prev[item.item]
      return {
        ...prev,
        [item.item]: {
          item,
          qty: (existing?.qty ?? 0) + 1,
          comment: options?.comment ?? existing?.comment,
          variant: options?.variant ?? existing?.variant,
          addons: options?.addons ?? existing?.addons,
        },
      }
    })
  }

  // --- screen navigation -----------------------------------------------
  function goToMenu() {
    setDetailItemCode(null)
    setScreen('menu')
  }

  function goToDetail(itemCode: string) {
    setDetailItemCode(itemCode)
    setScreen('detail')
  }

  function goToCart() {
    setScreen('cart')
  }

  function goToCheckout() {
    setScreen('checkout')
  }

  function goToStatus() {
    setScreen('status')
  }

  function decrementCart(itemCode: string) {
    setCart((prev) => {
      const existing = prev[itemCode]
      if (!existing) return prev
      if (existing.qty <= 1) {
        const rest = { ...prev }
        delete rest[itemCode]
        return rest
      }
      return { ...prev, [itemCode]: { ...existing, qty: existing.qty - 1 } }
    })
  }

  const cartItems = Object.values(cart)
  const cartCount = cartItems.reduce((sum, entry) => sum + entry.qty, 0)
  const cartTotal = cartItems.reduce((sum, entry) => sum + entry.qty * entry.item.rate, 0)

  async function submitCart() {
    if (!context || cartItems.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = cartItems.map((entry) => ({
        item: entry.item.item,
        qty: entry.qty,
        comment: entry.comment,
      }))
      const updated = await addItems(context.session, payload)
      setOrder(updated)
      setCart({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place the order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestBill() {
    if (!context) return
    try {
      await requestBill(context.session)
      setBillRequested(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request the bill. Please ask staff for help.')
    }
  }

  async function payOnline() {
    if (!context) return
    setPayingOnline(true)
    setError(null)
    try {
      const result = await createPaymentRequest(context.session)
      setPaymentRequest(result)
      if (result.payment_url) {
        window.location.href = result.payment_url
      }
    } catch (err) {
      // Includes the graceful "online payment isn't set up yet" case from
      // the backend — surfaced as a normal error message, not a crash.
      setError(err instanceof Error ? err.message : 'Could not start online payment. Please pay at the counter.')
    } finally {
      setPayingOnline(false)
    }
  }

  return {
    context,
    menu,
    order,
    cart,
    loading,
    submitting,
    error,
    billRequested,
    paymentRequest,
    payingOnline,
    addToCart,
    decrementCart,
    submitCart,
    handleRequestBill,
    payOnline,
    resetSession,
    cartItems,
    cartCount,
    cartTotal,
    // Screen state machine
    screen,
    setScreen,
    detailItemCode,
    goToMenu,
    goToDetail,
    goToCart,
    goToCheckout,
    goToStatus,
  }
}

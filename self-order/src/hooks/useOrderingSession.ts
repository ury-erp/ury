import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addItems,
  bootstrap,
  createPaymentRequest,
  getCurrentOrder,
  getMenu,
  getStoredContext,
  bootstrapDevice,
  callWaiter,
  getStatus,
  requestBill,
  type BillStatus,
  type CustomerOrder,
  type MenuItem,
  type OrderingContext,
  type KitchenStatus,
  type PaymentRequestResult,
  type WaiterStatus,
} from '../lib/api'
import { parseFrappeError } from '@ury/core'
import { t } from '../i18n'
import { clearCartDraft, restoreCartDraft, saveCartDraft, type Cart } from '../lib/cart-draft'

// Same keys api.ts uses internally for sessionStorage persistence. api.ts
// doesn't expose a clear function (only get/store), so resetSession clears
// them directly here rather than changing api.ts's exported surface.
// Same keys useDeviceBootstrap writes. Read here so a reset can mint a new
// session from the device rather than replaying the context it was handed.
const DEVICE_ID_KEY = 'ury_device_id'
const DEVICE_CREDENTIAL_KEY = 'ury_device_credential'

function readDeviceCredentials(): { id: string; credential: string } | null {
  try {
    const id = localStorage.getItem(DEVICE_ID_KEY)
    const credential = localStorage.getItem(DEVICE_CREDENTIAL_KEY)
    return id && credential ? { id, credential } : null
  } catch {
    // Blocked storage — this is not a provisioned device as far as we know.
    return null
  }
}

// Slow enough to be invisible on a busy site, quick enough that a customer
// looking at their screen sees the counter answer them.
const BILL_POLL_INTERVAL_MS = 8000

const SESSION_KEY = 'ury_order_session'
const CONTEXT_KEY = 'ury_order_context'

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
  // Read once per mount: a provisioned device's credential does not change
  // mid-session, and re-reading storage on every render would churn `init`.
  const [deviceCredentials] = useState(readDeviceCredentials)
  const [context, setContext] = useState<OrderingContext | null>(null)
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [order, setOrder] = useState<CustomerOrder | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [billRequested, setBillRequested] = useState(false)
  const [billStatus, setBillStatus] = useState<BillStatus | null>(null)
  const [waiterStatus, setWaiterStatus] = useState<WaiterStatus | null>(null)
  const [kitchenStatus, setKitchenStatus] = useState<KitchenStatus | null>(null)
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequestResult | null>(null)
  const [payingOnline, setPayingOnline] = useState(false)

  const mutationPending = useRef(false)
  const generation = useRef(0)

  const init = useCallback(async (options?: { freshSession?: boolean }) => {
    const currentGeneration = ++generation.current
    setLoading(true)
    setError(null)
    try {
      let ctx: OrderingContext
      if (initialContext && !options?.freshSession) {
        ctx = initialContext
      } else if (options?.freshSession && deviceCredentials) {
        // A kiosk starting a new order must not inherit the last customer's
        // session. `initialContext` is a fixed object captured at device
        // bootstrap, so reusing it handed the next person the previous
        // person's session token — and with it their open order (UX-18).
        // The device credential is durable, so a fresh session is one call
        // away and no QR scan is needed.
        ctx = await bootstrapDevice(deviceCredentials.id, deviceCredentials.credential)
      } else if (!options?.freshSession && getStoredContext(token)) {
        ctx = getStoredContext(token)!
      } else if (token) {
        ctx = await bootstrap(token)
      } else {
        const storedContext = options?.freshSession ? null : getStoredContext()
        if (storedContext) {
          // No fresh token in the URL (e.g. a bookmarked/refreshed page)
          // — reuse the full context saved at bootstrap time, not just
          // the session token, so capabilities/table/layout survive a
          // refresh too. The backend still rejects the session once it
          // actually expires.
          ctx = storedContext
        } else {
          setError(t('errors.missing_code'))
          setLoading(false)
          return
        }
      }
      if (currentGeneration !== generation.current) return
      const menuResponse = await getMenu(ctx.session)
      const currentOrder = await getCurrentOrder(ctx.session)
      // A refresh must not lose the fact that the bill was already asked
      // for: without this the page would come back showing the button as
      // if nothing had been requested, and the polling that carries the
      // counter's answer would never start.
      const status = await getStatus(ctx.session).catch(() => null)
      if (currentGeneration !== generation.current) return
      const currentMenu = menuResponse.items.filter((item) => !item.disabled)
      setContext(ctx)
      setMenu(currentMenu)
      setOrder(currentOrder)
      setBillStatus(status?.bill_status ?? null)
      setBillRequested(Boolean(status?.bill_status))
      setWaiterStatus(status?.waiter_status ?? null)
      setKitchenStatus(status?.kitchen_status ?? null)
      setCart(restoreCartDraft(ctx.session, currentMenu))
    } catch (err) {
      if (currentGeneration === generation.current) setError(parseFrappeError(err, t('errors.menu_failed')))
    } finally {
      if (currentGeneration === generation.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContext, token, deviceCredentials])

  useEffect(() => {
    init()
    return () => { generation.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (context && !loading) saveCartDraft(context.session, cart)
  }, [context, cart, loading])

  /**
   * Poll the order's status while the customer is waiting for a bill.
   *
   * The customer's page runs as a Guest, so it cannot join the realtime
   * rooms the POS listens on — polling is the only channel back from the
   * counter. It runs only between "bill requested" and "bill printed", so
   * a table that has not asked for anything makes no extra requests.
   */
  useEffect(() => {
    // Poll while anything is still in flight: food on its way, a bill that
    // has not been printed, or a waiter who has not arrived. A table with
    // nothing outstanding makes no requests at all.
    const waitingOnBill = billStatus && billStatus !== 'printed'
    const waitingOnFood = kitchenStatus && kitchenStatus !== 'ready'
    if (!context || (!waitingOnBill && !waiterStatus && !waitingOnFood)) return

    let cancelled = false
    const session = context.session

    const tick = async () => {
      try {
        const status = await getStatus(session)
        if (cancelled) return
        if (status.bill_status) setBillStatus(status.bill_status)
        setWaiterStatus(status.waiter_status ?? null)
        setKitchenStatus(status.kitchen_status ?? null)
        if (status.billed) setOrder((prev) => (prev ? { ...prev, billed: true } : prev))
      } catch {
        // A dropped poll is not worth showing the customer an error over —
        // the next tick will pick the state up.
      }
    }

    const timer = window.setInterval(tick, BILL_POLL_INTERVAL_MS)
    tick()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [context, billStatus, waiterStatus, kitchenStatus])

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
    // Protect checkout even from an idle callback captured before checkout began.
    if (mutationPending.current) return
    clearCartDraft()
    try {
      sessionStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(CONTEXT_KEY)
      sessionStorage.removeItem('ury_order_qr_token')
    } catch { /* Storage may be blocked. */ }
    setCart({})
    setOrder(null)
    setBillRequested(false)
    setBillStatus(null)
    setWaiterStatus(null)
    setKitchenStatus(null)
    setPaymentRequest(null)
    setPayingOnline(false)
    setSubmitting(false)
    setError(null)
    setContext(null)
    setMenu([])
    init({ freshSession: true })
  }, [init])

  function addToCart(item: MenuItem, comment?: string) {
    setCart((prev) => {
      const existing = prev[item.item]
      return { ...prev, [item.item]: { item, qty: (existing?.qty ?? 0) + 1, comment: comment ?? existing?.comment } }
    })
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

  /** Resolves true only when the order actually reached the server. */
  async function submitCart(): Promise<boolean> {
    if (!context || cartItems.length === 0 || mutationPending.current) return false
    mutationPending.current = true
    const currentGeneration = generation.current
    setSubmitting(true)
    setError(null)
    try {
      const payload = cartItems.map((entry) => ({ item: entry.item.item, qty: entry.qty, comment: entry.comment }))
      const updated = await addItems(context.session, payload)
      if (currentGeneration !== generation.current) return false
      setOrder(updated)
      // The food is now the kitchen's, so start watching for it.
      setKitchenStatus((prev) => prev ?? 'queued')
      // Cleared only after a confirmed success. On failure the guest keeps
      // what they chose and can retry, instead of rebuilding a cart they
      // already built once (UX-20).
      // Keep any additional selections made while this request was in flight.
      setCart((current) => {
        const remaining = { ...current }
        for (const entry of cartItems) {
          const live = remaining[entry.item.item]
          if (!live) continue
          if (live.qty <= entry.qty) delete remaining[entry.item.item]
          else remaining[entry.item.item] = { ...live, qty: live.qty - entry.qty }
        }
        return remaining
      })
      return true
    } catch (err) {
      if (currentGeneration === generation.current) setError(parseFrappeError(err, t('errors.order_failed')))
      return false
    } finally {
      mutationPending.current = false
      if (currentGeneration === generation.current) setSubmitting(false)
    }
  }

  async function handleRequestBill() {
    if (!context) return
    try {
      await requestBill(context.session)
      setBillRequested(true)
      setBillStatus('requested')
    } catch (err) {
      setError(parseFrappeError(err, t('errors.bill_failed')))
    }
  }

  async function handleCallWaiter() {
    if (!context) return
    // Set optimistically: the whole value of this button is that the table
    // sees, immediately, that the call went somewhere. Rolled back on failure
    // so nobody sits waiting for staff who were never told.
    setWaiterStatus('called')
    try {
      await callWaiter(context.session)
    } catch (err) {
      setWaiterStatus(null)
      setError(parseFrappeError(err, t('errors.waiter_failed')))
    }
  }

  async function payOnline() {
    if (!context || mutationPending.current) return
    mutationPending.current = true
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
      setError(parseFrappeError(err, t('errors.payment_failed')))
    } finally {
      mutationPending.current = false
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
    billStatus,
    waiterStatus,
    kitchenStatus,
    paymentRequest,
    payingOnline,
    addToCart,
    decrementCart,
    submitCart,
    handleRequestBill,
    handleCallWaiter,
    payOnline,
    resetSession,
    cartItems,
    cartCount,
    cartTotal,
  }
}

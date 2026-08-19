import { useCallback, useEffect, useState } from 'react'
import {
  addItems,
  bootstrap,
  getCurrentOrder,
  getMenu,
  getStoredSession,
  requestBill,
  type CustomerOrder,
  type MenuItem,
  type OrderingContext,
} from '../lib/api'

type Cart = Record<string, { item: MenuItem; qty: number }>

function useQueryToken(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('t')
}

/**
 * Owns all the stateful ordering logic shared across layouts: token
 * bootstrap, menu/order loading, cart management, order submission, and
 * bill requests. Layout components consume this hook and are responsible
 * only for rendering.
 */
export function useOrderingSession() {
  const token = useQueryToken()
  const [context, setContext] = useState<OrderingContext | null>(null)
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [order, setOrder] = useState<CustomerOrder | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [billRequested, setBillRequested] = useState(false)

  const loadOrder = useCallback(async (session: string) => {
    const current = await getCurrentOrder(session)
    setOrder(current)
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const existingSession = getStoredSession()
        let ctx: OrderingContext
        if (token) {
          ctx = await bootstrap(token)
        } else if (existingSession) {
          // No fresh token in the URL (e.g. a bookmarked/refreshed page) —
          // reuse whatever session is still active; the backend will reject
          // it once it actually expires.
          ctx = { session: existingSession } as OrderingContext
        } else {
          setError('This link is missing an ordering code. Please rescan the QR code on your table.')
          setLoading(false)
          return
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
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev[item.item]
      return { ...prev, [item.item]: { item, qty: (existing?.qty ?? 0) + 1 } }
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

  async function submitCart() {
    if (!context || cartItems.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = cartItems.map((entry) => ({ item: entry.item.item, qty: entry.qty }))
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

  return {
    context,
    menu,
    order,
    cart,
    loading,
    submitting,
    error,
    billRequested,
    addToCart,
    decrementCart,
    submitCart,
    handleRequestBill,
    cartItems,
    cartCount,
    cartTotal,
  }
}

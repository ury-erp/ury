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
} from './lib/api'

type Cart = Record<string, { item: MenuItem; qty: number }>

function useQueryToken(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('t')
}

function App() {
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading menu…
      </div>
    )
  }

  if (error && !context) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">
          {context?.table ? `Table ${context.table}` : 'Order for Pickup'}
        </h1>
      </header>

      {error && (
        <div className="mx-4 mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {order && order.items.length > 0 && (
        <section className="mx-4 mt-4 rounded-lg border p-3">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Your order so far</h2>
          <ul className="space-y-1 text-sm">
            {order.items.map((row, idx) => (
              <li key={`${row.item_code}-${idx}`} className="flex justify-between">
                <span>{row.item_name} × {row.qty}</span>
                <span>{row.amount}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold">
            <span>Total</span>
            <span>{order.grand_total}</span>
          </div>
          {context?.capabilities.request_bill_enabled && !order.billed && (
            <button
              className="mt-3 w-full rounded-md border py-2 text-sm font-medium disabled:opacity-50"
              disabled={billRequested}
              onClick={handleRequestBill}
            >
              {billRequested ? 'Bill requested — staff notified' : 'Request Bill'}
            </button>
          )}
        </section>
      )}

      <section className="mx-4 mt-4 grid grid-cols-2 gap-3">
        {menu.map((item) => (
          <button
            key={item.item}
            onClick={() => addToCart(item)}
            className="flex flex-col overflow-hidden rounded-lg border text-left transition active:scale-[0.98]"
          >
            {context?.capabilities.show_item_images && item.item_image && (
              <img src={item.item_image} alt={item.item_name} className="h-24 w-full object-cover" />
            )}
            <div className="p-2">
              <div className="text-sm font-medium">{item.item_name}</div>
              <div className="text-sm text-muted-foreground">{item.rate}</div>
              {cart[item.item] && (
                <div className="mt-1 text-xs font-semibold text-primary">In cart: {cart[item.item].qty}</div>
              )}
            </div>
          </button>
        ))}
      </section>

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
          <ul className="mb-2 max-h-32 space-y-1 overflow-y-auto text-sm">
            {cartItems.map((entry) => (
              <li key={entry.item.item} className="flex items-center justify-between">
                <span>{entry.item.item_name}</span>
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => decrementCart(entry.item.item)}
                    className="h-6 w-6 rounded-full border text-xs leading-none"
                    aria-label={`Remove one ${entry.item.item_name}`}
                  >
                    −
                  </button>
                  {entry.qty}
                  <button
                    onClick={() => addToCart(entry.item)}
                    className="h-6 w-6 rounded-full border text-xs leading-none"
                    aria-label={`Add one more ${entry.item.item_name}`}
                  >
                    +
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>{cartCount} item{cartCount > 1 ? 's' : ''}</span>
            <span>{cartTotal}</span>
          </div>
          <button
            onClick={submitCart}
            disabled={submitting}
            className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Placing order…' : 'Place Order'}
          </button>
        </div>
      )}
    </div>
  )
}

export default App

import { useOrderingSession } from '../hooks/useOrderingSession'
import type { OrderingContext } from '../lib/api'

interface LayoutProps {
  initialContext?: OrderingContext
}

function MobileQRLayout({ initialContext }: LayoutProps) {
  const {
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
  } = useOrderingSession(initialContext)

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

export default MobileQRLayout

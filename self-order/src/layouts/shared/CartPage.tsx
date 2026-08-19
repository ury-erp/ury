import type { CartEntry } from '../../hooks/useOrderingSession'
import type { MenuItem } from '../../lib/api'

interface CartPageProps {
  cartItems: CartEntry[]
  cartCount: number
  cartTotal: number
  itemNotesEnabled?: boolean
  onIncrement: (item: MenuItem) => void
  onDecrement: (itemCode: string) => void
  onBack: () => void
  onCheckout: () => void
  className?: string
}

/**
 * Full-screen cart view — the Phase-2 alternative to CartPanel's always-on
 * side panel / MobileQRLayout's bottom sheet. Controlled component: all
 * cart state and navigation lives in useOrderingSession, this component
 * only renders it and forwards user actions via callbacks, mirroring
 * CartPanel's prop shape (`cartItems`/`cartCount`/`cartTotal`/
 * `onIncrement`/`onDecrement`) so layouts can swap between panel and
 * full-page presentation with minimal glue code.
 */
function CartPage({
  cartItems,
  cartCount,
  cartTotal,
  itemNotesEnabled = false,
  onIncrement,
  onDecrement,
  onBack,
  onCheckout,
  className,
}: CartPageProps) {
  return (
    <div className={className ?? 'flex h-full flex-col'}>
      <header className="flex items-center gap-2 border-b p-4">
        <button
          onClick={onBack}
          className="rounded-md border px-3 py-2 text-sm font-medium"
          aria-label="Back to menu"
        >
          ← Back to menu
        </button>
        <h1 className="flex-1 text-center text-lg font-semibold">Your Cart</h1>
        <span className="w-[92px]" aria-hidden="true" />
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {cartItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-muted-foreground">Your cart is empty.</p>
            <button onClick={onBack} className="rounded-md border px-4 py-2 text-sm font-medium">
              Browse the menu
            </button>
          </div>
        ) : (
          <ul className="space-y-3 text-sm">
            {cartItems.map((entry) => (
              <li key={entry.item.item} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex-1 font-medium">{entry.item.item_name}</span>
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => onDecrement(entry.item.item)}
                      className="h-7 w-7 rounded-full border text-sm leading-none"
                      aria-label={`Remove one ${entry.item.item_name}`}
                    >
                      −
                    </button>
                    <span className="w-4 text-center">{entry.qty}</span>
                    <button
                      onClick={() => onIncrement(entry.item)}
                      className="h-7 w-7 rounded-full border text-sm leading-none"
                      aria-label={`Add one more ${entry.item.item_name}`}
                    >
                      +
                    </button>
                  </span>
                </div>
                {itemNotesEnabled && entry.comment && (
                  <p className="mt-1 text-xs text-muted-foreground">Note: {entry.comment}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t p-4">
        <div className="mb-3 flex items-center justify-between text-sm font-semibold">
          <span>
            {cartCount} item{cartCount !== 1 ? 's' : ''}
          </span>
          <span>{cartTotal}</span>
        </div>
        <button
          onClick={onCheckout}
          disabled={cartCount === 0}
          className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50"
        >
          Proceed to checkout
        </button>
      </div>
    </div>
  )
}

export default CartPage

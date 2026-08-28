import { useOrderingSession } from '../hooks/useOrderingSession'
import type { OrderingContext } from '../lib/api'
import CartPanel from './shared/CartPanel'
import MenuGrid from './shared/MenuGrid'

interface LayoutProps {
  initialContext?: OrderingContext
}

/**
 * Two-pane layout for a tablet, portrait or landscape, handed to a customer
 * or fixed at a table. Left/main pane is a scrollable menu grid; right pane
 * is a persistent order summary + cart (not a bottom sheet like
 * MobileQRLayout — always visible, no toggle).
 */
function TabletLayout({ initialContext }: LayoutProps) {
  const {
    context,
    menu,
    order,
    cart,
    loading,
    submitting,
    error,
    billRequested,
    payingOnline,
    addToCart,
    decrementCart,
    submitCart,
    handleRequestBill,
    payOnline,
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
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-b bg-background/95 px-6 py-4">
        <h1 className="text-xl font-semibold">
          {context?.table ? `Table ${context.table}` : 'Order for Pickup'}
        </h1>
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="w-[68%] overflow-y-auto p-6">
          <MenuGrid
            menu={menu}
            cart={cart}
            capabilities={context?.capabilities}
            onAdd={addToCart}
            gridClassName="grid grid-cols-3 gap-4 lg:grid-cols-4"
            cardClassName="flex min-w-[150px] flex-col overflow-hidden rounded-xl border text-left transition active:scale-[0.98]"
            imageClassName="h-32 w-full object-cover"
            branch={context?.restaurant}
          />
        </main>

        <CartPanel
          context={context}
          order={order}
          cartItems={cartItems}
          cartCount={cartCount}
          cartTotal={cartTotal}
          submitting={submitting}
          billRequested={billRequested}
          payingOnline={payingOnline}
          onIncrement={addToCart}
          onDecrement={decrementCart}
          onSubmit={submitCart}
          onRequestBill={handleRequestBill}
          onPayOnline={payOnline}
          className="flex w-[32%] flex-col overflow-hidden border-l bg-background p-4"
        />
      </div>
    </div>
  )
}

export default TabletLayout

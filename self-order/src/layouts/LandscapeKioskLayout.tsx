import { useOrderingSession } from '../hooks/useOrderingSession'
import type { OrderingContext } from '../lib/api'
import CartPanel from './shared/CartPanel'
import MenuGrid from './shared/MenuGrid'

interface LayoutProps {
  initialContext?: OrderingContext
}

/**
 * Large horizontally-oriented self-service kiosk screen (entrance /
 * counter / food-court) — used standing, at arm's length, by an unassisted
 * customer. Wider menu grid than TabletLayout (more columns, bigger touch
 * targets, more spacing) with a persistent cart panel always visible on the
 * right so the order is a one-glance affair. Pure presentation over
 * useOrderingSession — no table selector, device provisioning, or
 * idle-timeout UI here.
 */
function LandscapeKioskLayout({ initialContext }: LayoutProps) {
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
      <div className="flex min-h-screen items-center justify-center text-xl text-muted-foreground">
        Loading menu…
      </div>
    )
  }

  if (error && !context) {
    return (
      <div className="flex min-h-screen items-center justify-center p-10 text-center text-xl text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden text-lg">
      <header className="border-b bg-background/95 px-10 py-6">
        <h1 className="text-3xl font-semibold">
          {context?.table ? `Table ${context.table}` : 'Order for Pickup'}
        </h1>
      </header>

      {error && (
        <div className="mx-10 mt-4 rounded-md bg-destructive/10 p-4 text-base text-destructive">{error}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-10">
          <MenuGrid
            menu={menu}
            cart={cart}
            capabilities={context?.capabilities}
            onAdd={addToCart}
            gridClassName="grid grid-cols-4 gap-6 xl:grid-cols-5"
            cardClassName="flex min-w-[180px] flex-col overflow-hidden rounded-2xl border text-left text-lg transition active:scale-[0.97]"
            imageClassName="h-40 w-full object-cover"
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
          onIncrement={addToCart}
          onDecrement={decrementCart}
          onSubmit={submitCart}
          onRequestBill={handleRequestBill}
          className="flex w-[420px] shrink-0 flex-col overflow-hidden border-l bg-background p-6 text-base"
        />
      </div>
    </div>
  )
}

export default LandscapeKioskLayout

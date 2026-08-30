import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@ury/ui'
import { useIdleReset } from '../hooks/useIdleReset'
import { useOrderingSession } from '../hooks/useOrderingSession'
import type { OrderingContext } from '../lib/api'
import CartPanel from './shared/CartPanel'
import MenuGrid from './shared/MenuGrid'

const IDLE_RESET_GRACE_MS = 15000

interface LayoutProps {
  initialContext?: OrderingContext
}

/**
 * Large horizontally-oriented self-service kiosk screen (entrance /
 * counter / food-court) — used standing, at arm's length, by an unassisted
 * customer. Wider menu grid than TabletLayout (more columns, bigger touch
 * targets, more spacing) with a persistent cart panel always visible on the
 * right so the order is a one-glance affair. Pure presentation over
 * useOrderingSession — no table selector or device provisioning here.
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
  } = useOrderingSession(initialContext)

  const [showIdleWarning, setShowIdleWarning] = useState(false)
  const idleResetTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const idleWarnMs = (context?.session_idle_timeout_minutes ?? 30) * 60000

  function handleReset() {
    if (window.confirm('Start a new order? Current cart will be cleared.')) {
      resetSession()
    }
  }

  // Unattended-kiosk protection: warn after idleWarnMs of no interaction,
  // then reset after an additional IDLE_RESET_GRACE_MS if the guest doesn't
  // respond. Never fires mid-checkout — submitting/payingOnline gate both
  // the warning and the reset itself.
  useIdleReset(() => {
    if (submitting || payingOnline) return
    setShowIdleWarning(true)
    idleResetTimerRef.current = setTimeout(() => {
      setShowIdleWarning(false)
      if (!submitting && !payingOnline) {
        resetSession()
      }
    }, IDLE_RESET_GRACE_MS)
  }, idleWarnMs)

  function handleStillHere() {
    clearTimeout(idleResetTimerRef.current)
    setShowIdleWarning(false)
  }

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
      <header className="flex items-center justify-between border-b bg-background/95 px-10 py-6">
        <h1 className="text-3xl font-semibold">
          {context?.table ? `Table ${context.table}` : 'Order for Pickup'}
        </h1>
        <button
          onClick={handleReset}
          className="rounded-md border px-4 py-2 text-base font-medium text-muted-foreground"
        >
          New Order
        </button>
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
          className="flex w-[420px] shrink-0 flex-col overflow-hidden border-l bg-background p-6 text-base"
        />
      </div>

      <Dialog open={showIdleWarning} onOpenChange={(open) => !open && handleStillHere()}>
        <DialogContent onClose={handleStillHere}>
          <DialogHeader>
            <DialogTitle>Still there?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={handleStillHere}
              className="w-full rounded-md bg-primary py-3 text-base font-medium text-primary-foreground"
            >
              I'm still here
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default LandscapeKioskLayout

import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@ury/ui'
import { useIdleReset } from '../hooks/useIdleReset'
import { useOrderingSession } from '../hooks/useOrderingSession'
import type { OrderingContext } from '../lib/api'
import CartPanel from './shared/CartPanel'
import MenuGrid from './shared/MenuGrid'
import { useMenuDiscovery } from '../hooks/useMenuDiscovery'
import { MenuDiscoveryBar } from '../components/MenuDiscoveryBar'
import { t } from '../i18n'
import { LanguageToggle } from '../components/LanguageToggle'

const IDLE_WARN_MS = 60000
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
    billStatus,
    waiterStatus,
    kitchenStatus,
    handleCallWaiter,
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
  // Same search and course filtering as every other ordering surface,
  // so finding a dish does not depend on which screen the guest is at.
  const discovery = useMenuDiscovery(menu)
  const idleResetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleReset() {
    if (window.confirm(t('order.confirm_restart'))) {
      resetSession()
    }
  }

  // Unattended-kiosk protection: warn after IDLE_WARN_MS of no interaction,
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
  }, IDLE_WARN_MS)

  function handleStillHere() {
    clearTimeout(idleResetTimerRef.current)
    setShowIdleWarning(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xl text-muted-foreground">
        {t('order.loading_menu')}
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
          {context?.table ? t('order.table', { table: context.table }) : t('order.for_pickup')}
        </h1>
        <div className="flex items-center gap-3">
          <LanguageToggle />
        <button
          onClick={handleReset}
          className="rounded-md border px-4 py-2 text-base font-medium text-muted-foreground"
        >
          {t('order.new_order')}
        </button>
        </div>
      </header>

      {error && (
        <div className="mx-10 mt-4 rounded-md bg-destructive/10 p-4 text-base text-destructive">{error}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-10">
          <div className="mb-5">
            <MenuDiscoveryBar discovery={discovery} size="large" />
          </div>

          <MenuGrid
            menu={discovery.visibleMenu}
            cart={cart}
            capabilities={context?.capabilities}
            onAdd={addToCart}
            gridClassName="grid grid-cols-2 gap-6 xl:grid-cols-3 2xl:grid-cols-4"
            cardClassName="flex min-w-0 flex-col overflow-hidden rounded-2xl border text-start text-lg transition active:scale-[0.97]"
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
          billStatus={billStatus}
          waiterStatus={waiterStatus}
          kitchenStatus={kitchenStatus}
          onCallWaiter={handleCallWaiter}
          payingOnline={payingOnline}
          onIncrement={addToCart}
          onDecrement={decrementCart}
          onSubmit={submitCart}
          onRequestBill={handleRequestBill}
          onPayOnline={payOnline}
          className="flex w-[420px] shrink-0 flex-col overflow-hidden border-s bg-background p-6 text-base"
        />
      </div>

      <Dialog open={showIdleWarning} onOpenChange={(open) => !open && handleStillHere()}>
        <DialogContent onClose={handleStillHere}>
          <DialogHeader>
            <DialogTitle>{t('idle.title')}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={handleStillHere}
              className="w-full rounded-md bg-primary py-3 text-base font-medium text-primary-foreground"
            >
              {t('idle.confirm')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default LandscapeKioskLayout

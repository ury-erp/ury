import { useMemo, useState } from 'react'
import { useIdleReset } from '../hooks/useIdleReset'
import { useOrderingSession } from '../hooks/useOrderingSession'
import type { MenuItem, OrderingContext } from '../lib/api'
import CartPanel from './shared/CartPanel'
import CategoryTabs from './shared/CategoryTabs'
import MenuGrid from './shared/MenuGrid'
import ProductDetail from './shared/ProductDetail'
import SearchBar from './shared/SearchBar'

interface LayoutProps {
  initialContext?: OrderingContext
}

/**
 * Two-pane layout for a tablet, portrait or landscape, handed to a customer
 * or fixed at a table. Left/main pane shows category tabs + search + menu grid,
 * with product-detail support (modal/overlay or replaces grid temporarily).
 * Right pane is a persistent order summary + cart (not a bottom sheet like
 * MobileQRLayout — always visible, no toggle).
 *
 * Checkout and status remain inline in the CartPanel (persistent side panel
 * retains the two-pane advantage, rather than swapping to full-screen flows).
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
    screen,
    detailItemCode,
    addToCart,
    decrementCart,
    submitCart,
    handleRequestBill,
    payOnline,
    resetSession,
    cartItems,
    cartCount,
    cartTotal,
    goToMenu,
    goToDetail,
  } = useOrderingSession(initialContext)

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  /**
   * Extract unique categories from menu items (course/course_label).
   * Matches PortraitKioskLayout's category logic per the PLAN.
   */
  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of menu) {
      const key = item.course ?? 'Uncategorized'
      if (!seen.has(key)) {
        seen.set(key, item.course_label ?? key)
      }
    }
    return Array.from(seen.entries()).map(([course, course_label]) => ({
      course,
      course_label,
    }))
  }, [menu])

  /**
   * Filter menu by active category and search term.
   */
  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      const matchesCategory =
        selectedCategory === null || (item.course ?? 'Uncategorized') === selectedCategory
      const matchesSearch =
        searchTerm === '' ||
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [menu, selectedCategory, searchTerm])

  /**
   * Handle product card click: if product_detail_enabled, navigate to detail
   * screen; otherwise, add directly to cart.
   */
  const handleProductCardClick = (item: MenuItem) => {
    if (context?.capabilities.product_detail_enabled) {
      goToDetail(item.item)
    } else {
      addToCart(item)
    }
  }

  const handleReset = () => {
    if (window.confirm('Start a new order? Current cart will be cleared.')) {
      resetSession()
    }
  }

  // Idle-reset: covers both the fixed-table tablet case (device-bootstrapped,
  // resetSession re-bootstraps immediately from initialContext) and the
  // portable-tablet case reached via PortableTabletAssignment (also
  // device-bootstrapped by the time this layout renders, since assignment
  // already happened) — either way resetSession's existing device/QR
  // distinction is the right behavior, no branch needed here.
  useIdleReset(resetSession, (context?.session_idle_timeout_minutes ?? 30) * 60000)

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

  // Find the menu item being displayed in detail view
  const currentMenuItem = detailItemCode
    ? menu.find((m) => m.item === detailItemCode)
    : null

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b bg-background/95 px-6 py-4">
        <h1 className="text-xl font-semibold">
          {context?.table ? `Table ${context.table}` : 'Order for Pickup'}
        </h1>
        <button
          onClick={handleReset}
          className="rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground"
        >
          New Order
        </button>
      </header>

      {error && (
        <div className="mx-6 mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="w-[68%] overflow-y-auto">
          {screen === 'detail' && currentMenuItem ? (
            <ProductDetail
              session={context!.session}
              itemCode={detailItemCode!}
              menuItem={currentMenuItem}
              onAddToCart={addToCart}
              onBack={goToMenu}
            />
          ) : (
            <div className="flex h-full flex-col p-6">
              <CategoryTabs
                categories={categories}
                activeCourse={selectedCategory}
                onSelect={setSelectedCategory}
              />
              <div className="mb-4 mt-3">
                <SearchBar value={searchTerm} onChange={setSearchTerm} />
              </div>
              <MenuGrid
                menu={filteredMenu}
                cart={cart}
                capabilities={context?.capabilities}
                onAdd={handleProductCardClick}
                gridClassName="grid grid-cols-3 gap-4 lg:grid-cols-4"
                cardClassName="flex min-w-[150px] flex-col overflow-hidden rounded-xl border text-left transition active:scale-[0.98]"
                imageClassName="h-32 w-full object-cover"
              />
            </div>
          )}
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

import { useMemo, useState } from 'react'
import { useIdleReset } from '../hooks/useIdleReset'
import { useOrderingSession } from '../hooks/useOrderingSession'
import type { OrderingContext } from '../lib/api'
import CartPanel from './shared/CartPanel'
import CartPage from './shared/CartPage'
import CategoryTabs from './shared/CategoryTabs'
import CheckoutScreen from './shared/CheckoutScreen'
import OrderStatusScreen from './shared/OrderStatusScreen'
import ProductCard from './shared/ProductCard'
import ProductDetail from './shared/ProductDetail'
import SearchBar from './shared/SearchBar'

interface LayoutProps {
  initialContext?: OrderingContext
}

/**
 * Large horizontally-oriented self-service kiosk screen (entrance /
 * counter / food-court) — used standing, at arm's length, by an unassisted
 * customer.
 *
 * Layout: horizontal category tabs + searchbar above a wide product grid,
 * with a persistent right-side cart panel that shows order summary + payment
 * options. Clicking a product either adds it to cart directly (if
 * product_detail_enabled is false) or opens a detail modal (if enabled).
 * Checkout and status screens navigate via the screen state machine.
 */
function LandscapeKioskLayout({ initialContext }: LayoutProps) {
  const {
    context,
    menu,
    order,
    orderStatus,
    cart,
    loading,
    submitting,
    error,
    billRequested,
    payingOnline,
    paymentRequest,
    screen,
    detailItemCode,
    addToCart,
    decrementCart,
    submitCart,
    handleRequestBill,
    payOnline,
    resetSession,
    goToMenu,
    goToDetail,
    goToCart,
    goToCheckout,
    goToStatus,
    cartItems,
    cartCount,
    cartTotal,
  } = useOrderingSession(initialContext)

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  function handleReset() {
    if (window.confirm('Start a new order? Current cart will be cleared.')) {
      resetSession()
    }
  }

  // Idle-reset: device-bootstrapped kiosks re-bootstrap immediately from the
  // same device context on idle (resetSession reuses initialContext when
  // present); there's no separate device-vs-QR branch needed here because
  // resetSession already encodes that distinction.
  useIdleReset(resetSession, (context?.session_idle_timeout_minutes ?? 30) * 60000)

  // Build unique categories from menu
  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of menu) {
      const key = item.course
      if (key && !seen.has(key)) {
        seen.set(key, item.course_label ?? key)
      }
    }
    return Array.from(seen.entries()).map(([course, label]) => ({ course, course_label: label }))
  }, [menu])

  // Filter menu by category and search
  const visibleMenu = useMemo(() => {
    let filtered = menu

    // Filter by category
    if (selectedCategory !== null) {
      filtered = filtered.filter((item) => item.course === selectedCategory)
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.item_name.toLowerCase().includes(query) ||
          (item.course_label && item.course_label.toLowerCase().includes(query)),
      )
    }

    return filtered
  }, [menu, selectedCategory, searchQuery])

  // Find the detail product
  const detailProduct = useMemo(
    () => menu.find((item) => item.item === detailItemCode),
    [menu, detailItemCode],
  )

  function handleProductClick(itemCode: string) {
    const item = menu.find((i) => i.item === itemCode)
    if (!item) return

    // If product detail is not enabled, add to cart directly
    if (!context?.capabilities.product_detail_enabled) {
      addToCart(item)
      return
    }

    // Otherwise, open the detail screen
    goToDetail(itemCode)
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

  // Cart page
  if (screen === 'cart') {
    return (
      <div className="flex h-screen flex-col">
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
        <div className="flex-1">
          <CartPage
            cartItems={cartItems}
            cartCount={cartCount}
            cartTotal={cartTotal}
            onIncrement={addToCart}
            onDecrement={decrementCart}
            onBack={goToMenu}
            onCheckout={goToCheckout}
            className="h-full"
          />
        </div>
      </div>
    )
  }

  // Checkout screen
  if (screen === 'checkout') {
    return (
      <div className="flex h-screen flex-col">
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
        <div className="flex-1 overflow-y-auto">
          <CheckoutScreen
            capabilities={
              context?.capabilities || {
                customer_payment_enabled: false,
                pay_at_counter_enabled: false,
                request_bill_enabled: false,
              }
            }
            cartItems={cartItems}
            cartCount={cartCount}
            cartTotal={cartTotal}
            submitting={submitting}
            payingOnline={payingOnline}
            billRequested={billRequested}
            paymentRequest={paymentRequest}
            onSubmitCart={() => {
              submitCart().then((success) => {
                if (success) goToStatus()
              })
            }}
            onPayOnline={async () => {
              if (cartItems.length > 0 && !(await submitCart())) return
              payOnline()
            }}
            onRequestBill={handleRequestBill}
          />
        </div>
      </div>
    )
  }

  // Order status screen
  if (screen === 'status') {
    const isPickup = !context?.table
    return (
      <div className="flex h-screen flex-col">
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
        <div className="flex-1">
          <OrderStatusScreen
            status={orderStatus}
            isPickup={isPickup}
            pickupCode={order?.pickup_code ?? undefined}
            canAddMore={context?.capabilities.add_to_running_table_enabled ?? false}
            onAddMore={goToMenu}
            onDone={handleReset}
          />
        </div>
      </div>
    )
  }

  // Menu screen (default)
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

      {/* Category tabs + search bar */}
      <div className="flex-shrink-0 border-b bg-background/95 px-10 py-4">
        <div className="flex items-center gap-4">
          <CategoryTabs
            categories={categories}
            activeCourse={selectedCategory}
            onSelect={setSelectedCategory}
          />
        </div>
        <div className="mt-3 w-80">
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search menu..." />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-10">
          {/* Product detail modal overlay */}
          {screen === 'detail' && detailProduct && context ? (
            <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50">
              <div className="h-5/6 w-2/3 overflow-hidden rounded-lg bg-background shadow-lg">
                <ProductDetail
                  session={context.session}
                  itemCode={detailItemCode || ''}
                  menuItem={detailProduct}
                  onAddToCart={addToCart}
                  onBack={goToMenu}
                />
              </div>
            </div>
          ) : null}

          {/* Product grid */}
          <div className="grid grid-cols-4 gap-6 xl:grid-cols-5">
            {visibleMenu.map((item) => (
              <ProductCard
                key={item.item}
                item={item}
                cartQty={cart[item.item]?.qty ?? 0}
                showImage={context?.capabilities.show_item_images ?? false}
                onClick={() => handleProductClick(item.item)}
                cardClassName="flex flex-col overflow-hidden rounded-2xl border cursor-pointer text-left text-lg transition active:scale-[0.97]"
                imageClassName="h-40 w-full object-cover"
              />
            ))}
          </div>

          {visibleMenu.length === 0 && (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              {searchQuery ? 'No items match your search.' : 'No items available.'}
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
          onSubmit={goToCart}
          onRequestBill={handleRequestBill}
          onPayOnline={async () => {
            if (cartItems.length > 0 && !(await submitCart())) return
            payOnline()
          }}
          className="flex w-[420px] shrink-0 flex-col overflow-hidden border-l bg-background p-6 text-base"
        />
      </div>
    </div>
  )
}

export default LandscapeKioskLayout

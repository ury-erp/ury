import { useMemo, useState } from 'react'
import { useIdleReset } from '../hooks/useIdleReset'
import { useOrderingSession } from '../hooks/useOrderingSession'
import type { MenuItem, OrderingContext } from '../lib/api'
import SearchBar from './shared/SearchBar'
import ProductDetail from './shared/ProductDetail'
import CartPage from './shared/CartPage'
import CheckoutScreen from './shared/CheckoutScreen'
import OrderStatusScreen from './shared/OrderStatusScreen'

const ALL_CATEGORY = '__all__'

interface LayoutProps {
  initialContext?: OrderingContext
}

/**
 * Large vertically-oriented self-service kiosk (McDonald's/Burger King
 * format): a standing customer facing a tall public screen.
 *
 * Layout: a left category rail for quick filtering, a large tap-to-add
 * product grid in the main area, and a bottom cart bar.
 *
 * Cart design choice: the cart bar starts collapsed (just count/total) and
 * expands to the full item list + Place Order button when tapped, rather
 * than being always-expanded. On a tall portrait screen an always-expanded
 * cart would either eat a large fixed chunk of the browsing area or force
 * the product grid to reflow awkwardly as items are added; a collapsed bar
 * keeps the maximum screen real estate for browsing (the primary activity)
 * while staying persistent and within a standing customer's thumb reach at
 * the bottom of the screen.
 */
function PortraitKioskLayout({ initialContext }: LayoutProps) {
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
    addToCart,
    decrementCart,
    submitCart,
    handleRequestBill,
    payOnline,
    resetSession,
    cartItems,
    cartCount,
    cartTotal,
    screen,
    detailItemCode,
    goToMenu,
    goToDetail,
    goToCheckout,
    goToStatus,
  } = useOrderingSession(initialContext)

  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY)
  const [cartExpanded, setCartExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  function handleReset() {
    if (window.confirm('Start a new order? Current cart will be cleared.')) {
      resetSession()
    }
  }

  // Idle-reset: resetSession already re-bootstraps immediately for
  // device-bootstrapped kiosks and falls back to the QR "rescan" error state
  // for link-based sessions, so no separate device/QR branch is needed here.
  useIdleReset(resetSession, (context?.session_idle_timeout_minutes ?? 30) * 60000)

  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of menu) {
      const key = item.course ?? ALL_CATEGORY
      if (key === ALL_CATEGORY) continue
      if (!seen.has(key)) {
        seen.set(key, item.course_label ?? item.course ?? 'Other')
      }
    }
    return Array.from(seen.entries()).map(([course, label]) => ({ course, label }))
  }, [menu])

  const visibleMenu = useMemo(() => {
    let filtered = menu

    // Apply category filter
    if (selectedCategory !== ALL_CATEGORY) {
      filtered = filtered.filter((item) => (item.course ?? ALL_CATEGORY) === selectedCategory)
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.item_name.toLowerCase().includes(query) ||
          item.item?.toLowerCase().includes(query),
      )
    }

    return filtered
  }, [menu, selectedCategory, searchQuery])

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

  // Get the detail item if we're on the detail screen
  const detailItem = detailItemCode
    ? menu.find((item) => item.item === detailItemCode)
    : null

  // Determine if product detail is enabled
  const productDetailEnabled = context?.capabilities.product_detail_enabled ?? false

  // Handle product tap: either go to detail or add directly to cart
  function handleProductTap(item: MenuItem) {
    if (productDetailEnabled) {
      goToDetail(item.item)
    } else {
      addToCart(item)
    }
  }

  // Render different screens based on state
  if (screen === 'detail' && detailItem) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-6 py-4 backdrop-blur">
          <h1 className="text-2xl font-semibold">
            {context?.table ? `Table ${context.table}` : 'Order for Pickup'}
          </h1>
          <button
            onClick={handleReset}
            className="rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground"
          >
            New Order
          </button>
        </header>

        <ProductDetail
          session={context!.session}
          itemCode={detailItemCode!}
          menuItem={detailItem}
          onAddToCart={addToCart}
          onBack={goToMenu}
        />
      </div>
    )
  }

  if (screen === 'cart') {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-6 py-4 backdrop-blur">
          <h1 className="text-2xl font-semibold">
            {context?.table ? `Table ${context.table}` : 'Order for Pickup'}
          </h1>
          <button
            onClick={handleReset}
            className="rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground"
          >
            New Order
          </button>
        </header>

        <CartPage
          cartItems={cartItems}
          cartCount={cartCount}
          cartTotal={cartTotal}
          itemNotesEnabled={context?.capabilities.item_notes_enabled ?? false}
          onIncrement={addToCart}
          onDecrement={decrementCart}
          onBack={goToMenu}
          onCheckout={goToCheckout}
          className="flex-1"
        />
      </div>
    )
  }

  if (screen === 'checkout') {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-6 py-4 backdrop-blur">
          <h1 className="text-2xl font-semibold">
            {context?.table ? `Table ${context.table}` : 'Order for Pickup'}
          </h1>
          <button
            onClick={handleReset}
            className="rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground"
          >
            New Order
          </button>
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <CheckoutScreen
            capabilities={{
              customer_payment_enabled: context?.capabilities.customer_payment_enabled ?? false,
              pay_at_counter_enabled: context?.capabilities.pay_at_counter_enabled ?? false,
              request_bill_enabled: context?.capabilities.request_bill_enabled ?? false,
            }}
            cartItems={cartItems}
            cartCount={cartCount}
            cartTotal={cartTotal}
            submitting={submitting}
            payingOnline={payingOnline}
            billRequested={billRequested}
            paymentRequest={null}
            onSubmitCart={() => {
              submitCart()
              goToStatus()
            }}
            onPayOnline={payOnline}
            onRequestBill={handleRequestBill}
          />
        </div>
      </div>
    )
  }

  if (screen === 'status') {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-6 py-4 backdrop-blur">
          <h1 className="text-2xl font-semibold">
            {context?.table ? `Table ${context.table}` : 'Order for Pickup'}
          </h1>
          <button
            onClick={handleReset}
            className="rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground"
          >
            New Order
          </button>
        </header>

        <OrderStatusScreen
          status={orderStatus}
          isPickup={!context?.table}
          pickupCode={order?.pickup_code}
          canAddMore={context?.capabilities.add_to_running_table_enabled ?? false}
          onAddMore={goToMenu}
          onDone={handleReset}
        />
      </div>
    )
  }

  // Default: menu screen
  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-6 py-4 backdrop-blur">
        <h1 className="text-2xl font-semibold">
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
        <div className="mx-6 mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {order && order.items.length > 0 && (
        <section className="mx-6 mt-4 rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Your order so far</h2>
          <ul className="space-y-1 text-base">
            {order.items.map((row, idx) => (
              <li key={`${row.item_code}-${idx}`} className="flex justify-between">
                <span>{row.item_name} × {row.qty}</span>
                <span>{row.amount}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{order.grand_total}</span>
          </div>
        </section>
      )}

      <div className="flex flex-1 flex-col gap-4 px-6 pt-4">
        {/* Search bar and category rail */}
        <div className="flex gap-4">
          <div className="w-40 shrink-0">
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search..." />
          </div>
          <nav
            aria-label="Menu categories"
            className="flex flex-1 gap-2 self-start overflow-x-auto rounded-lg border p-2"
          >
            <button
              onClick={() => setSelectedCategory(ALL_CATEGORY)}
              className={`shrink-0 rounded-md px-3 py-3 text-left text-sm font-medium transition ${
                selectedCategory === ALL_CATEGORY
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              All Items
            </button>
            {categories.map((category) => (
              <button
                key={category.course}
                onClick={() => setSelectedCategory(category.course)}
                className={`shrink-0 rounded-md px-3 py-3 text-left text-sm font-medium transition ${
                  selectedCategory === category.course
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                {category.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Product grid */}
        <section className="grid flex-1 grid-cols-2 gap-4 self-start">
          {visibleMenu.map((item) => (
            <MenuCard
              key={item.item}
              item={item}
              qtyInCart={cart[item.item]?.qty ?? 0}
              showImage={context?.capabilities.show_item_images ?? false}
              onTap={() => handleProductTap(item)}
            />
          ))}
        </section>
      </div>

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background shadow-lg">
          {cartExpanded && (
            <div className="max-h-[50vh] overflow-y-auto border-b p-4">
              <ul className="space-y-2 text-base">
                {cartItems.map((entry) => (
                  <li key={entry.item.item} className="flex items-center justify-between">
                    <span>{entry.item.item_name}</span>
                    <span className="flex items-center gap-3">
                      <button
                        onClick={() => decrementCart(entry.item.item)}
                        className="h-8 w-8 rounded-full border text-base leading-none"
                        aria-label={`Remove one ${entry.item.item_name}`}
                      >
                        −
                      </button>
                      {entry.qty}
                      <button
                        onClick={() => addToCart(entry.item)}
                        className="h-8 w-8 rounded-full border text-base leading-none"
                        aria-label={`Add one more ${entry.item.item_name}`}
                      >
                        +
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 p-4">
            <button
              onClick={() => setCartExpanded((prev) => !prev)}
              className="flex flex-1 items-center justify-between rounded-md border px-4 py-3 text-left"
              aria-expanded={cartExpanded}
            >
              <span className="text-base font-semibold">
                {cartCount} item{cartCount > 1 ? 's' : ''}
              </span>
              <span className="text-base font-semibold">{cartTotal}</span>
            </button>
            <button
              onClick={goToCheckout}
              disabled={cartCount === 0}
              className="rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground disabled:opacity-50"
            >
              Checkout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuCard({
  item,
  qtyInCart,
  showImage,
  onTap,
}: {
  item: MenuItem
  qtyInCart: number
  showImage: boolean
  onTap: () => void
}) {
  return (
    <button
      onClick={onTap}
      className="flex flex-col overflow-hidden rounded-xl border text-left transition active:scale-[0.98]"
    >
      {showImage && item.item_image && (
        <img src={item.item_image} alt={item.item_name} className="h-48 w-full object-cover" />
      )}
      <div className="p-4">
        <div className="text-lg font-medium">{item.item_name}</div>
        <div className="mt-1 text-base text-muted-foreground">{item.rate}</div>
        {qtyInCart > 0 && (
          <div className="mt-2 text-sm font-semibold text-primary">In cart: {qtyInCart}</div>
        )}
      </div>
    </button>
  )
}

export default PortraitKioskLayout
